
import { GoogleGenAI, Type } from "@google/genai";
import { DPRItem, TrainingExample } from "../types";
import { LOCATION_HIERARCHY, identifyItemType, ITEM_PATTERNS, toTitleCase } from "../utils/constants";
import { getTrainingExamples } from "./firebaseService";

const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
// Using gemini-3-flash-preview for high-speed, high-accuracy extraction
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-3-flash-preview';

const ai = new GoogleGenAI({ apiKey: API_KEY });

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
    1. structuralElement: Extract the specific part/area (e.g., "Spiral Casing Unit 1", "Crown", "end sill", "bottom sill", "Niche").
    2. activityDescription: MUST follow format "Action (Quantity Unit)". 
       Example: "C35 Concrete works (5 m3)".
       - IMPORTANT: Always include grades (C35, C25, M20) if present.
       - "ms wall" ALWAYS means "Stone Masonry" (e.g., "Niche ms wall" -> Stone Masonry at Niche).
       - If structure is extracted to 'structuralElement', try to simplify the description (e.g. "Spiral Casing Rebar" -> "Rebar works").
       - If NO quantity is specified, DO NOT include "(0 unit)" or any arbitrary quantity in the description. Just write the Action.
    3. Ensure 'quantity' and 'unit' are numeric/standardized. If no quantity is specified, return 0 for quantity and "" for unit. DO NOT hallucinate or default to 1.
       - Ignore negative signs if they are just separators (e.g., "Quantity -41m3" means 41).
       - For plum concrete: if the text mentions "batching only" or "batching quantity", multiply the given quantity by 5 to get the total plum concrete quantity (e.g., 18.5 * 5 = 92.5).
    4. chainage: Extract any chainage or elevation values (e.g., "CH 0+100", "EL 100", "506.25 to 427.25", "Ch-506.5 to 502.0").
    5. itemType: Classify the item type (e.g., "Formwork", "Rebar", "C25 Concrete", "Excavation"). 
       - IMPORTANT: "concreting" or "concrete" WITHOUT a grade ALWAYS defaults to "C25 Concrete".
       - "formwork" or "shuttering" ALWAYS defaults to "Formwork". NEVER use "Formworks" or "Shutters".
    6. HIERARCHY MAPPING: If you see "River protection", map it to "River Protection Works" under "Powerhouse".
    7. GANTRY HANDLING: If "Gantry" is mentioned, ALWAYS set "Gantry" as the 'structuralElement'.
    8. PANEL HANDLING: If "Panel" (e.g., "Panel 3", "Panel 5&6") is mentioned, ALWAYS set it as the 'structuralElement'.
    9. NEXT PLAN HANDLING: If the text contains "next plan" or "planned work", extract it into 'plannedNextActivity'.

    Output ONLY JSON.
  `;

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
      let desc = cleanStr(result.activityDescription);
      const qty = Math.abs(result.quantity || 0);
      const finalUnit = cleanStr(result.unit) || "m3";
      
      if (qty > 0) {
          const qtyString = `(${qty} ${finalUnit})`;
          if (!desc.includes(qtyString)) {
              const cleanDesc = desc.replace(/[\(]?\d+(\.\d+)?\s*(ton|mt|t|m3|m2|cum|sqm|nos|rm|unit)[\)]?/gi, '').replace(/\s*=\s*/g, '').trim();
              desc = `${cleanDesc} ${qtyString}`;
          }
      } else {
          desc = desc.replace(/[\(]?\d+(\.\d+)?\s*(ton|mt|t|m3|m2|cum|sqm|nos|rm|unit)[\)]?/gi, '').replace(/\(\s*\)/g, '').replace(/\s*=\s*/g, '').trim();
      }

      const identifiedType = identifyItemType(desc, customItemTypes);
      const finalType = (identifiedType === 'Other' && result.itemType && cleanStr(result.itemType).toLowerCase() !== 'other') 
          ? toTitleCase(cleanStr(result.itemType)) 
          : identifiedType;

      return {
        location: toTitleCase(cleanStr(result.location)),
        component: toTitleCase(cleanStr(result.component)),
        structuralElement: correctStructuralTypos(toTitleCase(cleanStr(result.structuralElement))),
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

  const prompt = `
    You are a high-precision construction data engine. Convert site notes into structured JSON records.

    STRICT ATOMIC RULES:
    1. MULTI-ACTIVITY SPLIT:
       - Split mixed text into separate items. (e.g. "48m3 concrete and rebar" -> two items).

    2. ACRONYM RESOLUTION (CRITICAL):
       - "HRT" ALWAYS means "Headrace Tunnel (HRT)".
       - "TRT" ALWAYS means "Powerhouse" related (e.g. Tailrace Tunnel).
       - "ms wall" ALWAYS means "Stone Masonry" (e.g., "Niche ms wall" -> Stone Masonry at Niche).
       - Never put "HRT" items under "Powerhouse".

    3. HIERARCHY MAPPING (STRICT):
       - Check the Provided HIERARCHY below. 
       - If you see "TRT Pool", map it to "Tailrace Pool (TRT Pool)" under "Powerhouse".
       - If you see "Inlet" or "Adit", map it to "Headrace Tunnel (HRT)".
       - If you see "River protection", map it to "River Protection Works" under "Powerhouse", and leave 'structuralElement' BLANK (empty string) because it has no sub-areas. Do NOT assign it to "Powerhouse Ventilation Tunnel".

    4. DESCRIPTION FORMAT:
       - 'activityDescription' MUST be: "Action (Quantity Unit)".
       - Include grades (C35, C25, M15) in the description.
       - If NO quantity is specified, DO NOT include "(0 unit)" or any arbitrary quantity in the description. Just write the Action.
       - For items like HDPE pipes, ensure the full detail (e.g., "HDPE pipe 14 nos x 2.5m") is included in the 'activityDescription' even if the total quantity is calculated.

    5. DATA MAPPING:
       - quantity: numeric only (ignore negative signs if they are just separators, e.g., "Quantity -41m3" means 41). If no quantity is specified in the text, return 0. DO NOT hallucinate or default to 1.
       - For plum concrete: if the text mentions "batching only" or "batching quantity", multiply the given quantity by 5 to get the total plum concrete quantity (e.g., 18.5 * 5 = 92.5).
       - For pipes (like HDPE pipe), if both length and number of pipes (nos) are provided, calculate the total quantity by multiplying length by nos. Include the calculation in the description (e.g., "HDPE pipes (22 nos x 2.5m)").
       - unit: standardized (m3, m2, Ton, nos, rm). For pipes with length, use 'rm'. If no quantity is specified, return "".
       - itemType: Classify the item type (e.g., "Formwork", "Rebar", "C25 Concrete", "Excavation"). 
         - IMPORTANT: "concreting" or "concrete" WITHOUT a grade ALWAYS defaults to "C25 Concrete".
         - "formwork" or "shuttering" ALWAYS defaults to "Formwork". NEVER use "Formworks" or "Shutters".
       - structuralElement: CRITICAL: Extract the specific part, area, or structure name from the description if not explicitly provided.
         Examples: "Gantry", "Spiral casing unit 1", "end sill", "bottom sill", "pier", "wall", "slab", "Crown", "Invert", "Glacis".
         - If you see "Inverter" or "Tunnel Inverter", convert it to "Invert".
         - If you see "Gantry" or "Gantry concreting", ensure "Gantry" is ALWAYS set as the 'structuralElement'.
         - If you see "Panel" (e.g., "Panel 3", "Panel 5&6"), ensure it is ALWAYS set as the 'structuralElement'.
       - chainage: Extract any chainage or elevation values (e.g., "CH 0+100", "EL 100", "506.25 to 427.25", "Ch-506.5 to 502.0").
       - plannedNextActivity: Extract any "next plan" or "planned work" information.

    6. NEXT PLAN HANDLING (CRITICAL):
       - If the text contains "next plan", "planned work", or "plan for tomorrow", extract that information into the 'plannedNextActivity' field of the RELEVANT PRECEDING activity.
       - DO NOT create a new, separate record for planned work. 
       - Example: "Gantry concrete 141m3, next plan gantry alignment" -> One record for Gantry concrete with 'plannedNextActivity' set to "Gantry alignment".

    7. DESCRIPTION CLEANUP:
       - If you extract a structure (e.g. "Spiral casing unit 1") into 'structuralElement', REMOVE it from 'activityDescription' to avoid duplication, UNLESS it makes the description unclear.
       - Keep the description focused on the action (e.g., "Rebar works", "Concrete casting").

    HIERARCHY REFERENCE:
    ${hierarchyString}

    RAW INPUT:
    """
    ${rawText}
    """
  `;

  try {
    const response = await generateContentWithRetry({
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
                    extractedDate: { type: Type.STRING },
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
                  required: ["location", "component", "activityDescription", "quantity", "unit"],
                },
             },
             warnings: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        },
      },
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      const unitMap: Record<string, string> = { 'sqm': 'm2', 'm2': 'm2', 'cum': 'm3', 'm3': 'm3', 'mt': 'Ton', 'ton': 'Ton', 'nos': 'nos', 'rm': 'rm', 't': 'Ton' };

      const processedItems = result.items.map((item: any) => {
          let rawUnit = cleanStr(item.unit).toLowerCase();
          let finalUnit = unitMap[rawUnit] || cleanStr(item.unit) || "m3";
          let qty = Math.abs(item.quantity || 0);
          
          let rawLoc = cleanStr(item.location);
          let rawComp = cleanStr(item.component);

          // ENHANCED GLOBAL SEARCH MAPPING
          let loc = rawLoc;
          let comp = rawComp;

          // Attempt 1: Direct/Fuzzy Match on Location Key
          let foundLocKey = Object.keys(hierarchyToUse).find(l => 
              l.toLowerCase() === rawLoc.toLowerCase() || 
              rawLoc.toLowerCase().includes(l.toLowerCase())
          );

          // Attempt 2: If no location match, search all components globally
          if (!foundLocKey) {
              for (const [lKey, cList] of Object.entries(hierarchyToUse)) {
                  const hasComp = cList.some(c => {
                      const cL = c.toLowerCase();
                      const rCL = rawComp.toLowerCase();
                      const rLL = rawLoc.toLowerCase();
                      return cL === rCL || cL === rLL || rCL.includes(cL) || rLL.includes(cL) || cL.includes(rCL) || cL.includes(rLL);
                  });
                  if (hasComp) {
                      foundLocKey = lKey;
                      break;
                  }
              }
          }

          if (foundLocKey) {
              loc = foundLocKey;
              // Narrow down component within matched location
              const foundCompKey = hierarchyToUse[foundLocKey].find(c => {
                  const cLower = c.toLowerCase();
                  const rCLower = rawComp.toLowerCase();
                  const rLLower = rawLoc.toLowerCase();
                  return cLower === rCLower || cLower === rLLower || rCLower.includes(cLower) || rLLower.includes(cLower) || cLower.includes(rCLower) || cLower.includes(rLLower);
              });
              if (foundCompKey) comp = foundCompKey;
          }

          let structuralElement = correctStructuralTypos(toTitleCase(cleanStr(item.structuralElement)));
          let chainage = cleanStr(item.chainage);

          // Force activityDescription format: "Action (Quantity Unit)"
          let desc = cleanStr(item.activityDescription);
          if (qty > 0) {
              const qtyString = `(${qty} ${finalUnit})`;
              
              if (!desc.includes(qtyString)) {
                  const cleanDesc = desc.replace(/[\(]?\d+(\.\d+)?\s*(ton|mt|t|m3|m2|cum|sqm|nos|rm|unit)[\)]?/gi, '').replace(/\s*=\s*/g, '').trim();
                  desc = `${cleanDesc} ${qtyString}`;
              }
          } else {
              // Strip out any hallucinated quantities if qty is 0
              desc = desc.replace(/[\(]?\d+(\.\d+)?\s*(ton|mt|t|m3|m2|cum|sqm|nos|rm|unit)[\)]?/gi, '').replace(/\(\s*\)/g, '').replace(/\s*=\s*/g, '').trim();
          }

          let type = identifyItemType(desc, customItemTypes);
          
          // Fallback to AI classification if regex returns 'Other'
          if (type === 'Other' && item.itemType && cleanStr(item.itemType).toLowerCase() !== 'other') {
              type = toTitleCase(cleanStr(item.itemType));
          }

          // Explicit fallback for Concrete if still Other
          if (type === 'Other' && (desc.toLowerCase().includes('concrete') || desc.toLowerCase().includes('concreting'))) {
              type = 'C25 Concrete';
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
      for (const item of processedItems) {
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

      return { items: mergedItems, warnings: result.warnings || [] };
    }
    return { items: [], warnings: [] };
  } catch (error) {
    console.error("AI Parsing Error:", error);
    throw error;
  }
};
