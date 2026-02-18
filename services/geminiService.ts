
import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem, TrainingExample } from "../types";
import { LOCATION_HIERARCHY, identifyItemType, ITEM_PATTERNS } from "../utils/constants";
import { getTrainingExamples } from "./firebaseService";

const API_KEY = process.env.API_KEY || '';
// Using gemini-3-flash-preview for high-speed, high-accuracy extraction
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-3-flash-preview';

const ai = new GoogleGenAI({ apiKey: API_KEY });

// --- UTILITY: Retry with Exponential Backoff & Timeout ---
async function generateContentWithRetry(params: any, retries = 2, timeoutMs = 35000): Promise<any> {
  const makeRequest = async () => {
      try {
          const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
          );

          const apiCall = ai.models.generateContent({
              model: MODEL_NAME,
              ...params
          });

          const response = await Promise.race([apiCall, timeoutPromise]);
          return response;
      } catch (error: any) {
          throw error;
      }
  };

  for (let i = 0; i <= retries; i++) {
      try {
          return await makeRequest();
      } catch (error: any) {
          const isRetryable = error.message.includes("429") || error.message.includes("503") || error.message.includes("timed out") || error.message.includes("Failed to fetch");
          if (i === retries || !isRetryable) throw error;
          
          const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
          console.warn(`Gemini API Attempt ${i + 1} failed. Retrying in ${Math.round(delay)}ms...`);
          await new Promise(res => setTimeout(res, delay));
      }
  }
}

const cleanStr = (val: any): string => {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (s.toLowerCase() === 'null') return '';
  return s;
};

const toTitleCase = (str: string) => {
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};

/**
 * Lightweight extraction for a single item (used for manual entry refinements).
 */
export const autofillItemData = async (
  description: string,
  customItemTypes?: any[],
  learnedContext?: string
): Promise<Partial<DPRItem>> => {
  const hierarchyString = Object.entries(LOCATION_HIERARCHY)
    .map(([loc, comps]) => `${loc} (Components: ${comps.join(', ')})`)
    .join('; ');

  const prompt = `
    Analyze this construction update: "${description}"
    
    TASK: Separate the "Where" (Structural ID) from the "What" (Activity).

    STRICT IDENTIFIER RULES:
    1. Look for specific structural parts (e.g., "Spiral Casing", "Unit 1", "Crown", "Invert", "Panel 1", "Slab A"). 
       - Put these in 'structuralElement'.
    2. Look for chainages (e.g., "CH 1200", "1200m"). 
       - Put these in 'chainage'.
    3. The 'activityDescription' should ONLY contain the work done (e.g., "Rebar works").
    4. Ensure 'quantity' and 'unit' are extracted accurately.

    Output ONLY JSON.
  `;

  try {
    const response = await generateContentWithRetry({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            location: { type: Type.STRING },
            component: { type: Type.STRING },
            structuralElement: { type: Type.STRING, description: "Specific structural part name." },
            chainage: { type: Type.STRING, description: "Chainage/Elevation." },
            quantity: { type: Type.NUMBER },
            unit: { type: Type.STRING },
            itemType: { type: Type.STRING },
            activityDescription: { type: Type.STRING, description: "Work description only." },
            plannedNextActivity: { type: Type.STRING }
          },
          required: ["quantity", "unit", "itemType", "activityDescription"]
        }
      }
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      return {
        location: toTitleCase(cleanStr(result.location)),
        component: toTitleCase(cleanStr(result.component)),
        structuralElement: toTitleCase(cleanStr(result.structuralElement)),
        chainage: cleanStr(result.chainage),
        quantity: result.quantity || 0,
        unit: cleanStr(result.unit) || "m3",
        itemType: cleanStr(result.itemType) || identifyItemType(description, customItemTypes),
        activityDescription: cleanStr(result.activityDescription),
        plannedNextActivity: cleanStr(result.plannedNextActivity)
      };
    }
  } catch (e) { console.error(e); }
  return { unit: 'm3', itemType: identifyItemType(description, customItemTypes) };
};

export const parseConstructionData = async (
  rawText: string,
  instructions?: string,
  contextLocations?: string[],
  contextComponents?: string[],
  customHierarchy?: Record<string, string[]>,
  customItemTypes?: any[]
): Promise<{ items: (Omit<DPRItem, 'id'> & { extractedDate?: string })[], warnings: string[] }> => {
  
  const hierarchyToUse = customHierarchy || LOCATION_HIERARCHY;
  const hierarchyString = Object.entries(hierarchyToUse)
    .map(([loc, comps]) => `- ${loc} > [${comps.join(', ')}]`)
    .join('\n    ');

  const prompt = `
    You are a high-precision construction data engine. Convert site notes into a structured JSON array of records.

    STRICT ATOMIC RULES:
    1. ONE QUANTITY = ONE RECORD:
       - If a sentence says "Rebar 3.5T and formworks 30sqm", you MUST return TWO separate items.
       - Never merge different item types or quantities into a single record.

    2. CONTEXT INHERITANCE (CRITICAL):
       - The input uses headers like "--- CONTEXT: Powerhouse > Main Building ---".
       - Every activity following a header MUST use that exact 'location' (Powerhouse) and 'component' (Main Building).
       - DO NOT leave 'component' blank if a header provides it.

    3. IDENTIFIER SEPARATION:
       - Subject (Structural Element): The specific part of the project (e.g., "Spiral Casing", "Unit 1", "Crown", "Invert", "Block A").
       - Action (Activity): What is being done (e.g., "Rebar works", "Concrete C25", "Excavation").
       - MAPPING: 
         - structuralElement = Subject
         - activityDescription = Action
       - Do NOT repeat the Subject inside the activityDescription.

    4. DATA TYPES:
       - quantity: Must be a number. Extract 3.5 from "3.5T", 30.0 from "30.0sqm".
       - unit: Standardize (sqm -> m2, cum -> m3, T/mt -> Ton).

    5. HIERARCHY:
    ${hierarchyString}

    RAW INPUT:
    """
    ${rawText}
    """
  `;

  try {
    const response = await generateContentWithRetry({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
             items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    extractedDate: { type: Type.STRING },
                    location: { type: Type.STRING, description: "The Main Location (e.g. Powerhouse) from context header." },
                    component: { type: Type.STRING, description: "The Project Component (e.g. Main Building) from context header." },
                    structuralElement: { type: Type.STRING, description: "Specific part like 'Spiral Casing Unit 1' or 'Crown'." },
                    chainage: { type: Type.STRING, description: "Chainage or Elevation if mentioned." },
                    activityDescription: { type: Type.STRING, description: "The specific work action (e.g. 'Rebar works')." },
                    plannedNextActivity: { type: Type.STRING },
                    quantity: { type: Type.NUMBER, description: "Extracted numeric value." },
                    unit: { type: Type.STRING, description: "Measurement unit." },
                    itemType: { type: Type.STRING, description: "Classification of work." }
                  },
                  required: ["location", "component", "activityDescription", "quantity", "unit"],
                },
             },
             warnings: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        },
      },
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      const unitMap: Record<string, string> = { 'sqm': 'm2', 'm2': 'm2', 'cum': 'm3', 'm3': 'm3', 'mt': 'Ton', 'ton': 'Ton', 'nos': 'nos', 'rm': 'rm', 't': 'Ton' };

      const processedItems = result.items.map((item: any) => {
          let desc = cleanStr(item.activityDescription);
          let type = cleanStr(item.itemType) || identifyItemType(desc, customItemTypes);
          let rawUnit = cleanStr(item.unit).toLowerCase();
          let finalUnit = unitMap[rawUnit] || cleanStr(item.unit) || "m3";
          let qty = item.quantity || 0;

          // Unit conversions
          if (rawUnit.includes('bag')) { qty = qty * 0.05; finalUnit = 'Ton'; }
          if (type === 'Rebar' || finalUnit === 'Ton') { qty = Math.round(qty * 100) / 100; }
          
          let loc = toTitleCase(cleanStr(item.location) || "Unclassified");
          let comp = toTitleCase(cleanStr(item.component) || "");
          
          let structuralElement = toTitleCase(cleanStr(item.structuralElement));
          let chainage = cleanStr(item.chainage);

          const forbidden = ['not specified', 'unknown', 'n/a', 'undefined', 'null', 'select...'];
          if (forbidden.some(f => chainage.toLowerCase().includes(f))) chainage = '';
          if (forbidden.some(f => structuralElement.toLowerCase().includes(f))) structuralElement = '';

          return {
              extractedDate: cleanStr(item.extractedDate),
              location: loc,
              component: comp,
              structuralElement: structuralElement,
              chainage: chainage,
              chainageOrArea: `${chainage} ${structuralElement}`.trim(),
              activityDescription: desc,
              plannedNextActivity: cleanStr(item.plannedNextActivity) || "Continue works",
              quantity: qty,
              unit: finalUnit,
              itemType: type
          };
      });

      return { items: processedItems, warnings: result.warnings || [] };
    }
    return { items: [], warnings: [] };
  } catch (error) {
    console.error("AI Parsing Error:", error);
    throw error;
  }
};
