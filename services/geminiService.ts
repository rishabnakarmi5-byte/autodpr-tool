

import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem, TrainingExample } from "../types";
import { LOCATION_HIERARCHY, identifyItemType, ITEM_PATTERNS } from "../utils/constants";
import { getTrainingExamples } from "./firebaseService";

const API_KEY = process.env.API_KEY || '';
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-2.0-flash'; // Use 2.0-flash as default

const ai = new GoogleGenAI({ apiKey: API_KEY });

// --- UTILITY: Retry with Exponential Backoff & Timeout ---
async function generateContentWithRetry(params: any, retries = 2, timeoutMs = 35000): Promise<any> {
  const makeRequest = async () => {
      try {
          // Create a timeout promise
          const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
          );

          // Race the API call against the timeout
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

// Helper to safely clean strings from AI response
const cleanStr = (val: any): string => {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (s.toLowerCase() === 'null') return '';
  return s;
};

// Helper for Title Case
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
  
  // Flatten hierarchy for context
  const hierarchyString = Object.entries(LOCATION_HIERARCHY)
    .map(([loc, comps]) => `${loc} (Components: ${comps.join(', ')})`)
    .join('; ');

  const prompt = `
    Act as a construction data specialist. Analyze this activity description: "${description}"
    
    ${learnedContext ? `GOLD STANDARD EXAMPLES (Follow these user-verified mappings exactly):\n${learnedContext}\n` : ''}

    Your task is to extract the quantity, unit, item classification, and any planned next activity.
    
    STRICT RULES:
    1. HIERARCHY MAPPING:
       - Known Hierarchy: ${hierarchyString}
       - Map parts to parent structures (e.g. Barrage -> Headworks).
       - IMPORTANT: For Tunneling, the 'location' must be "Headrace Tunnel (HRT)". 
       - If you see "Inlet" or "Adit", set 'location' to "Headrace Tunnel (HRT)" and 'component' to "HRT from Inlet" or "HRT from Adit".
    
    2. QUANTITY & UNIT:
       - **CONCRETE**: If description has linear dimensions (e.g. 40m) AND volume (e.g. 24m3), **ALWAYS EXTRACT THE VOLUME (24)** as the quantity. Ignore the linear dimension.
       - **REBAR**: Always use "Ton". If text is in kg, divide by 1000. Round to 2 decimal places.
       - **GROUTING/CEMENT**: If unit is "bags", 1 bag = 50kg = 0.05 Ton. Convert to Ton.
       - **FORMWORK**: Default to "m2" (square meters). Only use "rm" if explicitly stated as "running meter" or "rm".
       - UNIT MAPPING: "sqm" -> "m2", "cum" -> "m3", "mt" -> "Ton".
    
    3. CLASSIFICATION: 
       - Choose from: ${itemTypesString}.
       - "M25", "Grade 25", "M-25", "Lining" -> "C25 Concrete"
       - "Concrete", "Conc", "RCC" (without specified grade) -> "C25 Concrete"
       - "Formworks", "Shuttering" -> "Formwork"

    4. LOCATION DETAIL (Chainage/Area/EL):
       - **HEADWORKS**: Look for "EL" (Elevation) values (e.g. "EL 1400", "1400m"). This is critical for Headworks.
       - **TUNNELS**: Look for "Ch" (Chainage).
       - If NO detail is found, return empty string. **NEVER** return "Not specified" or "Unknown".

    5. NEXT PLAN EXTRACTION:
       - **LOGIC**:
         - Rebar -> "Formwork & Preparation"
         - Formwork -> "Concrete works"
         - Concrete -> "Deshuttering & Curing"
         - PCC -> "RCC works"
         - Grouting -> "Next stage drilling/grouting"
       - If the text explicitly says "next plan", "next day", "tomorrow", "planning" etc., use that. Otherwise use the Logic above.
       - **REMOVE** this planning text from the 'activityDescription'.

    Output ONLY a valid JSON object.
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
      const unitMap: Record<string, string> = {
          'sqm': 'm2', 'm2': 'm2', 'cum': 'm3', 'm3': 'm3', 'mt': 'Ton', 'ton': 'Ton', 'nos': 'nos', 'rm': 'rm'
      };
      
      let finalUnit = unitMap[cleanStr(result.unit).toLowerCase()] || cleanStr(result.unit) || "m3";
      let finalQty = result.quantity || 0;

      // Handle Bags to Ton conversion if the AI missed the calculation but caught the unit
      if (finalUnit.toLowerCase().includes('bag')) {
          finalQty = finalQty * 0.05;
          finalUnit = 'Ton';
      }

      // Force Rounding for Rebar
      if (result.itemType === 'Rebar' || finalUnit === 'Ton') {
          finalQty = Math.round(finalQty * 100) / 100;
      }

      let structuralElement = toTitleCase(cleanStr(result.structuralElement));
      // Cleanup placeholder text
      if (structuralElement.toLowerCase().includes('not specified')) structuralElement = '';
      
      return {
        location: toTitleCase(cleanStr(result.location)),
        component: toTitleCase(cleanStr(result.component)),
        structuralElement: structuralElement,
        quantity: finalQty,
        unit: finalUnit,
        itemType: cleanStr(result.itemType) || identifyItemType(description, customItemTypes),
        plannedNextActivity: cleanStr(result.plannedNextActivity)
      };
    }
  } catch (e) {
    console.error("Autofill error:", e);
  }
  
  return {
    unit: 'm3',
    itemType: identifyItemType(description, customItemTypes)
  };
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
  
  // Format custom item types for the prompt to ensure AI sees "Soling" etc.
  const itemTypesToUse = customItemTypes || ITEM_PATTERNS;
  const itemTypeContext = itemTypesToUse.map(t => `${t.name} (keywords: ${t.pattern.toString()})`).join(', ');

  // Flatten hierarchy for prompt to guide location inference
  const hierarchyString = Object.entries(hierarchyToUse)
    .map(([loc, comps]) => `- ${loc} contains components: [${comps.join(', ')}]`)
    .join('\n    ');

  const prompt = `
    You are a high-precision construction site data extraction engine.
    Convert raw site update text into a structured JSON array.

    STRICT ATOMIC RULES:
    1. **SPLIT AGGRESSIVELY**: Every distinct activity or material must be its own record. 

    2. **HIERARCHY & LOCATION INFERENCE**: 
       - Use this hierarchy to correctly map Components to Locations:
    ${hierarchyString}
       - **CRITICAL**: If the text contains a known component (e.g. "Barrage", "Intake", "Powerhouse"), FORCE the 'location' to its parent from the list above (e.g. "Headworks").
       - "HRT from Inlet" and "HRT from Adit" -> Location "Headrace Tunnel (HRT)".
       - **FORMATTING**: Always capitalize first letters of Structure and Component (e.g. "Wall", "Invert").

    3. **BULK MODE (DATE EXTRACTION)**:
       - If a row contains a date (e.g. 08/11/2025, 2026-01-22), extract it as 'extractedDate' in YYYY-MM-DD format.
       - If no date is found, leave 'extractedDate' null.

    4. **UNIT STANDARDIZATION**:
       - Convert "kg" to "Ton" (value / 1000). 
       - **BAGS to TON**: 1 Bag = 50kg = 0.05 Ton. If unit is bags, output quantity * 0.05 and unit "Ton".
       - **CONCRETE**: Use volume (m3) for quantity. Ignore linear dimensions if volume is present.
       - **FORMWORK**: Default unit "m2" (Square Meter). DO NOT use "rm" unless the text explicitly says "running meter" or "rm".

    5. **ITEM TYPING**:
       - PRIORITIZE these types: ${itemTypeContext}
       - Map "M25", "Concrete", "RCC", "Lining" -> "C25 Concrete".
       - Map "Shuttering", "Formworks" -> "Formwork".

    6. **LOCATION SPECIFICS (Area / Chainage / EL)**:
       - **HEADWORKS**: You MUST look for **Elevation (EL)** levels (e.g. "EL 1345.50", "1340"). This is the correct identifier for Headworks, NOT Chainage.
       - **TUNNELS**: Look for **Chainage (CH)** (e.g. "Ch 1200+50", "1200m").
       - **IMPORTANT**: If the specific Area/Chainage/EL is not explicitly mentioned, return an empty string for 'chainage' and 'structuralElement'. 
       - **FORBIDDEN**: Do NOT output "Not specified", "Unknown", or "N/A". Leave it empty.

    7. **NEXT PLAN LOGIC**:
       - If explicit plan exists (e.g. "next day concreting"), use it.
       - ELSE INFER:
         * Rebar -> "Formwork & Prep"
         * Formwork -> "Concrete works"
         * Concrete -> "Deshuttering & Curing"
         * PCC -> "RCC works"
         * Grouting -> "Next stage grouting"
       - Remove planning text from 'activityDescription'.

    8. **DESCRIPTION**: 
       - Append the quantity to the description, e.g. "Wall concreting works (113 m3)".

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
      const unitMap: Record<string, string> = {
          'sqm': 'm2', 'm2': 'm2', 'cum': 'm3', 'm3': 'm3', 'mt': 'Ton', 'ton': 'Ton', 'nos': 'nos', 'rm': 'rm'
      };

      const processedItems = result.items.map((item: any) => {
          let desc = cleanStr(item.activityDescription);
          let type = cleanStr(item.itemType) || identifyItemType(desc, customItemTypes);
          let finalUnit = unitMap[cleanStr(item.unit).toLowerCase()] || cleanStr(item.unit) || "m3";
          let qty = item.quantity || 0;

          // Double check Bags to Ton in post-processing
          if (finalUnit.toLowerCase().includes('bag') || cleanStr(item.unit).toLowerCase().includes('bag')) {
             qty = qty * 0.05;
             finalUnit = 'Ton';
          }

          if (type === 'Rebar' || finalUnit === 'Ton') {
               qty = Math.round(qty * 100) / 100;
          }
          
          let loc = toTitleCase(cleanStr(item.location) || contextLocations?.[0] || "Unclassified");
          let comp = toTitleCase(cleanStr(item.component) || contextComponents?.[0] || "");
          
          if (loc === "HRT from Inlet" || loc === "HRT from Adit") {
              comp = loc;
              loc = "Headrace Tunnel (HRT)";
          }

          let structuralElement = toTitleCase(cleanStr(item.structuralElement));
          let chainage = cleanStr(item.chainage);

          // CLEANUP: Strict removal of 'Not specified' placeholders
          const forbidden = ['not specified', 'unknown', 'n/a'];
          if (forbidden.some(f => chainage.toLowerCase().includes(f))) chainage = '';
          if (forbidden.some(f => structuralElement.toLowerCase().includes(f))) structuralElement = '';
          
          // Redundancy check: If Structure is same as Component, and no other info, clear Structure to avoid repetition
          if (structuralElement.toLowerCase() === comp.toLowerCase()) {
              structuralElement = '';
          }

          // Validate date format YYYY-MM-DD
          let validDate = cleanStr(item.extractedDate);
          if (validDate && !/^\d{4}-\d{2}-\d{2}$/.test(validDate)) {
             validDate = undefined; // Invalid format, let system fallback to current date
          }

          return {
              extractedDate: validDate,
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