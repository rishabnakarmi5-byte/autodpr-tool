
import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem } from "../types";
import { LOCATION_HIERARCHY, identifyItemType } from "../utils/constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getMoodMessage = async (mood: string, userName: string): Promise<string> => {
  const prompt = `
    You are a supportive, witty, and professional assistant for a Construction Manager named ${userName}.
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
    ? `USER SPECIFIC INSTRUCTIONS (Prioritize these): ${instructions}` 
    : 'No specific user instructions.';

  let contextBlock = "";
  if (contextLocations && contextLocations.length > 0) {
      contextBlock += `\n    SELECTED LOCATIONS CONTEXT: ${JSON.stringify(contextLocations)}`;
      if (contextComponents && contextComponents.length > 0) {
          contextBlock += `\n    SELECTED COMPONENTS CONTEXT: ${JSON.stringify(contextComponents)}`;
      }
      contextBlock += `\n    IMPORTANT: The user has explicitly selected the above context. Assume all items in the text belong to these Locations and Components unless the text EXPLICITLY mentions a completely different location.`;
  }

  const hierarchyString = Object.entries(hierarchyToUse).map(([loc, comps]) => {
      return `LOCATION: "${loc}" contains COMPONENTS: [${comps.join(', ')}]`;
  }).join('\n    ');

  const prompt = `
    You are a construction site data entry assistant.
    I will provide raw text from a WhatsApp message sent by a site engineer.
    Your job is to extract the construction activities into a structured JSON array.

    ${instructionBlock}
    ${contextBlock}

    ---------------------------------------------------------
    CRITICAL FORMATTING & VOCABULARY RULES:
    1. ACTIVITY DESCRIPTION: 
       - Format: "[Element] [Material/Grade]" (Do NOT include quantity here if possible).
       - Example: "Gantry C25" (Good).
    
    2. QUANTITY EXTRACTION:
       - Extract the numeric quantity and the unit (m3, m2, nos, rm, ton) into separate fields.
       - If no unit is found but it's concrete, assume 'm3'.

    3. CONCRETE GRADES:
       - Convert ALL "M" grades to "C" grades.
       - "M25" -> "C25".

    4. SPLIT COMBINED ENTRIES (IMPORTANT):
       - If a single sentence mentions TWO separate activities, create TWO separate JSON items.
       - Example Input: "Wall concreting 20m3 and Soling 5m3 done."
       - Output Item 1: "Wall C25", Qty: 20, Unit: m3
       - Output Item 2: "Soling", Qty: 5, Unit: m3

    VALID HIERARCHY REFERENCE:
    ${hierarchyString}
    ---------------------------------------------------------

    Here is the raw text:
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
                  required: ["location", "activityDescription", "plannedNextActivity"],
                },
             },
             warnings: {
               type: Type.ARRAY,
               items: { type: Type.STRING }
             }
          }
        },
      },
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      
      const processedItems = result.items.map((item: any) => {
          const clean = (val: string) => {
              if(!val) return "";
              const v = val.trim().toLowerCase();
              if(v === "not specified" || v === "n/a" || v === "unknown" || v === "none") return "";
              return val;
          };

          const chainageVal = clean(item.chainage);
          const elementVal = clean(item.structuralElement);
          
          let desc = item.activityDescription || "";
          desc = desc.replace(/\bM(\d{2})\b/gi, "C$1");
          desc = desc.replace(/\bMS\s*Wall\b/gi, "Stone Masonry Wall");
          desc = desc.replace(/\bMS\b/g, "Stone Masonry");

          return {
              location: item.location || "Unclassified / Needs Fix",
              component: item.component || "",
              structuralElement: elementVal,
              chainage: chainageVal,
              chainageOrArea: `${chainageVal} ${elementVal}`.trim(),
              activityDescription: desc,
              plannedNextActivity: item.plannedNextActivity,
              quantity: item.quantity || 0,
              unit: item.unit ? item.unit.toLowerCase() : '',
              itemType: identifyItemType(desc)
          };
      });

      return { items: processedItems, warnings: result.warnings || [] };
    }
    return { items: [], warnings: [] };
  } catch (error) {
    console.error("Error parsing construction data:", error);
    throw error;
  }
};
