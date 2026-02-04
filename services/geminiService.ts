
import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem, TrainingExample } from "../types";
import { LOCATION_HIERARCHY, identifyItemType, ITEM_PATTERNS } from "../utils/constants";
import { getTrainingExamples } from "./firebaseService";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to safely clean strings from AI response
const cleanStr = (val: any): string => {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (s.toLowerCase() === 'null') return '';
  return s;
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

  const prompt = `
    Act as a construction data specialist. Analyze this activity description: "${description}"
    
    ${learnedContext ? `GOLD STANDARD EXAMPLES (Follow these user-verified mappings exactly):\n${learnedContext}\n` : ''}

    Your task is to extract the quantity, unit, item classification, and any planned next activity.
    
    STRICT RULES:
    1. HIERARCHY MAPPING:
       - Map parts to parent structures (Barrage, Weir, Stilling Basin).
       - IMPORTANT: For Tunneling, the 'location' must be "Headrace Tunnel (HRT)". 
       - If you see "Inlet" or "Adit", set 'location' to "Headrace Tunnel (HRT)" and 'component' to "HRT from Inlet" or "HRT from Adit".
    
    2. QUANTITY & UNIT:
       - **CONCRETE**: If description has linear dimensions (e.g. 40m) AND volume (e.g. 24m3), **ALWAYS EXTRACT THE VOLUME (24)** as the quantity. Ignore the linear dimension.
       - **REBAR**: Always use "Ton". If text is in kg, divide by 1000. Round to 2 decimal places.
       - **FORMWORK**: Default to "rm" (running meters). Do not use "m2" unless explicitly stated.
       - UNIT MAPPING: "sqm" -> "m2", "cum" -> "m3", "mt" -> "Ton".
    
    3. CLASSIFICATION: 
       - Choose from: ${itemTypesString}.
       - "M25", "Grade 25", "M-25", "Lining" -> "C25 Concrete"
       - "Concrete", "Conc", "RCC" (without specified grade) -> "C25 Concrete"
       - "Formworks", "Shuttering" -> "Formwork"

    4. NEXT PLAN EXTRACTION:
       - If the text includes "next plan", "next day", "tomorrow", "planning" etc., extract that text into 'plannedNextActivity'.
       - **REMOVE** this planning text from the 'activityDescription'.

    Output ONLY a valid JSON object.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
      
      const finalUnit = unitMap[cleanStr(result.unit).toLowerCase()] || cleanStr(result.unit) || "m3";
      let finalQty = result.quantity || 0;

      // Force Rounding for Rebar
      if (result.itemType === 'Rebar' || finalUnit === 'Ton') {
          finalQty = Math.round(finalQty * 100) / 100;
      }
      
      return {
        location: cleanStr(result.location),
        component: cleanStr(result.component),
        structuralElement: cleanStr(result.structuralElement),
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

  const prompt = `
    You are a high-precision construction site data extraction engine.
    Convert raw site update text into a structured JSON array.

    STRICT ATOMIC RULES:
    1. **SPLIT AGGRESSIVELY**: Every distinct activity or material must be its own record. 

    2. **HRT HIERARCHY RULE**: 
       - "HRT from Inlet" and "HRT from Adit" are **COMPONENTS**, not Locations.
       - Their 'location' must ALWAYS be "Headrace Tunnel (HRT)".

    3. **BULK MODE (DATE EXTRACTION)**:
       - If a row contains a date (e.g. 08/11/2025, 2026-01-22), extract it as 'extractedDate' in YYYY-MM-DD format.
       - If no date is found, leave 'extractedDate' null.

    4. **UNIT STANDARDIZATION**:
       - Convert "kg" to "Ton" (value / 1000). Round to 2 decimal places.
       - **CONCRETE**: Use volume (m3) for quantity. Ignore linear dimensions if volume is present.
       - **FORMWORK**: Default unit "rm".

    5. **ITEM TYPING**:
       - PRIORITIZE these types: ${itemTypeContext}
       - Map "M25", "Concrete", "RCC", "Lining" -> "C25 Concrete".
       - Map "Shuttering", "Formworks" -> "Formwork".

    6. **CLEANUP**: Remove planning text ("next day", "tomorrow") from 'activityDescription' and move to 'plannedNextActivity'.

    RAW INPUT:
    """
    ${rawText}
    """
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
          const finalUnit = unitMap[cleanStr(item.unit).toLowerCase()] || cleanStr(item.unit) || "m3";
          let qty = item.quantity || 0;

          if (type === 'Rebar' || finalUnit === 'Ton') {
               qty = Math.round(qty * 100) / 100;
          }
          
          let loc = cleanStr(item.location) || contextLocations?.[0] || "Unclassified";
          let comp = cleanStr(item.component) || contextComponents?.[0] || "";
          
          if (loc === "HRT from Inlet" || loc === "HRT from Adit") {
              comp = loc;
              loc = "Headrace Tunnel (HRT)";
          }

          const structuralElement = cleanStr(item.structuralElement);
          const chainage = cleanStr(item.chainage);

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
