
import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem, TrainingExample } from "../types";
import { LOCATION_HIERARCHY, identifyItemType, ITEM_PATTERNS } from "../utils/constants";
import { getTrainingExamples } from "./firebaseService";

const API_KEY = process.env.API_KEY || '';
// Using Gemini 2.0 Flash Lite Preview for high speed and better reasoning on structured data
const MODEL_NAME = 'gemini-2.0-flash-lite-preview-02-05';

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
 * Lightweight extraction for a single item.
 */
export const autofillItemData = async (
  description: string,
  customItemTypes?: any[],
  learnedContext?: string
): Promise<Partial<DPRItem>> => {
  const itemTypesToUse = customItemTypes || ITEM_PATTERNS.map(p => ({
      name: p.name,
      pattern: p.pattern.toString().slice(1, -2),
      defaultUnit: p.defaultUnit
  }));

  const itemTypesString = itemTypesToUse.map(t => `"${t.name}"`).join(', ');
  const hierarchyString = Object.entries(LOCATION_HIERARCHY)
    .map(([loc, comps]) => `${loc} (Components: ${comps.join(', ')})`)
    .join('; ');

  const prompt = `
    Act as a construction data specialist. Analyze: "${description}"
    
    ${learnedContext ? `VERIFIED MAPPINGS:\n${learnedContext}\n` : ''}

    STRICT RULES:
    1. IDENTIFIER EXTRACTION:
       - Look for Area/Structure identifiers like "Panel 1", "Slab 2", "Block A", "Unit 1", "Base", "Top Slab", "Pier 4", "Pipe 28.7".
       - These MUST be placed in 'structuralElement'.
       - Look for Chainage (e.g., "CH 1200", "1200m") or Elevation (e.g., "EL 1400", "1400m").
       - These MUST be placed in 'chainage'.
       - If both exist (e.g., "Panel 1 EL 1400"), put "Panel 1" in structuralElement and "EL 1400" in chainage.

    2. HIERARCHY MAPPING:
       - Known Hierarchy: ${hierarchyString}
       - Map Barrage -> Headworks, Powerhouse -> Powerhouse, etc.

    3. NEXT PLAN LOGIC:
       - Rebar -> "Formwork & Preparation"
       - Formwork -> "Concrete works"
       - Concrete -> "Deshuttering & Curing"
    
    Output ONLY valid JSON.
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
            plannedNextActivity: { type: Type.STRING }
          },
          required: ["quantity", "unit", "itemType"]
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
  const itemTypesToUse = customItemTypes || ITEM_PATTERNS;
  const itemTypeContext = itemTypesToUse.map(t => `${t.name} (keywords: ${t.pattern.toString()})`).join(', ');

  const hierarchyString = Object.entries(hierarchyToUse)
    .map(([loc, comps]) => `- ${loc} contains components: [${comps.join(', ')}]`)
    .join('\n    ');

  // Hard context logic: If user selected exactly one component, we frame the prompt around it.
  const isForcedContext = contextLocations?.length === 1 && contextComponents?.length === 1;
  const forcedContextString = isForcedContext 
    ? `IMPORTANT: This data is explicitly for Location: "${contextLocations[0]}" and Component: "${contextComponents[0]}". Map everything to this context unless the text clearly identifies another structure.`
    : "";

  const prompt = `
    You are a high-precision construction data engine. Convert site update text into a structured JSON array.

    ${forcedContextString}

    STRICT ATOMIC RULES:
    1. IDENTIFIER SEPARATION (CRITICAL):
       - Separate Identifiers from the Activity. 
       - IDENTIFIERS (Store in 'structuralElement' or 'chainage'): "Panel 1", "Slab 2", "Block A", "Unit 1", "Base", "Top Slab", "Pier 4", "EL 1450", "CH 200+50", "Portion 3", "28.7m Pipe".
       - Example: "Panel 1 end sill concrete 75m3" 
         -> location: "Headworks", component: "Barrage", structuralElement: "Panel 1", activityDescription: "End sill concrete works (75 m3)", quantity: 75, unit: "m3".

    2. HIERARCHY:
    ${hierarchyString}
       - If a component like "Barrage" is mentioned, set location to "Headworks".

    3. UNIT STANDARDIZATION:
       - Convert kg to Ton (val/1000). Convert bags to Ton (val*0.05). 
       - Formwork -> "m2". Concrete -> "m3". Rebar -> "Ton".

    4. NEXT PLAN LOGIC:
       - Infer based on stage: Rebar -> Formwork -> Concrete -> Deshuttering.

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
                    activityDescription: { type: Type.STRING },
                    plannedNextActivity: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    itemType: { type: Type.STRING }
                  },
                  required: ["location", "activityDescription", "unit"],
                },
             },
             warnings: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        },
      },
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      const unitMap: Record<string, string> = { 'sqm': 'm2', 'm2': 'm2', 'cum': 'm3', 'm3': 'm3', 'mt': 'Ton', 'ton': 'Ton', 'nos': 'nos', 'rm': 'rm' };

      const processedItems = result.items.map((item: any) => {
          let desc = cleanStr(item.activityDescription);
          let type = cleanStr(item.itemType) || identifyItemType(desc, customItemTypes);
          let finalUnit = unitMap[cleanStr(item.unit).toLowerCase()] || cleanStr(item.unit) || "m3";
          let qty = item.quantity || 0;

          if (finalUnit.toLowerCase().includes('bag')) { qty = qty * 0.05; finalUnit = 'Ton'; }
          if (type === 'Rebar' || finalUnit === 'Ton') { qty = Math.round(qty * 100) / 100; }
          
          let loc = toTitleCase(cleanStr(item.location) || contextLocations?.[0] || "Unclassified");
          let comp = toTitleCase(cleanStr(item.component) || contextComponents?.[0] || "");
          
          let structuralElement = toTitleCase(cleanStr(item.structuralElement));
          let chainage = cleanStr(item.chainage);

          const forbidden = ['not specified', 'unknown', 'n/a', 'undefined'];
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
