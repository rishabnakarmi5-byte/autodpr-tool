
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
 * Now supports 'learnedContext' to maintain consistency with previous user edits.
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
       - Extract numeric values precisely (e.g., "0.458", "9.15").
       - UNIT MAPPING: "sqm" -> "m2", "cum" -> "m3", "mt" -> "Ton".
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
          'sqm': 'm2', 'm2': 'm2', 'cum': 'm3', 'm3': 'm3', 'mt': 'Ton', 'ton': 'Ton', 'tons': 'Ton', 'nos': 'nos', 'rm': 'rm'
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

  let trainingExamplesText = "";
  try {
    const examples = await getTrainingExamples();
    if (examples.length > 0) {
      trainingExamplesText = "\nFOLLOW THESE USER-PROVIDED EXAMPLES (FEW-SHOT LEARNING):\n" + 
        examples.slice(0, 10).map(ex => `INPUT: "${ex.rawInput}"\nEXPECTED OUTPUT: ${ex.expectedOutput}`).join('\n\n');
    }
  } catch (e) {
    console.warn("Could not load training examples for AI prompt.");
  }

  const prompt = `
    You are a construction site data extraction engine.
    Convert raw site update text into a structured JSON array.

    ${instructions ? `USER SPECIFIC INSTRUCTIONS: ${instructions}` : ''}
    ${trainingExamplesText}

    ---------------------------------------------------------
    STRICT EXTRACTION RULES:
    1. QUANTITY & UNITS: 
       - "sqm" or "m2" MUST be unit "m2".
       - "cum" or "m3" MUST be unit "m3".
       - "mt" or "ton" MUST be unit "Ton".
       - If unit is missing, use "m3".
       - Numeric quantities MUST be extracted precisely (e.g., 9.6, 0.458).
    
    2. LOCATION CONTEXT:
       - Map "Apron" or "Key" to correct parent (Barrage, Weir, Stilling Basin).

    RECOGNIZED ITEM TYPES:
    ${itemTypesToUse.map(t => t.name).join(', ')}
    ---------------------------------------------------------

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
          const desc = item.activityDescription || "";
          const type = item.itemType && item.itemType !== "Other" ? item.itemType : identifyItemType(desc, customItemTypes);
          const finalUnit = unitMap[item.unit?.toLowerCase()] || item.unit || "m3";
          
          return {
              location: item.location || "Unclassified",
              component: item.component || "",
              structuralElement: item.structuralElement || "",
              chainage: item.chainage || "",
              chainageOrArea: `${item.chainage || ''} ${item.structuralElement || ''}`.trim(),
              activityDescription: desc,
              plannedNextActivity: item.plannedNextActivity || "As per plan",
              quantity: item.quantity || 0,
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
