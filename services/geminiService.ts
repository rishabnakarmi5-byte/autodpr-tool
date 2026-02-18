
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
  const prompt = `
    Analyze: "${description}"
    
    TASK: Separate "Where" (Structural ID) from "What" (Activity).

    STRICT RULES:
    1. structuralElement: Specific part name (e.g., "Spiral Casing Unit 1", "Crown").
    2. activityDescription: MUST follow format "Action (Quantity Unit)". 
       Example: "C35 Concrete works (5 m3)".
       - IMPORTANT: Always include grades (C35, C25, M20) if present.
    3. Ensure 'quantity' and 'unit' are numeric/standardized.

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
            structuralElement: { type: Type.STRING },
            chainage: { type: Type.STRING },
            quantity: { type: Type.NUMBER },
            unit: { type: Type.STRING },
            itemType: { type: Type.STRING },
            activityDescription: { type: Type.STRING },
            plannedNextActivity: { type: Type.STRING }
          },
          required: ["quantity", "unit", "itemType", "activityDescription"]
        }
      }
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      const desc = cleanStr(result.activityDescription);
      return {
        location: toTitleCase(cleanStr(result.location)),
        component: toTitleCase(cleanStr(result.component)),
        structuralElement: toTitleCase(cleanStr(result.structuralElement)),
        chainage: cleanStr(result.chainage),
        quantity: result.quantity || 0,
        unit: cleanStr(result.unit) || "m3",
        itemType: identifyItemType(desc, customItemTypes), 
        activityDescription: desc,
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
    You are a high-precision construction data engine. Convert site notes into structured JSON records.

    STRICT ATOMIC RULES:
    1. MULTI-ACTIVITY SPLIT:
       - If a sentence has multiple quantities (e.g. "Rebar 3.5T and formwork 30sqm"), return TWO separate items.

    2. CONTEXT INHERITANCE:
       - Headers "--- CONTEXT: Location > Component ---" apply to ALL following text until the next header.
       - IMPORTANT: Match 'location' and 'component' to the Provided HIERARCHY exactly, even if partial words are used in the text.

    3. DESCRIPTION FORMAT (CRITICAL):
       - 'activityDescription' MUST be: "Action (Quantity Unit)".
       - IMPORTANT: YOU MUST INCLUDE SPECIFIC GRADES (e.g. C35, C25, M15) OR SPECIFICATIONS (e.g. TMT, Plum) in the description.
       - DO NOT simplify "c35 concrete" to just "concrete".
       - DO NOT put the structure name (e.g. Spiral Casing) in the activityDescription.
       - Put the structure name in 'structuralElement'.

    4. DATA MAPPING:
       - quantity: numeric only.
       - unit: standardized (m3, m2, Ton, nos, rm).

    5. HIERARCHY REFERENCE:
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
                    location: { type: Type.STRING },
                    component: { type: Type.STRING },
                    structuralElement: { type: Type.STRING },
                    chainage: { type: Type.STRING },
                    activityDescription: { type: Type.STRING, description: "Format: Action (Quantity Unit). Include Grade!" },
                    plannedNextActivity: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    itemType: { type: Type.STRING }
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
          let rawUnit = cleanStr(item.unit).toLowerCase();
          let finalUnit = unitMap[rawUnit] || cleanStr(item.unit) || "m3";
          let qty = item.quantity || 0;
          
          let rawLoc = cleanStr(item.location);
          let rawComp = cleanStr(item.component);

          // SAFE HIERARCHY MAPPING (Case-Insensitive)
          let loc = rawLoc;
          let comp = rawComp;

          const foundLocKey = Object.keys(hierarchyToUse).find(l => l.toLowerCase() === rawLoc.toLowerCase() || rawLoc.toLowerCase().includes(l.toLowerCase()));
          if (foundLocKey) {
              loc = foundLocKey;
              const foundCompKey = hierarchyToUse[foundLocKey].find(c => {
                  const cLower = c.toLowerCase();
                  const rLower = rawComp.toLowerCase();
                  return cLower === rLower || rLower.includes(cLower) || cLower.includes(rLower);
              });
              if (foundCompKey) comp = foundCompKey;
          }

          let structuralElement = toTitleCase(cleanStr(item.structuralElement));
          let chainage = cleanStr(item.chainage);

          // Force activityDescription format: "Action (Quantity Unit)"
          let desc = cleanStr(item.activityDescription);
          const qtyString = `(${qty} ${finalUnit})`;
          
          // If description doesn't have the quantity tag, or we need to normalize it
          if (!desc.includes(qtyString)) {
              const cleanDesc = desc.replace(/[\(]?\d+(\.\d+)?\s*(ton|mt|t|m3|m2|cum|sqm|nos|rm)[\)]?/gi, '').replace(/\s*=\s*/g, '').trim();
              desc = `${cleanDesc} ${qtyString}`;
          }

          // CRITICAL: Re-classify based on description to ensure exact match with internal Canonical names
          let type = identifyItemType(desc, customItemTypes);

          // Unit conversions for specific types
          if (rawUnit.includes('bag')) { qty = qty * 0.05; finalUnit = 'Ton'; }
          if (type === 'Rebar' || finalUnit === 'Ton') { qty = Math.round(qty * 100) / 100; }

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
