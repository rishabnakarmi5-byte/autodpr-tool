
import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem } from "../types";
import { LOCATION_HIERARCHY, identifyItemType, ITEM_PATTERNS } from "../utils/constants";

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
 * Used for the "Autofill" button in Master Record.
 */
export const autofillItemData = async (
  description: string,
  customItemTypes?: any[]
): Promise<Partial<DPRItem>> => {
  const itemTypesToUse = customItemTypes || ITEM_PATTERNS.map(p => ({
      name: p.name,
      pattern: p.pattern.toString().slice(1, -2),
      defaultUnit: p.defaultUnit
  }));

  const itemTypesString = itemTypesToUse.map(t => `"${t.name}"`).join(', ');

  const prompt = `
    Act as a construction data specialist. Analyze this activity description: "${description}"
    
    Your task is to extract the quantity, unit, and item classification.
    
    RULES:
    1. QUANTITY: Extract the exact numeric value. If it says "385 m3", return 385. If it says "Placement of 2.5 m3", return 2.5. If no quantity is found, return 0.
    2. UNIT: Strictly choose one from ["m3", "Ton", "m2", "nos", "rm"]. 
       Mapping: "cum" -> "m3", "mt" -> "Ton", "sqm" -> "m2", "bags" -> "nos", "mtr" -> "rm".
    3. CLASSIFICATION: Choose the best fit from these recognized types: ${itemTypesString}. If no match, use "Other".

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
            quantity: { type: Type.NUMBER, description: "The numeric quantity extracted" },
            unit: { type: Type.STRING, description: "The unit (m3, Ton, m2, nos, rm)" },
            itemType: { type: Type.STRING, description: "The classification name" }
          },
          required: ["quantity", "unit", "itemType"]
        }
      }
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      // Strict validation of the unit
      const allowedUnits = ["m3", "Ton", "m2", "nos", "rm"];
      const finalUnit = allowedUnits.includes(result.unit) ? result.unit : "m3";
      
      return {
        quantity: result.quantity || 0,
        unit: finalUnit,
        itemType: result.itemType || identifyItemType(description, customItemTypes)
      };
    }
  } catch (e) {
    console.error("Autofill error:", e);
  }
  
  return {
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

  const instructionBlock = instructions 
    ? `USER SPECIFIC INSTRUCTIONS (CRITICAL): ${instructions}` 
    : 'No specific user instructions.';

  let contextBlock = "";
  if (contextLocations && contextLocations.length > 0) {
      contextBlock += `\n    FORCE LOCATIONS: ${JSON.stringify(contextLocations)}`;
      if (contextComponents && contextComponents.length > 0) {
          contextBlock += `\n    FORCE COMPONENTS: ${JSON.stringify(contextComponents)}`;
      }
      contextBlock += `\n    IMPORTANT: Use these selected contexts if the text doesn't specify otherwise.`;
  }

  const hierarchyString = Object.entries(hierarchyToUse).map(([loc, comps]) => {
      return `LOC: "${loc}" -> COMPS: [${comps.join(', ')}]`;
  }).join('\n    ');

  const itemTypesString = itemTypesToUse.map(t => `"${t.name}" (keywords: ${t.pattern})`).join(', ');

  const prompt = `
    You are a construction site data extraction engine.
    Convert raw WhatsApp messages into a structured JSON array of construction activities.

    ${instructionBlock}
    ${contextBlock}

    ---------------------------------------------------------
    STRICT EXTRACTION RULES:
    1. SPLIT COMBINED ACTIVITIES: 
       - If one sentence mentions rebar, formwork, AND concrete, you MUST create THREE separate objects.
    
    2. QUANTITY PRECISION:
       - Extract ALL numeric quantities accurately.
       - Unit Mapping (Case Insensitive): 
         * "mt", "metric ton" -> "Ton"
         * "cum", "m3" -> "m3"
         * "sqm", "m2" -> "m2"
         * "bags", "nos", "number", "numbers" -> "nos"
         * "rm", "running meter" -> "rm"
       - Example: "42 bags" => quantity: 42, unit: "nos".
       - Example: "37 m3 of C25" => quantity: 37, unit: "m3".

    3. DESCRIPTIONS:
       - Clean description (e.g., "Rebar installation").
       - Keep grade labels like "C25".

    HIERARCHY:
    ${hierarchyString}

    RECOGNIZED ITEM TYPES:
    ${itemTypesString}
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
                  required: ["location", "activityDescription"],
                },
             },
             warnings: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        },
      },
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      
      const processedItems = result.items.map((item: any) => {
          const desc = item.activityDescription || "";
          // If AI provided itemType, use it, otherwise detect it
          const type = item.itemType && item.itemType !== "Other" ? item.itemType : identifyItemType(desc, customItemTypes);
          
          return {
              location: item.location || "Unclassified",
              component: item.component || "",
              structuralElement: item.structuralElement || "",
              chainage: item.chainage || "",
              chainageOrArea: `${item.chainage || ''} ${item.structuralElement || ''}`.trim(),
              activityDescription: desc,
              plannedNextActivity: item.plannedNextActivity || "As per plan",
              quantity: item.quantity || 0,
              unit: item.unit || "m3",
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
