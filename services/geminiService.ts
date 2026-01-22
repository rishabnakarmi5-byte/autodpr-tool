
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
    CRITICAL FORMATTING & VOCABULARY RULES:
    1. ACTIVITY DESCRIPTION: Keep it EXTREMELY SHORT, PROFESSIONAL and CONCISE.
       - Format: "[Element] [Material/Grade] - [Quantity]"
       - Remove story-telling words like "We did", "Completed", "In progress", "Carried out".
       - Example: "Gantry C25 - 50 m3" (Good) vs "We completed concreting of gantry with 50m3" (Bad).
       - Example: "Face Excavation - 12 m3" (Good).
    
    2. CONCRETE GRADES:
       - Convert ALL "M" grades to "C" grades.
       - "M25" -> "C25", "M15" -> "C15", "M20" -> "C20".
       - If only "Concrete" is written without grade, default to "C25" internally but do not write it unless sure.

    3. MASONRY:
       - Convert "MS Wall" or "MS" to "Stone Masonry Wall".

    4. SPLIT COMBINED ENTRIES (IMPORTANT):
       - If a single sentence mentions TWO separate activities, create TWO separate JSON items.
       - Example Input: "Wall concreting 20m3 and Soling 5m3 done."
       - Output Item 1: "Wall C25 - 20 m3"
       - Output Item 2: "Soling - 5 m3"
       - Both inherit the same Location/Chainage unless specified otherwise.

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
      const processedItems = result.items.map((item: any) => {
          // Clean "Not specified" or similar placeholders to empty strings
          const clean = (val: string) => {
              if(!val) return "";
              const v = val.trim().toLowerCase();
              if(v === "not specified" || v === "n/a" || v === "unknown" || v === "none") return "";
              return val;
          };

          const chainageVal = clean(item.chainage);
          const elementVal = clean(item.structuralElement);
          
          // Strict Post-Processing Replacements
          let desc = item.activityDescription || "";
          
          // 1. Force M to C conversion (Global regex, case insensitive)
          // Matches M followed by 2 digits (e.g., M25, m15) ensuring it's a word boundary
          desc = desc.replace(/\bM(\d{2})\b/gi, "C$1");

          // 2. Map MS Wall
          desc = desc.replace(/\bMS\s*Wall\b/gi, "Stone Masonry Wall");
          desc = desc.replace(/\bMS\b/g, "Stone Masonry"); // Be careful with 'MS' standing for other things, but usually MS Wall context handles it.

          return {
              location: item.location || "Unclassified / Needs Fix",
              component: item.component || "",
              structuralElement: elementVal,
              chainage: chainageVal,
              // Only append if value exists to avoid "Not specified Not specified"
              chainageOrArea: `${chainageVal} ${elementVal}`.trim(),
              activityDescription: desc,
              plannedNextActivity: item.plannedNextActivity
          };
      });

      // Infer warnings locally if model didn't catch them
      const warnings: string[] = result.warnings || [];
      
      processedItems.forEach((item: any) => {
         const desc = item.activityDescription.toLowerCase();
         const loc = (item.location || "").toLowerCase();

         // 1. Concrete Grade Check
         if ((desc.includes('concrete') || desc.includes('concreting') || desc.includes('plum')) && 
             !desc.match(/c\d{2}|grade|m\d{2}/i)) {
             warnings.push(`Item "${item.activityDescription.substring(0, 20)}..." detected as Concrete but no Grade specified. Defaulting to C25.`);
         }

         // 2. Location Check (Unclassified)
         if (loc.includes('unclassified') || loc.includes('needs fix') || loc === '') {
             warnings.push(`Item "${item.activityDescription.substring(0, 20)}..." has an invalid Location. Please check.`);
         }

         // 3. Missing Chainage/Elevation Check (Skip for Headworks as mostly open area)
         if (!loc.includes('headworks')) {
             if (!item.chainage || item.chainage.trim() === '') {
                 warnings.push(`Item "${item.activityDescription.substring(0, 20)}..." at ${item.location} is missing Chainage or Elevation details.`);
             }
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
