
import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem, TrainingExample } from "../types";
import { LOCATION_HIERARCHY, identifyItemType, ITEM_PATTERNS } from "../utils/constants";
import { getTrainingExamples } from "./firebaseService";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getMoodMessage = async (mood: string, userName: string): Promise<string> => {
  const prompt = `
    You are a supportive assistant for a Construction Manager named ${userName}.
    The user just reported feeling "${mood}".
    Generate a short, 1-sentence response.
  `;

  try {
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
    });
    return response.text || "Keep building strong!";
  } catch (error) {
    return "Keep up the great work!";
  }
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

    Your task is to extract the quantity, unit, and item classification.
    
    STRICT RULES:
    1. HIERARCHY MAPPING:
       - Map parts to parent structures (Barrage, Weir, Stilling Basin).
    
    2. QUANTITY & UNIT:
       - Extract numeric values precisely.
       - UNIT MAPPING: "sqm" -> "m2", "cum" -> "m3", "mt" -> "Ton", "kg" -> "Ton" (divide kg by 1000).
       - If no unit is found, default to "m3".
    
    3. CLASSIFICATION: Choose from: ${itemTypesString}.

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
            itemType: { type: Type.STRING }
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
      
      const finalUnit = unitMap[result.unit?.toLowerCase()] || "m3";
      
      return {
        location: result.location,
        component: result.component,
        structuralElement: result.structuralElement,
        quantity: result.quantity || 0,
        unit: finalUnit,
        itemType: result.itemType || identifyItemType(description, customItemTypes)
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
): Promise<{ items: Omit<DPRItem, 'id'>[], warnings: string[] }> => {
  
  const hierarchyToUse = customHierarchy || LOCATION_HIERARCHY;
  const itemTypesToUse = customItemTypes || ITEM_PATTERNS.map(p => ({
      name: p.name,
      pattern: p.pattern.toString().slice(1, -2),
      defaultUnit: p.defaultUnit
  }));

  const prompt = `
    You are a high-precision construction site data extraction engine.
    Convert raw site update text into a structured JSON array.

    STRICT ATOMIC RULES:
    1. ONE RECORD PER ACTIVITY: If an input mentions multiple materials or activities (e.g., "Rebar AND Concrete" or "M35 concrete AND formwork"), you MUST create TWO separate items in the JSON array.
    2. NO META-TALK: NEVER include explanations like "kg to Ton conversion applied" or "mapped for clarity" in any text field. Keep 'activityDescription' purely about the site work.
    3. COMPONENT FALLBACKS:
       - If an activity belongs to "Headworks" but no specific component matches, use "Other Headworks".
       - If it belongs to "Headrace Tunnel (HRT)", use "Other HRT Works".
       - Map specific items like "Weir" or "Syphon" or "Undersluice" to the 'component' field if they appear in the hierarchy or context.
    4. UNIT CONVERSION:
       - If user provides "kg", convert to "Ton" (value / 1000) for the 'quantity' field. Set unit to "Ton".
       - Standardize: "sqm" -> "m2", "cum" -> "m3".
    5. PLANNED NEXT ACTIVITY: Always infer a short next step (e.g. "Concreting", "Curing", "Mucking").

    HIERARCHY REFERENCE:
    ${JSON.stringify(hierarchyToUse)}

    CONTEXT:
    Locations: ${contextLocations?.join(', ') || 'None'}
    Components: ${contextComponents?.join(', ') || 'None'}

    ${instructions ? `USER SPECIFIC INSTRUCTIONS: ${instructions}` : ''}

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
          let desc = item.activityDescription || "";
          const type = item.itemType && item.itemType !== "Other" ? item.itemType : identifyItemType(desc, customItemTypes);
          const finalUnit = unitMap[item.unit?.toLowerCase()] || item.unit || "m3";
          const qty = item.quantity || 0;
          
          return {
              location: item.location || contextLocations?.[0] || "Unclassified",
              component: item.component || contextComponents?.[0] || "",
              structuralElement: item.structuralElement || "",
              chainage: item.chainage || "",
              chainageOrArea: `${item.chainage || ''} ${item.structuralElement || ''}`.trim(),
              activityDescription: desc,
              plannedNextActivity: item.plannedNextActivity || "Continue works",
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
