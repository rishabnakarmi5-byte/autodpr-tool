import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const parseConstructionData = async (
  rawText: string,
  instructions?: string
): Promise<Omit<DPRItem, 'id'>[]> => {
  
  const instructionBlock = instructions 
    ? `USER SPECIFIC INSTRUCTIONS (Prioritize these): ${instructions}` 
    : 'No specific user instructions.';

  const prompt = `
    You are a construction site data entry assistant.
    I will provide raw text from a WhatsApp message sent by a site engineer.
    Your job is to extract the construction activities into a structured JSON array.

    ${instructionBlock}

    CRITICAL CATEGORIZATION RULES (Map text to these specific 'location' values):
    1. HEADWORKS: If text contains "barrage", "stilling basin", "apron", "key", "settling basin", "desander", "headpond", "syphon" -> location: "Headworks".
    2. HRT (HEADRACE TUNNEL): 
       - Work from Inlet side -> location: "HRT from Inlet".
       - Work from Adit side -> location: "HRT from Adit".
    3. PRESSURE TUNNELS: 
       - "Vertical shaft", "concrete infill", "C10" -> location: "Pressure Tunnels", chainageOrArea: "Vertical Shaft".
    4. POWERHOUSE:
       - "Main building", "Machine Hall" -> location: "Powerhouse Main Building".
       - "Transformer", "Cavern" -> location: "Powerhouse".
    5. BIFURCATION:
       - "Bifurcation" -> location: "Bifurcation".
    6. TAILRACE:
       - "Tailrace", "TRT" -> location: "Tailrace Tunnel".

    The output format must be a list of items with the following fields:
    - location: The major site location based on the rules above (or original if not matched).
    - chainageOrArea: The specific sub-area or chainage mentioned (e.g., "Tailrace Invert", "Apron", "Ch 100-200").
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