
import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem, TrainingExample } from "../types";
import { LOCATION_HIERARCHY, identifyItemType, ITEM_PATTERNS, toTitleCase } from "../utils/constants";
import { getTrainingExamples } from "./firebaseService";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || '';
// Using gemini-3-flash-preview for high-speed, high-accuracy extraction
const MODEL_NAME = import.meta.env.VITE_MODEL_NAME || process.env.MODEL_NAME || 'gemini-3-flash-preview';

const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * AI-powered photo analysis to extract location, component, and activity.
 * Prioritizes location and component over activity.
 */
export const analyzePhoto = async (
  imageDataB64: string,
  mimeType: string,
  hierarchy: Record<string, string[]>
): Promise<{ location: string; component: string; activity: string; caption: string }> => {
  const hierarchyStr = Object.entries(hierarchy)
    .map(([loc, comps]) => `- ${loc}: ${comps.join(', ')}`)
    .join('\n');

  const prompt = `
    Analyze this construction site photo.
    
    STRICT HIERARCHY (Only choose from these if possible):
    ${hierarchyStr}
    
    TASK:
    1. Identify the 'location' from the hierarchy.
    2. Identify the 'component' within that location.
    3. Describe the 'activity' being performed (e.g., Concreting, Rebar tying, Excavation).
    
    PRIORITIZATION RULE:
    Your focus is primarily on determining the EXACT Location and Component. The activity is secondary.
    
    OUTPUT FORMAT:
    Return ONLY JSON with these keys: "location", "component", "activity", "caption".
    The "caption" field should be formatted as: "{location} > {component}: {activity}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { data: imageDataB64, mimeType } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            location: { type: Type.STRING },
            component: { type: Type.STRING },
            activity: { type: Type.STRING },
            caption: { type: Type.STRING }
          },
          required: ["location", "component", "activity", "caption"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
  } catch (error) {
    console.error("Photo Analysis Error:", error);
  }
  
  return { 
    location: "Unknown", 
    component: "Unknown", 
    activity: "Site Photo", 
    caption: "Untitled Site Photo" 
  };
};

// --- UTILITY: Retry with Exponential Backoff & Timeout ---
async function generateContentWithRetry(params: any, retries = 2, timeoutMs = 35000): Promise<any> {
  const makeRequest = async () => {
      try {
          const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
          );

          const apiCall = ai.models.generateContent({
              model: MODEL_NAME,
              ...params
          });

          const response = await Promise.race([apiCall, timeoutPromise]);
          return response;
      } catch (error: any) {
          throw error;
      }
  };

  for (let i = 0; i <= retries; i++) {
      try {
          return await makeRequest();
      } catch (error: any) {
          const isRetryable = error.message.includes("429") || error.message.includes("503") || error.message.includes("timed out") || error.message.includes("Failed to fetch");
          if (i === retries || !isRetryable) throw error;
          
          const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
          console.warn(`Gemini API Attempt ${i + 1} failed. Retrying in ${Math.round(delay)}ms...`);
          await new Promise(res => setTimeout(res, delay));
      }
  }
}

const cleanStr = (val: any): string => {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (s.toLowerCase() === 'null') return '';
  return s;
};

const correctStructuralTypos = (str: string): string => {
    let corrected = str;
    // Fix "Inverter" -> "Invert"
    corrected = corrected.replace(/\bInverter\b/gi, 'Invert');
    // Fix "Tunnel Invert" -> "Invert"
    corrected = corrected.replace(/\bTunnel Invert\b/gi, 'Invert');
    return corrected;
};

/**
 * Lightweight extraction for a single item (used for manual entry refinements).
 */
export const autofillItemData = async (
  description: string,
  customItemTypes?: any[],
  learnedContext?: string
): Promise<Partial<DPRItem>> => {
  const prompt = `
    Analyze: "${description}"
    
    TASK: Separate "Where" (Structural ID) from "What" (Activity).

    STRICT RULES:
    0. CONTEXT HEADERS (CRITICAL):
       - If the text contains "--- CONTEXT: Location > Component ---", use those values for location and component.
    0.1. LANGUAGE & SPELLING (CRITICAL):
       - Site notes may be a mix of English and Romanized Nepali (e.g., "vako tiyo", "vayou sir", "hijo rati").
       - Be resilient to spelling mistakes from less educated writers (e.g., "fish later" -> "Fish Ladder").
        - "M" grade concrete MUST be converted to "C" (e.g., "M25" -> "C25 Concrete", "M50" -> "C50 Concrete").
        - This conversion also applies to Plum Concrete (e.g., "M15 Plum" -> "C15 Plum Concrete").
    1. structuralElement: Extract the specific part/area (e.g., "Spiral Casing Unit 1", "Crown", "end sill", "bottom sill", "Niche").
       - If the 'structuralElement' you extract is identical to the 'component' name, leave 'structuralElement' BLANK (empty string) to avoid duplication in the final report.
       - If the text mentions "apron wall ra apron raft", set 'structuralElement' to "Wall And Raft".
    2. activityDescription: MUST follow format "Action (Quantity Unit)". 
       Example: "C35 Concrete works (5 m3)".
       - IMPORTANT: ALWAYS follow the exact concrete grade specified in the text (e.g., C10, C15, C20, C25, C30, C35, C40, C45, C50). 
       - If the text says "M" grade (e.g., M15, M25, M50), convert it to "C" grade (e.g., C15 Concrete, C25 Concrete, C50 Concrete).
       - If NO grade is mentioned for concrete, use "C25 Concrete" as the action (e.g., "C25 Concrete works").
       - "ms wall" ALWAYS means "Stone Masonry" (e.g., "Niche ms wall" -> Stone Masonry at Niche).
       - If structure is extracted to 'structuralElement', try to simplify the description (e.g. "Spiral Casing Rebar" -> "Rebar works").
       - If NO quantity is specified, DO NOT include "(0 unit)" or any arbitrary quantity in the description. Just write the Action.
    3. Ensure 'quantity' and 'unit' are numeric/standardized. 
       - CRITICAL: Extract the EXACT number associated with the activity. DO NOT add, subtract, or perform any math on quantities unless explicitly instructed (like kg to Ton or Plum batching).
       - DO NOT combine quantities from different activities, different item types, or different lines of text.
       - DO NOT add numbers from "next plan", "lift", "chainage", or "elevation" to the quantity.
       - If no quantity is specified, return 0 for quantity and "" for unit. DO NOT hallucinate or default to 1.
       - REBAR CONVERSION (CRITICAL): If the input unit is "kg" for "Rebar", you MUST divide the quantity by 1000 and return the unit as "Ton".
       - Example: "Rebar = 2000kg" -> quantity: 2, unit: "Ton".
       - Ignore negative signs if they are just separators (e.g., "Quantity -41m3" means 41).
       - For plum concrete: if the text mentions "batching only" or "batching quantity", multiply the given quantity by 1.6 to get the total plum concrete quantity (e.g., 8 * 1.6 = 12.8).
    4. chainage: Extract any chainage or elevation values (e.g., "CH 0+100", "EL 100", "EL. 100", "Elevation 100", "506.25 to 427.25", "Ch-506.5 to 502.0").
       - CRITICAL: If the text says "EL. 1241", you MUST include the "EL." prefix in the chainage field.
    5. itemType: Classify the item type (e.g., "Formwork", "Rebar", "C25 Concrete", "Excavation"). 
       - IMPORTANT: ALWAYS follow the exact concrete grade specified in the text (e.g., C10, C15, C20, C25, C30, C35, C40, C45, C50). 
       - If the text says "M" grade (e.g., M15, M25, M50), convert it to "C" grade (e.g., C15 Concrete, C25 Concrete, C50 Concrete).
       - ONLY if "concreting" or "concrete" is mentioned WITHOUT a grade, default to "C25 Concrete".
       - GRADES: Recognize C10, C15, C20, C25, C30, C35, C40, C45, C50 as concrete grades.
       - INFILL: If "infill" is mentioned with a grade (e.g., "C15 infill"), use that grade (e.g., "C15 Concrete"). If "infill" is mentioned WITHOUT a grade, default to "C10 Concrete".
       - PLUM CONCRETE: If "plum" is mentioned with a grade (e.g., "plum concrete C20" or "M20 plum"), use that grade and convert M to C (e.g., "C20 Plum Concrete"). If "plum" is mentioned WITHOUT a grade, default to "C10 Plum Concrete".
       - "formwork" or "shuttering" ALWAYS defaults to "Formwork". NEVER use "Formworks" or "Shutters".
    6. HIERARCHY MAPPING: 
       - If you see "River protection" or "River Protection Works", map it to "River Protection Works" under "Powerhouse".
       - If you see "LPT" or "Lower Pressure Tunnel", map it to "Lower Pressure Tunnel (LPT)" under "Pressure Tunnels".
    7. GANTRY HANDLING: If "Gantry" is mentioned, ALWAYS set "Gantry" as the 'structuralElement'.
    8. PANEL HANDLING: If "Panel" (e.g., "Panel 3", "Panel 5&6") is mentioned, ALWAYS set it as the 'structuralElement'.
    9. NEXT PLAN HANDLING: If the text contains "next plan" or "planned work", extract it into 'plannedNextActivity'.
    10. NO HALLUCINATIONS: DO NOT add "Top finishing", "Finishing", or any other detail that is not explicitly mentioned in the site notes.

    Output ONLY JSON.
  `;

  const contextMatch = description.match(/--- CONTEXT: (.*?) > (.*?) ---/);
  const contextLoc = contextMatch ? contextMatch[1].trim() : null;
  const contextComp = contextMatch ? contextMatch[2].trim() : null;

  try {
    const response = await generateContentWithRetry({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            location: { type: Type.STRING },
            component: { type: Type.STRING },
            structuralElement: { type: Type.STRING },
            chainage: { type: Type.STRING },
            quantity: { type: Type.NUMBER },
            unit: { type: Type.STRING },
            itemType: { type: Type.STRING },
            activityDescription: { type: Type.STRING },
            plannedNextActivity: { type: Type.STRING }
          },
          required: ["quantity", "unit", "itemType", "activityDescription"]
        }
      }
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      
      // Override with context if present
      const finalLoc = toTitleCase(cleanStr(contextLoc || result.location));
      const finalComp = toTitleCase(cleanStr(contextComp || result.component));
      
      let desc = cleanStr(result.activityDescription);
      let qty = Math.abs(result.quantity || 0);
      
      const unitMap: Record<string, string> = { 'sqm': 'm2', 'm2': 'm2', 'cum': 'm3', 'm3': 'm3', 'mt': 'Ton', 'ton': 'Ton', 'nos': 'nos', 'rm': 'rm', 't': 'Ton', 'kg': 'kg', 'kgs': 'kg' };
      let rawUnit = cleanStr(result.unit).toLowerCase();
      let finalUnit = unitMap[rawUnit] || cleanStr(result.unit) || "m3";

      // Rebar kg to Ton conversion
      const isRebar = (result.itemType && cleanStr(result.itemType).toLowerCase().includes('rebar')) || desc.toLowerCase().includes('rebar');
      if (isRebar && (finalUnit.toLowerCase() === 'kg' || finalUnit.toLowerCase() === 'kgs')) {
          qty = qty / 1000;
          finalUnit = 'Ton';
      }
      
      if (qty > 0) {
          const qtyString = `(${qty} ${finalUnit})`;
          if (!desc.includes(qtyString)) {
              // More aggressive cleanup to avoid duplicates like (2089.28kg) (2089.28 kg)
              const cleanDesc = desc.replace(/[\(]?\d+(\.\d+)?\s*(ton|mt|t|m3|m2|cum|sqm|nos|rm|unit|kg|kgs)[\)]?/gi, '').replace(/\s*=\s*/g, '').trim();
              desc = `${cleanDesc} ${qtyString}`;
          }
      } else {
          desc = desc.replace(/[\(]?\d+(\.\d+)?\s*(ton|mt|t|m3|m2|cum|sqm|nos|rm|unit|kg|kgs)[\)]?/gi, '').replace(/\(\s*\)/g, '').replace(/\s*=\s*/g, '').trim();
      }

      const identifiedType = identifyItemType(desc, customItemTypes);
      let finalType = (identifiedType === 'Other' && result.itemType && cleanStr(result.itemType).toLowerCase() !== 'other') 
          ? toTitleCase(cleanStr(result.itemType)) 
          : identifiedType;

      let finalStructuralElement = correctStructuralTypos(toTitleCase(cleanStr(result.structuralElement)));

      // REPETITION PREVENTION: If structuralElement is identical to or contained within component, clear it
      const sLower = finalStructuralElement.toLowerCase();
      const cLower = finalComp.toLowerCase();
      if (sLower === cLower || (sLower.length > 5 && cLower.includes(sLower))) {
          finalStructuralElement = '';
      }

      // Explicit fallback for Concrete if still Other or generic C25
      if ((finalType === 'Other' || finalType === 'C25 Concrete' || finalType === 'C10 Plum Concrete') && (desc.toLowerCase().includes('concrete') || desc.toLowerCase().includes('concreting') || desc.toLowerCase().includes('plum'))) {
          const isPlum = desc.toLowerCase().includes('plum');
          const suffix = isPlum ? ' Plum Concrete' : ' Concrete';
          
          if (desc.toLowerCase().includes('c60') || desc.toLowerCase().includes('m60')) finalType = `C60${suffix}`;
          else if (desc.toLowerCase().includes('c55') || desc.toLowerCase().includes('m55')) finalType = `C55${suffix}`;
          else if (desc.toLowerCase().includes('c50') || desc.toLowerCase().includes('m50')) finalType = `C50${suffix}`;
          else if (desc.toLowerCase().includes('c45') || desc.toLowerCase().includes('m45')) finalType = `C45${suffix}`;
          else if (desc.toLowerCase().includes('c40') || desc.toLowerCase().includes('m40')) finalType = `C40${suffix}`;
          else if (desc.toLowerCase().includes('c35') || desc.toLowerCase().includes('m35')) finalType = `C35${suffix}`;
          else if (desc.toLowerCase().includes('c30') || desc.toLowerCase().includes('m30')) finalType = `C30${suffix}`;
          else if (desc.toLowerCase().includes('c25') || desc.toLowerCase().includes('m25')) finalType = `C25${suffix}`;
          else if (desc.toLowerCase().includes('c20') || desc.toLowerCase().includes('m20')) finalType = `C20${suffix}`;
          else if (desc.toLowerCase().includes('c15') || desc.toLowerCase().includes('m15')) finalType = `C15${suffix}`;
          else if (desc.toLowerCase().includes('c10') || desc.toLowerCase().includes('m10')) finalType = `C10${suffix}`;
          else if (finalType === 'Other') finalType = isPlum ? 'C10 Plum Concrete' : 'C25 Concrete';
      }

      return {
        location: finalLoc,
        component: finalComp,
        structuralElement: finalStructuralElement,
        chainage: cleanStr(result.chainage),
        quantity: qty,
        unit: finalUnit,
        itemType: finalType, 
        activityDescription: desc,
        plannedNextActivity: cleanStr(result.plannedNextActivity)
      };
    }
  } catch (e) { console.error(e); }
  return { unit: 'm3', itemType: identifyItemType(description, customItemTypes) };
};

export const parseConstructionData = async (
  rawText: string,
  instructions?: string,
  contextLocations?: string[],
  contextComponents?: string[],
  customHierarchy?: Record<string, string[]>,
  customItemTypes?: any[]
): Promise<{ items: (Omit<DPRItem, 'id'> & { extractedDate?: string })[], warnings: string[] }> => {
  
  const hierarchyToUse = customHierarchy || LOCATION_HIERARCHY;
  const hierarchyString = Object.entries(hierarchyToUse)
    .map(([loc, comps]) => `- ${loc} > [${comps.join(', ')}]`)
    .join('\n    ');

  // Pre-process context to know what was explicitly selected
  const forcedLoc = (contextLocations && contextLocations.length === 1 && contextLocations[0] !== 'General') ? contextLocations[0] : null;
  const forcedComp = (contextComponents && contextComponents.length === 1) ? contextComponents[0] : null;

  const prompt = `
    You are a high-precision construction data engine. Convert site notes into structured JSON records.

    STRICT ATOMIC RULES:
    0. CONTEXT HEADERS (CRITICAL):
       - Site notes often contain headers like "--- CONTEXT: Location > Component ---".
       - If an activity is listed under a context header, you MUST assign it to that EXACT location and component.
       - You are FORBIDDEN from changing the location or component for items under such a header.
       - This is a hard constraint. If the header says "Fish Ladder", the component MUST be "Fish Ladder".

    0.1. LANGUAGE & SPELLING (CRITICAL):
       - Site notes may be a mix of English and Romanized Nepali (e.g., "vako tiyo", "vayou sir", "hijo rati").
       - Be resilient to spelling mistakes (e.g., "fish later" ALWAYS means "Fish Ladder").
       - "M" grade concrete MUST be converted to "C" (e.g., "M25" -> "C25 Concrete", "M15" -> "C15 Concrete", "M50" -> "C50 Concrete").
       - This conversion is mandatory for all concrete grades, including Plum concrete.

    1. MULTI-ACTIVITY SPLIT:
       - Split mixed text into separate items. (e.g. "48m3 concrete and rebar" -> two items).

    2. ACRONYM RESOLUTION (CRITICAL):
       - "HRT" ALWAYS means "Headrace Tunnel (HRT)".
       - "TRT" ALWAYS means "Powerhouse" related (e.g. Tailrace Tunnel).
       - "LPT" ALWAYS means "Pressure Tunnels" related (e.g. Lower Pressure Tunnel).
       - "ms wall" ALWAYS means "Stone Masonry" (e.g., "Niche ms wall" -> Stone Masonry at Niche).
       - Never put "HRT" items under "Powerhouse".

    3. HIERARCHY MAPPING (STRICT):
       - Check the Provided HIERARCHY below. 
       - If you see "TRT Pool", map it to "Tailrace Pool (TRT Pool)" under "Powerhouse".
       - If you see "Inlet" or "Adit", map it to "Headrace Tunnel (HRT)".
       - If you see "LPT" or "Lower Pressure Tunnel", map it to "Lower Pressure Tunnel (LPT)" under "Pressure Tunnels".
       - If you see "River protection" or "River Protection Works", ALWAYS map it to "River Protection Works" under "Powerhouse", and leave 'structuralElement' BLANK (empty string) because it has no sub-areas. Do NOT assign it to "Powerhouse Ventilation Tunnel" or "Powerhouse Main Access Tunnel".
       - "Fish later", "Fish ladder", or any variation ALWAYS maps to "Fish Ladder" under "Headworks".
       - "Powerhouse Ventilation Tunnel", "Powerhouse Ventilation Tunr", or any variation ALWAYS maps to "Powerhouse Ventilation Tunnel" under "Powerhouse".

    4. DESCRIPTION FORMAT:
       - 'activityDescription' MUST be: "Action (Quantity Unit)".
       - If the user provides extra details, notes, quantities breakdown, or calculations (e.g., "[2*1*1=1num=2m3]", or details in brackets/parentheses), YOU MUST INCLUDE THEM EXACTLY AS WRITTEN in the 'activityDescription' text before the final "(Quantity Unit)" part.
         Example input: "gabion wall [2*1*1=1num=2m3] [ 1.5*1*1=2=3m3]"
         Example activityDescription output: "Gabion wall [2*1*1=1num=2m3] [ 1.5*1*1=2=3m3] (5 m3)"
       - Include grades (C50, C45, C40, C35, C30, C25, C20, C15, C10) in the description. If NO grade is mentioned for concrete, use "C25 Concrete" as the action (e.g., "C25 Concrete works").
       - If NO quantity is specified, DO NOT include "(0 unit)" or any arbitrary quantity in the description. Just write the Action.
       - For items like HDPE pipes, ensure the full detail (e.g., "HDPE pipe 14 nos x 2.5m") is included in the 'activityDescription' even if the total quantity is calculated.

    5. DATA MAPPING:
       - quantity: numeric only (ignore negative signs if they are just separators, e.g., "Quantity -41m3" means 41). 
         - CRITICAL: Extract the EXACT quantity as written in the text. DO NOT add, subtract, or perform any math on quantities unless explicitly instructed (like kg to Ton or Plum batching).
         - DO NOT combine quantities from different activities, different item types, or different lines of text.
         - DO NOT add numbers from "next plan", "lift", "chainage", or "elevation" to the quantity.
         - If no quantity is specified in the text, return 0. DO NOT hallucinate or default to 1.
       - REBAR CONVERSION (CRITICAL): If the input unit is "kg" for "Rebar", you MUST divide the quantity by 1000 and return the unit as "Ton".
       - Example: "Rebar = 2000kg" -> quantity: 2, unit: "Ton".
       - For plum concrete: if the text mentions "batching only" or "batching quantity", multiply the given quantity by 1.6 to get the total plum concrete quantity (e.g., 8 * 1.6 = 12.8).
       - For pipes (like HDPE pipe), if both length and number of pipes (nos) are provided, calculate the total quantity by multiplying length by nos. Include the calculation in the description (e.g., "HDPE pipes (22 nos x 2.5m)").
       - unit: standardized (m3, m2, Ton, nos, rm). For pipes with length, use 'rm'. If no quantity is specified, return "".
       - itemType: Classify the item type (e.g., "Formwork", "Rebar", "C25 Concrete", "Excavation"). 
         - IMPORTANT: ALWAYS use the exact concrete grade specified in the text (e.g., C10, C15, C20, C25, C30, C35, C40, C45, C50). 
         - If the text says "M" grade (e.g., M15, M25, M50), convert it to "C" grade (e.g., C15 Concrete, C25 Concrete, C50 Concrete).
         - If the text says "M25", use "C25 Concrete".
         - ONLY if "concreting" or "concrete" is mentioned WITHOUT a grade, default to "C25 Concrete".
         - GRADES: Recognize C10, C15, C20, C25, C30, C35, C40, C45, C50 as concrete grades.
         - INFILL: If "infill" is mentioned with a grade (e.g., "C15 infill"), use that grade (e.g., "C15 Concrete"). If "infill" is mentioned WITHOUT a grade, default to "C10 Concrete".
         - PLUM CONCRETE: If "plum" is mentioned with a grade (e.g., "plum concrete C20" or "M20 plum"), use that grade and convert M to C (e.g., "C20 Plum Concrete"). If "plum" is mentioned WITHOUT a grade, default to "C10 Plum Concrete".
        - TAILRACE DOWNSTREAM FLOOD WALL: If no grade is mentioned for concrete at this location, ALWAYS default to "C25 Concrete".
         - "formwork" or "shuttering" ALWAYS defaults to "Formwork". NEVER use "Formworks" or "Shutters".
       - structuralElement: CRITICAL: Extract the specific part, area, or structure name from the description if not explicitly provided.
         Examples: "Gantry", "Spiral casing unit 1", "end sill", "bottom sill", "pier", "wall", "slab", "Crown", "Invert", "Glacis".
         - If you see "Inverter" or "Tunnel Inverter", convert it to "Invert".
         - If you see "Gantry" or "Gantry concreting", ensure "Gantry" is ALWAYS set as the 'structuralElement'.
         - If you see "Panel" (e.g., "Panel 3", "Panel 5&6"), ensure it is ALWAYS set as the 'structuralElement'.
       - chainage: Extract any chainage or elevation values (e.g., "CH 0+100", "EL 100", "EL. 100", "Elevation 100", "506.25 to 427.25", "Ch-506.5 to 502.0").
         - CRITICAL: If the text says "EL. 1241", you MUST include the "EL." prefix in the chainage field.
       - plannedNextActivity: Extract any "next plan" or "planned work" information.

    6. NEXT PLAN HANDLING (CRITICAL):
       - If the text contains "next plan", "planned work", or "plan for tomorrow", extract that information into the 'plannedNextActivity' field of the RELEVANT PRECEDING activity.
       - DO NOT create a new, separate record for planned work. 
       - Example: "Gantry concrete 141m3, next plan gantry alignment" -> One record for Gantry concrete with 'plannedNextActivity' set to "Gantry alignment".

    7. DESCRIPTION CLEANUP:
       - If you see text like "(1 photo attached)", "1 photo attached", or similar, REMOVE IT. It is meta-commentary and not part of the work activity.
       - If you extract a structure (e.g. "Spiral casing unit 1") into 'structuralElement', REMOVE it from 'activityDescription' to avoid duplication, UNLESS it makes the description unclear.
       - If the 'structuralElement' you extract is identical to the 'component' name, leave 'structuralElement' BLANK (empty string) to avoid duplication in the final report.
       - Keep the description focused on the action (e.g., "Rebar works", "Concrete casting").

    8. NO HALLUCINATIONS:
       - DO NOT add "Top finishing", "Finishing", or any other detail that is not explicitly mentioned in the site notes.
       - If the text says "Tailrace downstream flood wall concrete", DO NOT add "Top finishing" to the structural element or description.

    HIERARCHY REFERENCE:
    ${hierarchyString}
  `;

  // NEW LOGIC: SPLIT INTO CHUNKS BY CONTEXT HEADERS FOR ABSOLUTE PRECISION
  const chunkMatches = Array.from(rawText.matchAll(/--- CONTEXT: (.*?) > (.*?) ---/g));
  const finalProcessedItems: any[] = [];
  const allWarnings: string[] = [];

  // If no headers found at all, treat as one chunk
  if (chunkMatches.length === 0) {
    const response = await generateContentWithRetry({
      contents: prompt + `\n\nSITE NOTES:\n${rawText}`,
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
                  quantity: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  itemType: { type: Type.STRING },
                  activityDescription: { type: Type.STRING },
                  plannedNextActivity: { type: Type.STRING }
                },
                required: ["quantity", "unit", "itemType", "activityDescription"]
              }
            }
          }
        }
      }
    });
    
    if (response.text) {
      const result = JSON.parse(response.text);
      if (result.items) finalProcessedItems.push(...result.items);
    }
  } else {
    // Process each chunk separately or in a more structured batch
    // For reliability when user intent is explicitly selected, we process each chunk
    for (let i = 0; i < chunkMatches.length; i++) {
        const match = chunkMatches[i];
        const nextMatch = chunkMatches[i + 1];
        const locContext = match[1].trim();
        const compContext = match[2].trim();
        
        let chunkText = '';
        if (nextMatch) {
            chunkText = rawText.substring(match.index! + match[0].length, nextMatch.index!).trim();
        } else {
            chunkText = rawText.substring(match.index! + match[0].length).trim();
        }

        if (!chunkText) continue;

        const response = await generateContentWithRetry({
            contents: `${prompt}\n\nFORCE CONTEXT: Location="${locContext}", Component="${compContext}"\n\nSITE NOTES:\n${chunkText}`,
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
                                    structuralElement: { type: Type.STRING },
                                    chainage: { type: Type.STRING },
                                    quantity: { type: Type.NUMBER },
                                    unit: { type: Type.STRING },
                                    itemType: { type: Type.STRING },
                                    activityDescription: { type: Type.STRING },
                                    plannedNextActivity: { type: Type.STRING }
                                },
                                required: ["quantity", "unit", "itemType", "activityDescription"]
                            }
                        }
                    }
                }
            }
        });

        if (response.text) {
            const result = JSON.parse(response.text);
            if (result.items) {
                result.items.forEach((item: any) => {
                    item.location = locContext;
                    item.component = compContext;
                    item.isForcedContext = true; // Mark as explicitly forced context
                    finalProcessedItems.push(item);
                });
            }
        }
    }
  }

  const finalItems = finalProcessedItems.map((item: any) => {
          let qty = Math.abs(item.quantity || 0);
          const unitMap: Record<string, string> = { 'sqm': 'm2', 'm2': 'm2', 'cum': 'm3', 'm3': 'm3', 'mt': 'Ton', 'ton': 'Ton', 'nos': 'nos', 'rm': 'rm', 't': 'Ton', 'kg': 'kg', 'kgs': 'kg' };
          let rawUnit = cleanStr(item.unit).toLowerCase();
          let finalUnit = unitMap[rawUnit] || cleanStr(item.unit) || "m3";
          
          // Rebar kg to Ton conversion
          const isRebar = (item.itemType && cleanStr(item.itemType).toLowerCase().includes('rebar')) || cleanStr(item.activityDescription).toLowerCase().includes('rebar');
          if (isRebar && (finalUnit.toLowerCase() === 'kg' || finalUnit.toLowerCase() === 'kgs')) {
              qty = qty / 1000;
              finalUnit = 'Ton';
          }
          
          let rawLoc = cleanStr(item.location);
          let rawComp = cleanStr(item.component);

          // STRICT OVERRIDE PROTECTION:
          // If the location and component already exactly match a valid combination in the hierarchy,
          // DO NOT fuzzy match. This protects chunk-forced context.
          let loc = rawLoc;
          let comp = rawComp;

          let exactMatchFound = false;
          // Look for case-insensitive exact matches to preserve hierarchy casing
          // OR if it's explicitly forced context, trust it
          if (item.isForcedContext) {
              exactMatchFound = true;
          } else {
              const matchingLocKey = Object.keys(hierarchyToUse).find(l => l.toLowerCase() === rawLoc.toLowerCase());
              if (matchingLocKey) {
                  const matchingCompKey = hierarchyToUse[matchingLocKey].find(c => c.toLowerCase() === rawComp.toLowerCase());
                  if (matchingCompKey) {
                      loc = matchingLocKey;
                      comp = matchingCompKey;
                      exactMatchFound = true;
                  }
              }
          }

          if (!exactMatchFound) {
              // Attempt 1: Direct/Fuzzy Match on Location Key
              let foundLocKey = Object.keys(hierarchyToUse).find(l => 
                  l.toLowerCase() === rawLoc.toLowerCase() || 
                  rawLoc.toLowerCase().includes(l.toLowerCase())
              );

              if (foundLocKey) {
                  loc = foundLocKey;
                  // Narrow down component within matched location
                  const foundCompKey = hierarchyToUse[foundLocKey].find(c => {
                      const cLower = c.toLowerCase();
                      const rCLower = rawComp.toLowerCase();
                      // Protect against empty strings or tiny strings matching everything
                      if (cLower.length < 3) return cLower === rCLower;
                      return cLower === rCLower || rCLower.includes(cLower) || cLower.includes(rCLower);
                  });
                  if (foundCompKey) comp = foundCompKey;
              }
          }

          let structuralElement = correctStructuralTypos(toTitleCase(cleanStr(item.structuralElement)));

          let chainage = cleanStr(item.chainage);

          // Force activityDescription format: "Action (Quantity Unit)"
          let desc = cleanStr(item.activityDescription);
          if (qty > 0) {
              const qtyString = `(${qty} ${finalUnit})`;
              
              if (!desc.includes(qtyString)) {
                  // Clean trailing quantity strings only, avoid destroying internal math strings
                  const trailingRegex = new RegExp(`[\\(]?\\d+(\\.\\d+)?\\s*(ton|mt|t|m3|m2|cum|sqm|nos|rm|unit|kg|kgs)[\\)]?$`, 'i');
                  const cleanDesc = desc.replace(trailingRegex, '').trim();
                  desc = `${cleanDesc} ${qtyString}`;
              }
          } else {
              const trailingRegex = new RegExp(`[\\(]?\\d+(\\.\\d+)?\\s*(ton|mt|t|m3|m2|cum|sqm|nos|rm|unit|kg|kgs)[\\)]?$`, 'i');
              desc = desc.replace(trailingRegex, '').trim();
          }

          let type = identifyItemType(desc, customItemTypes);
          
          // Fallback to AI classification if regex returns 'Other'
          if (type === 'Other' && item.itemType && cleanStr(item.itemType).toLowerCase() !== 'other') {
              type = toTitleCase(cleanStr(item.itemType));
          }

          // Explicit fallback for Concrete if still Other or generic C25
          if ((type === 'Other' || type === 'C25 Concrete' || type === 'C10 Plum Concrete') && (desc.toLowerCase().includes('concrete') || desc.toLowerCase().includes('concreting') || desc.toLowerCase().includes('plum'))) {
              const isPlum = desc.toLowerCase().includes('plum');
              const suffix = isPlum ? ' Plum Concrete' : ' Concrete';
              
              if (desc.toLowerCase().includes('c60') || desc.toLowerCase().includes('m60')) type = `C60${suffix}`;
              else if (desc.toLowerCase().includes('c55') || desc.toLowerCase().includes('m55')) type = `C55${suffix}`;
              else if (desc.toLowerCase().includes('c50') || desc.toLowerCase().includes('m50')) type = `C50${suffix}`;
              else if (desc.toLowerCase().includes('c45') || desc.toLowerCase().includes('m45')) type = `C45${suffix}`;
              else if (desc.toLowerCase().includes('c40') || desc.toLowerCase().includes('m40')) type = `C40${suffix}`;
              else if (desc.toLowerCase().includes('c35') || desc.toLowerCase().includes('m35')) type = `C35${suffix}`;
              else if (desc.toLowerCase().includes('c30') || desc.toLowerCase().includes('m30')) type = `C30${suffix}`;
              else if (desc.toLowerCase().includes('c25') || desc.toLowerCase().includes('m25')) type = `C25${suffix}`;
              else if (desc.toLowerCase().includes('c20') || desc.toLowerCase().includes('m20')) type = `C20${suffix}`;
              else if (desc.toLowerCase().includes('c15') || desc.toLowerCase().includes('m15')) type = `C15${suffix}`;
              else if (desc.toLowerCase().includes('c10') || desc.toLowerCase().includes('m10')) type = `C10${suffix}`;
              else if (type === 'Other') type = isPlum ? 'C10 Plum Concrete' : 'C25 Concrete';
          }

          // Explicit fallback for Formwork if still Other
          if (type === 'Other' && (
              desc.toLowerCase().includes('formwork') || 
              desc.toLowerCase().includes('form work') || 
              desc.toLowerCase().includes('shuttering') ||
              desc.toLowerCase().includes('shutter')
          )) {
              type = 'Formwork';
          }

          if (type.toLowerCase() === 'formworks' || type.toLowerCase() === 'shuttering' || type.toLowerCase() === 'shutter') {
              type = 'Formwork';
          }
          
          if (rawUnit.includes('bag')) { qty = qty * 0.05; finalUnit = 'Ton'; }
          if (type === 'Rebar' || finalUnit === 'Ton') { qty = Math.round(qty * 100) / 100; }
          
          // HDPE Pipe specific logic: multiply length by nos if both are present in description
          if (type === 'HDPE Pipe' || desc.toLowerCase().includes('hdpe')) {
              // Try to match "22 nos x 2.5m" or "22 x 2.5m"
              const calcMatch = desc.match(/(\d+(?:\.\d+)?)\s*(?:nos|pcs|pieces)?\s*[x\*]\s*(\d+(?:\.\d+)?)\s*(m|cm)/i);
              if (calcMatch) {
                  const nos = parseFloat(calcMatch[1]);
                  let length = parseFloat(calcMatch[2]);
                  const unit = calcMatch[3].toLowerCase();
                  if (unit === 'cm') length = length / 100;
                  
                  if (!isNaN(nos) && !isNaN(length)) {
                      qty = nos * length;
                      finalUnit = 'rm';
                  }
              } else {
                  // Fallback to separate matches
                  const nosMatch = desc.match(/(\d+(?:\.\d+)?)\s*(?:nos|number|pcs|pieces)/i);
                  const lengthMatch = desc.match(/(?:length|height)\s*(\d+(?:\.\d+)?)\s*(m|cm)/i) || desc.match(/(\d+(?:\.\d+)?)\s*(m|cm)\s*(?:length|height|each)/i);
                  
                  if (nosMatch && lengthMatch) {
                      const nos = parseFloat(nosMatch[1]);
                      let length = parseFloat(lengthMatch[1]);
                      const unit = lengthMatch[2].toLowerCase();
                      
                      if (unit === 'cm') {
                          length = length / 100;
                      }
                      
                      if (!isNaN(nos) && !isNaN(length)) {
                          qty = nos * length;
                          finalUnit = 'rm';
                      }
                  }
              }
          }

          // POST-PROCESSING: Extract structure from description if missing or generic
          if (!structuralElement || structuralElement.toLowerCase().includes('headrace') || structuralElement.toLowerCase().includes('tunnel')) {
              const structureKeywords = ["Panel", "Gantry", "Niche", "Invert", "Inverter", "Arch", "Wall", "Slab", "Face", "Crown", "Kicker", "Pier", "Abutment", "Glacis", "Apron", "Basin", "Soling", "Casing", "Bulkhead"];
              const foundKeyword = structureKeywords.find(kw => desc.toLowerCase().includes(kw.toLowerCase()));
              
              if (foundKeyword) {
                  // Special handling for Panel to include the number if possible
                  if (foundKeyword === "Panel") {
                      const panelMatch = desc.match(/Panel\s*[\d&\s]+/i);
                      structuralElement = panelMatch ? toTitleCase(panelMatch[0]) : "Panel";
                  } else {
                      structuralElement = correctStructuralTypos(toTitleCase(foundKeyword));
                  }
              }
          }

          // REPETITION PREVENTION: If structuralElement is identical to or contained within component, clear it
          const sLower = structuralElement.toLowerCase();
          const cLower = comp.toLowerCase();
          if (sLower === cLower || (sLower.length > 5 && cLower.includes(sLower))) {
              structuralElement = '';
          }

          // Fix typos in description as well
          desc = correctStructuralTypos(desc);

          const forbidden = ['not specified', 'unknown', 'n/a', 'undefined', 'null', 'select...'];
          if (forbidden.some(f => chainage.toLowerCase().includes(f))) chainage = '';
          if (forbidden.some(f => structuralElement.toLowerCase().includes(f))) structuralElement = '';

          return {
              extractedDate: cleanStr(item.extractedDate),
              location: loc,
              component: comp,
              structuralElement: structuralElement,
              chainage: chainage,
              chainageOrArea: `${chainage} ${structuralElement}`.trim(),
              activityDescription: desc,
              plannedNextActivity: cleanStr(item.plannedNextActivity) || "Continue works",
              quantity: qty,
              unit: finalUnit,
              itemType: type
          };
      });

      // Post-processing: Merge "next plan" items into preceding related items to avoid duplicate records
      const mergedItems: any[] = [];
      for (const item of finalItems) {
          const descLower = item.activityDescription.toLowerCase();
          const isNextPlanOnly = (item.quantity === 0 && (descLower.includes('next plan') || descLower.includes('planned work')));
          
          if (isNextPlanOnly && mergedItems.length > 0) {
              // Try to find a matching preceding item (same location and component)
              // We search backwards to find the most recent related activity
              let targetIdx = -1;
              for (let i = mergedItems.length - 1; i >= 0; i--) {
                  if (mergedItems[i].location === item.location && mergedItems[i].component === item.component) {
                      targetIdx = i;
                      break;
                  }
              }
              
              if (targetIdx !== -1) {
                  const existingPlan = mergedItems[targetIdx].plannedNextActivity;
                  const newPlan = item.activityDescription.replace(/next plan/gi, '').replace(/planned work/gi, '').trim();
                  const fullPlan = `${item.chainage} ${item.structuralElement} ${newPlan}`.trim();
                  
                  if (existingPlan === "Continue works" || !existingPlan) {
                      mergedItems[targetIdx].plannedNextActivity = fullPlan || "Continue works";
                  } else {
                      mergedItems[targetIdx].plannedNextActivity = `${existingPlan}; ${fullPlan}`;
                  }
                  continue; // Skip adding this item as a separate record
              }
          }
          mergedItems.push(item);
      }

  return { items: mergedItems, warnings: allWarnings };
};
