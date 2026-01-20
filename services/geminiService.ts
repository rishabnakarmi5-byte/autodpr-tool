
import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem } from "../types";
import { LOCATION_HIERARCHY } from "../utils/constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getMoodMessage = async (mood: string, userName: string): Promise<string> => {
  const prompt = `
    You are a supportive, witty, and professional assistant for a Construction Manager named ${userName}.
    The user just reported feeling "${mood}".
    
    Generate a short, 1-sentence response.
    - If Happy/Excited: Be hyping and energetic.
    - If Tired/Frustrated: Be supportive, maybe a light construction-related joke or stoic encouragement.
    - If Sad: Be gentle and uplifting.
    
    Keep it under 20 words. No emojis in the text (frontend handles that).
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
    CRITICAL HIERARCHY RULES (FOLLOW STRICTLY):
    You must classify data into 4 levels:
    1. LOCATION (Main Area, e.g., Headworks, Powerhouse)
    2. COMPONENT (Structure, e.g., Barrage, Intake, Main Building)
    3. STRUCTURAL ELEMENT (Specific part, e.g., Raft, Wall, Slab, Invert, Arch)
    4. CHAINAGE/EL (Position, e.g., Ch 0+100, EL 1400)

    NEVER use a Component name as a Location. 
    
    CORRECT MAPPINGS (Memorize These):
    1. IF input is "Inlet", "Adit", "HRT", "Face" -> 
       LOCATION MUST BE: "Headrace Tunnel (HRT)"
       COMPONENT MUST BE: "HRT from Inlet" OR "HRT from Adit" OR "Adit Tunnel"
    
    2. IF input is "Tailrace", "TRT", "Tailrace Tunnel" -> 
       LOCATION MUST BE: "Powerhouse"
       COMPONENT MUST BE: "Tailrace Tunnel (TRT)"
       
    3. IF input is "Powerhouse", "PH", "Machine Hall", "Service Bay", "Control Building" ->
       LOCATION MUST BE: "Powerhouse"
       COMPONENT MUST BE: "Main Building" (or specific area if mentioned)

    4. IF input is "Bifurcation", "Vertical Shaft", "VS", "LPT", "Surge Tank" ->
       LOCATION MUST BE: "Pressure Tunnels"
    
    5. IF input is "Barrage", "Weir", "Intake", "Desander", "Settling Basin" ->
       LOCATION MUST BE: "Headworks"

    VALID HIERARCHY REFERENCE:
    ${hierarchyString}
    ---------------------------------------------------------

    The output format must be a list of items with the following fields:
    - location: The major site location (MUST be one of the top-level keys).
    - component: The specific structure (MUST be one of the values listed under that location).
    - structuralElement: The specific part (Raft, Wall, Kicker, etc.). Extract from text.
    - chainage: The specific chainage or elevation (e.g. "Ch 0+100 to 0+115").
    - activityDescription: What work was done today (include quantities like m3, T, msq).
    - plannedNextActivity: What is planned for tomorrow/next day.

    Here is the raw text:
    """
    ${rawText}
    """

    If the text contains "Concrete" or "Concreting" or "Plum" but NO grade (C10, C15, C20, C25, C30, C35) is specified, assume it is "C25" but DO NOT write C25 in the description unless you are sure. I will handle the warning.
    Clean up the text to be professional and concise suitable for a formal report.
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
      
      // Post-processing to map to DPRItem structure
      const processedItems = result.items.map((item: any) => ({
          location: item.location || "Unclassified / Needs Fix",
          component: item.component || "",
          structuralElement: item.structuralElement || "",
          chainage: item.chainage || "",
          chainageOrArea: (item.chainage || "") + (item.structuralElement ? " " + item.structuralElement : ""),
          activityDescription: item.activityDescription,
          plannedNextActivity: item.plannedNextActivity
      }));

      // Infer warnings locally if model didn't catch them
      const warnings: string[] = result.warnings || [];
      
      // Check for Concrete grade default
      processedItems.forEach((item: any) => {
         const desc = item.activityDescription.toLowerCase();
         if ((desc.includes('concrete') || desc.includes('concreting') || desc.includes('plum')) && 
             !desc.match(/c\d{2}|grade|m\d{2}/i)) {
             warnings.push(`Item "${item.activityDescription.substring(0, 20)}..." detected as Concrete but no Grade specified. Defaulting to C25.`);
         }
      });

      return { items: processedItems, warnings };
    }
    return { items: [], warnings: [] };
  } catch (error) {
    console.error("Error parsing construction data:", error);
    throw error;
  }
};
