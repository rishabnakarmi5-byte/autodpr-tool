import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem } from "../types";
import { LOCATION_HIERARCHY } from "../utils/constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const parseConstructionData = async (
  rawText: string,
  instructions?: string
): Promise<Omit<DPRItem, 'id'>[]> => {
  
  const instructionBlock = instructions 
    ? `USER SPECIFIC INSTRUCTIONS (Prioritize these): ${instructions}` 
    : 'No specific user instructions.';

  // Flatten the hierarchy to show the model valid components
  const hierarchyString = Object.entries(LOCATION_HIERARCHY).map(([loc, comps]) => {
      return `${loc}: [${comps.join(', ')}]`;
  }).join('\n    ');

  const prompt = `
    You are a construction site data entry assistant.
    I will provide raw text from a WhatsApp message sent by a site engineer.
    Your job is to extract the construction activities into a structured JSON array.

    ${instructionBlock}

    CRITICAL CATEGORIZATION RULES:
    You must classify 'location' (Main Area) and 'component' (Sub Area) STRICTLY based on the following list. 
    If a location/component doesn't match exactly, pick the closest one from this list.

    VALID HIERARCHY:
    ${hierarchyString}

    EXAMPLES:
    1. Text: "Barrage raft concreting" 
       -> location: "Headworks", component: "Barrage", chainageOrArea: "Raft".
    2. Text: "HRT from Inlet face work" 
       -> location: "Headrace Tunnel (HRT)", component: "HRT from Inlet".
    3. Text: "Vertical shaft mucking" 
       -> location: "Pressure Tunnels", component: "Vertical Shaft".
    4. Text: "Machine Hall slab" 
       -> location: "Powerhouse", component: "Main Building", chainageOrArea: "Machine Hall Slab".
    5. Text: "TRT wall" 
       -> location: "Powerhouse", component: "Tailrace Tunnel (TRT)", chainageOrArea: "Wall".

    The output format must be a list of items with the following fields:
    - location: The major site location (Must match VALID HIERARCHY keys).
    - component: The specific structure (Must match VALID HIERARCHY values for that location).
    - chainageOrArea: The specific detail, lift, or chainage (e.g. "Raft", "Wall 1st Lift", "Ch 0+100").
    - activityDescription: What work was done today (include quantities like m3, T, msq).
    - plannedNextActivity: What is planned for tomorrow/next day.

    Here is the raw text:
    """
    ${rawText}
    """

    If the text contains multiple distinct activities, break them into separate items.
    Clean up the text to be professional and concise suitable for a formal report.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              location: { type: Type.STRING },
              component: { type: Type.STRING },
              chainageOrArea: { type: Type.STRING },
              activityDescription: { type: Type.STRING },
              plannedNextActivity: { type: Type.STRING },
            },
            required: ["location", "chainageOrArea", "activityDescription", "plannedNextActivity"],
          },
        },
      },
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    return [];
  } catch (error) {
    console.error("Error parsing construction data:", error);
    throw error;
  }
};