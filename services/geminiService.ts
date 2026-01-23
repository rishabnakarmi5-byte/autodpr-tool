
import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem } from "../types";
import { LOCATION_HIERARCHY, identifyItemType } from "../utils/constants";

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

export const parseConstructionData = async (
  rawText: string,
  instructions?: string,
  contextLocations?: string[],
  contextComponents?: string[],
  customHierarchy?: Record<string, string[]>
): Promise<{ items: Omit<DPRItem, 'id'>[], warnings: string[] }> => {
  
  const hierarchyToUse = customHierarchy || LOCATION_HIERARCHY;
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

  const prompt = `
    You are a construction site data extraction engine.
    Convert raw WhatsApp messages into a structured JSON array of construction activities.

    ${instructionBlock}
    ${contextBlock}

    ---------------------------------------------------------
    STRICT EXTRACTION RULES:
    1. SPLIT COMBINED ACTIVITIES: 
       - If one sentence mentions rebar, formwork, AND concrete, you MUST create THREE separate objects.
       - NEVER bundle rebar and concrete in the same activityDescription unless specifically requested.
    
    2. QUANTITY PRECISION:
       - Extract ALL numeric quantities.
       - Mapping: "mt" or "metric ton" -> "Ton", "cum" or "m3" -> "m3", "sqm" or "m2" -> "m2", "bags" or "nos" -> "nos".
       - If no unit is mentioned but it is 'C25', assume 'm3'.

    3. DESCRIPTIONS:
       - Keep activityDescription concise (e.g., "Rebar installation").
       - Convert grade "M25" to "C25".

    HIERARCHY:
    ${hierarchyString}
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
                    unit: { type: Type.STRING }
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
          const desc = (item.activityDescription || "").replace(/\bM(\d{2})\b/gi, "C$1");
          return {
              location: item.location || "Unclassified",
              component: item.component || "",
              structuralElement: item.structuralElement || "",
              chainage: item.chainage || "",
              chainageOrArea: `${item.chainage || ''} ${item.structuralElement || ''}`.trim(),
              activityDescription: desc,
              plannedNextActivity: item.plannedNextActivity || "As per plan",
              quantity: item.quantity || 0,
              unit: item.unit ? item.unit.toLowerCase() : '',
              itemType: identifyItemType(desc)
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
