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

    CRITICAL CATEGORIZATION RULES:
    You must extract 'location' (Main Area), 'component' (Sub Area), and 'chainageOrArea' (Specific Detail).

    1. HEADWORKS:
       - Text: "Barrage raft concreting" -> location: "Headworks", component: "Barrage", chainageOrArea: "Raft".
       - Text: "Apron C15" -> location: "Headworks", component: "Apron".
    2. HRT (HEADRACE TUNNEL): 
       - Work from Inlet side -> location: "HRT", component: "HRT from Inlet".
       - Work from Adit side -> location: "HRT", component: "HRT from Adit".
    3. PRESSURE TUNNELS: 
       - "Vertical shaft" -> location: "Pressure Tunnels", component: "Vertical Shaft".
       - "Lower Pressure Tunnel" -> location: "Pressure Tunnels", component: "Lower Pressure Tunnel".
    4. POWERHOUSE:
       - "Main building", "Machine Hall" -> location: "Powerhouse", component: "Powerhouse Main Building".
       - "Tailrace Tunnel", "TRT" -> location: "Powerhouse", component: "Tailrace Tunnel".
       - "Tailrace Outlet" -> location: "Powerhouse", component: "Tailrace Outlet".
    5. BIFURCATION:
       - "Bifurcation" -> location: "Bifurcation", component: "Bifurcation".

    The output format must be a list of items with the following fields:
    - location: The major site location (e.g. Headworks, Powerhouse).
    - component: The specific structure or sub-location (e.g. Barrage, Tailrace Tunnel, Vertical Shaft).
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