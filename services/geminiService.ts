
import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem, TrainingExample } from "../types";
import { LOCATION_HIERARCHY, identifyItemType, ITEM_PATTERNS } from "../utils/constants";
import { getTrainingExamples } from "./firebaseService";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
       - IMPORTANT: For Tunneling, the 'location' must be "Headrace Tunnel (HRT)". 
       - If you see "Inlet" or "Adit", set 'location' to "Headrace Tunnel (HRT)" and 'component' to "HRT from Inlet" or "HRT from Adit".
    
    2. QUANTITY & UNIT:
       - Extract numeric values precisely.
       - UNIT MAPPING: "sqm" -> "m2", "cum" -> "m3", "mt" -> "Ton", "kg" -> "Ton" (divide kg by 1000).
       - If no unit is found, default to "m3".
    
    3. CLASSIFICATION: 
       - Choose from: ${itemTypesString}.
       - "M25", "Grade 25", "M-25" -> "C25 Concrete"
       - "Formworks", "Shuttering" -> "Formwork"

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
    Convert raw site update text into a structured JSON array for a Daily Progress Report (DPR).

    STRICT ATOMIC RULES:
    1. **SPLIT AGGRESSIVELY**: Every distinct activity or material must be its own record. 

    2. **HRT HIERARCHY RULE**: 
       - "HRT from Inlet" and "HRT from Adit" are **COMPONENTS**, not Locations.
       - Their 'location' must ALWAYS be "Headrace Tunnel (HRT)".
       - NEVER output "HRT from Inlet" in the 'location' field.

    3. **READABLE DESCRIPTIONS**: 
       - Keep the original description readable.
       - Clean up the description if it contains just raw numbers that are extracted elsewhere.

    4. **UNIT STANDARDIZATION**:
       - Convert "kg" to "Ton" (value / 1000). Set unit to "Ton".

    5. **ITEM TYPING MAPPING**:
       - "M25", "M-25", "Grade 25", "Grade-25" -> map to itemType "C25 Concrete".
       - "Formworks" (plural) or "Shuttering" -> map to itemType "Formwork".

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
          
          // Re-evaluate itemType to catch M25 if AI missed it but text has it
          let type = item.itemType;
          if (!type || type === "Other") {
               type = identifyItemType(desc, customItemTypes);
          }
          
          const finalUnit = unitMap[item.unit?.toLowerCase()] || item.unit || "m3";
          const qty = item.quantity || 0;
          
          // Standardization for HRT
          let loc = item.location || contextLocations?.[0] || "Unclassified";
          let comp = item.component || contextComponents?.[0] || "";
          if (loc === "HRT from Inlet" || loc === "HRT from Adit") {
              comp = loc;
              loc = "Headrace Tunnel (HRT)";
          }

          // INTELLIGENT DESCRIPTION SUFFIXING
          // Only append the standardized quantity if the number isn't present in the description.
          // This prevents "30 cum 30m3".
          // We check if the exact quantity number (e.g. "30") exists as a whole word in the description.
          if (qty > 0) {
             const qtyPattern = new RegExp(`\\b${qty}\\b`);
             if (!qtyPattern.test(desc)) {
                 desc = `${desc} ${qty}${finalUnit}`;
             }
          }

          return {
              location: loc,
              component: comp,
              structuralElement: item.structuralElement || "",
              chainage: item.chainage || "",
              chainageOrArea: `${item.chainage || ''} ${item.structuralElement || ''}`.trim(),
              activityDescription: desc.trim(),
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
