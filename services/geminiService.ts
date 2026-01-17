import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem } from "../types";
import { LOCATION_HIERARCHY } from "../utils/constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const parseConstructionData = async (
  rawText: string,
  instructions?: string,
  contextLocations?: string[],
  contextComponents?: string[]
): Promise<Omit<DPRItem, 'id'>[]> => {
  
  const instructionBlock = instructions 
    ? `USER SPECIFIC INSTRUCTIONS (Prioritize these): ${instructions}` 
    : 'No specific user instructions.';

  // Context Block
  let contextBlock = "";
  if (contextLocations && contextLocations.length > 0) {
      contextBlock += `\n    SELECTED LOCATIONS CONTEXT: ${JSON.stringify(contextLocations)}`;
      if (contextComponents && contextComponents.length > 0) {
          contextBlock += `\n    SELECTED COMPONENTS CONTEXT: ${JSON.stringify(contextComponents)}`;
      }
      contextBlock += `\n    IMPORTANT: The user has explicitly selected the above context. Assume all items in the text belong to these Locations and Components unless the text EXPLICITLY mentions a completely different location.`;
  }

  // Flatten the hierarchy to show the model valid components
  const hierarchyString = Object.entries(LOCATION_HIERARCHY).map(([loc, comps]) => {
      return `${loc}: [${comps.join(', ')}]`;
  }).join('\n    ');

  const prompt = `
    You are a construction site data entry assistant.
    I will provide raw text from a WhatsApp message sent by a site engineer.
    Your job is to extract the construction activities into a structured JSON array.

    ${instructionBlock}
    ${contextBlock}

    CRITICAL CATEGORIZATION RULES:
    You must classify 'location' (Main Area) and 'component' (Sub Area) STRICTLY based on the following list. 
    If a location/component doesn't match exactly, pick the closest one from this list.

    VALID HIERARCHY:
    ${hierarchyString}

    IMPORTANT OVERRIDES:
    1. "Bifurcation" ALWAYS belongs to "Pressure Tunnels".
    2. "Vertical Shaft" ALWAYS belongs to "Pressure Tunnels".
    3. "Tailrace Tunnel" or "TRT" ALWAYS belongs to "Powerhouse".
    4. "HRT Inlet" or "HRT from Adit" ALWAYS belongs to "Headrace Tunnel (HRT)".

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
