
export const LOCATION_HIERARCHY: Record<string, string[]> = {
  "Headworks": [
    "Barrage", 
    "Weir", 
    "Apron", 
    "Intake", 
    "Settling Basin", 
    "Headpond", 
    "Headworks Flood Walls"
  ],
  "HRT": [
    "HRT from Inlet", 
    "HRT from Adit", 
    "Rock Trap"
  ],
  "Pressure Tunnels": [
    "Vertical Shaft", 
    "Lower Pressure Tunnel", 
    "Anchor Block (Top)", 
    "Anchor Block (Bottom)", 
    "Surge Tank", 
    "Connecting Tunnel", 
    "Ventilation Shaft"
  ],
  "Powerhouse": [
    "Powerhouse Main building", 
    "Transformer Cavern", 
    "Tailrace Tunnel", 
    "Tailrace Pool", 
    "Tailrace Outlet", 
    "Tailrace Flood Walls"
  ],
  "Bifurcation": [
      "Bifurcation"
  ]
};

// Defined sort order for the report
export const LOCATION_SORT_ORDER = [
  "Headworks",
  "HRT",
  "HRT from Inlet",
  "HRT from Adit",
  "Pressure Tunnels",
  "Powerhouse",
  "Powerhouse Main Building",
  "Bifurcation",
  "Tailrace Tunnel"
];

export const getLocationPriority = (location: string): number => {
  if (!location) return 999;
  const index = LOCATION_SORT_ORDER.findIndex(key => 
    location.toLowerCase().includes(key.toLowerCase())
  );
  return index === -1 ? 999 : index;
};

// Regex patterns to identify item types
export const ITEM_PATTERNS = [
  { name: "Plum Concrete", pattern: /\b(plum)\b/i, defaultUnit: 'm3' },
  { name: "Shotcrete", pattern: /\b(shotcrete|s\/c)\b/i, defaultUnit: 'm3' },
  { name: "C10 Concrete", pattern: /\b(c10|pcc|infill|grade 10|m10)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C15 Concrete", pattern: /\b(c15|grade 15|m15)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C20 Concrete", pattern: /\b(c20|grade 20|m20)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C25 Concrete", pattern: /\b(c25|grade 25|m25)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C30 Concrete", pattern: /\b(c30|grade 30|m30)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C35 Concrete", pattern: /\b(c35|grade 35|m35)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "Rebar", pattern: /\b(rebar|reinforcement|steel|tmt|bar|tor)\b/i, defaultUnit: 'Ton' },
  { name: "Formwork", pattern: /\b(formwork|shuttering)\b/i, defaultUnit: 'm2' },
  { name: "Stone Masonry", pattern: /\b(masonry|rrm|ms wall|stone soling|soling)\b/i, defaultUnit: 'm3' },
  { name: "Concrete Block", pattern: /\b(block work|concrete block|hollow block|block)\b/i, defaultUnit: 'm3' },
  { name: "Plaster", pattern: /\b(plaster)\b/i, defaultUnit: 'm2' },
  { name: "Excavation", pattern: /\b(excavation|mucking|digging)\b/i, defaultUnit: 'm3' },
  { name: "Backfill", pattern: /\b(backfill|backfilling)\b/i, defaultUnit: 'm3' },
  { name: "Rock Bolt", pattern: /\b(rock bolt|bolt|anchor)\b/i, defaultUnit: 'nos' },
  { name: "Gabion", pattern: /\b(gabion)\b/i, defaultUnit: 'm3' },
];

export const STRUCTURAL_ELEMENTS = [
  { regex: /\b(raft|foundation|footing)\b/i, label: "Raft" },
  { regex: /\b(wall|walls|side wall)\b/i, label: "Wall" },
  { regex: /\b(kicker)\b/i, label: "Kicker" },
  { regex: /\b(invert|floor|bed)\b/i, label: "Invert" },
  { regex: /\b(arch|crown|roof)\b/i, label: "Arch" },
  { regex: /\b(key)\b/i, label: "Key" },
  { regex: /\b(slab|deck)\b/i, label: "Slab" },
  { regex: /\b(face)\b/i, label: "Face" },
  { regex: /\b(portal)\b/i, label: "Portal" },
  { regex: /\b(plug)\b/i, label: "Plug" },
  { regex: /\b(pier)\b/i, label: "Pier" },
  { regex: /\b(abutment)\b/i, label: "Abutment" },
  { regex: /\b(glacis)\b/i, label: "Glacis" },
  { regex: /\b(apron)\b/i, label: "Apron" },
  { regex: /\b(soling)\b/i, label: "Soling" },
  { regex: /\b(first|1st)\s+lift\b/i, label: "1st Lift" },
  { regex: /\b(second|2nd)\s+lift\b/i, label: "2nd Lift" },
  { regex: /\b(third|3rd)\s+lift\b/i, label: "3rd Lift" },
  { regex: /\b(u\/s|upstream)\b/i, label: "U/S" },
  { regex: /\b(d\/s|downstream)\b/i, label: "D/S" },
  { regex: /\b(left\s+bank)\b/i, label: "LB" },
  { regex: /\b(right\s+bank)\b/i, label: "RB" },
];

export const CHAINAGE_PATTERN = /(?:ch\.?|chainage)\s*([\d\+\-\.]+)(?:\s*(?:to|-)\s*([\d\+\-\.]+))?/i;
export const ELEVATION_PATTERN = /(?:el\.?|elevation|level)\s*([\d\+\-\.]+)(?:\s*(?:to|-)\s*([\d\+\-\.]+))?/i;

// --- Helper Functions ---

export const identifyItemType = (text: string): string => {
  for (const item of ITEM_PATTERNS) {
    if (item.pattern.test(text)) {
      return item.name;
    }
  }
  return "Other";
};

const formatChainageNumber = (valStr: string): string => {
  const clean = valStr.replace(/\+/g, '').replace(/m$/i, '').trim();
  const num = parseFloat(clean);
  if (isNaN(num)) return valStr;

  // If number is small (e.g. 38), assume 0+038
  const km = Math.floor(num / 1000);
  const m = Math.round(num % 1000); // Round to nearest int for standard chainage
  return `${km}+${m.toString().padStart(3, '0')}`;
};

export const extractChainageAndFormat = (text: string): string | null => {
  const match = text.match(CHAINAGE_PATTERN);
  if (match) {
    const start = formatChainageNumber(match[1]);
    if (match[2]) {
      const end = formatChainageNumber(match[2]);
      return `${start} to ${end} m`;
    }
    return `${start} m`;
  }
  return null;
};

// Unified extraction logic used by both QuantityView and ReportTable
export const parseQuantityDetails = (
  location: string,
  componentInput: string | undefined,
  chainageOrAreaInput: string,
  description: string
) => {
  const elements = new Set<string>();
  let chainageStr = null;
  
  // 1. Structure/Component Logic
  // If provided explicit component (from report), use it.
  // Otherwise default to chainageOrAreaInput if it's not purely a chainage string, or fallback to location.
  let component = componentInput || "";
  
  // Check if Chainage/Area Input is primarily Chainage
  const chainageFromInput = extractChainageAndFormat(chainageOrAreaInput);
  
  if (!component) {
      if (chainageFromInput) {
        // chainageOrAreaInput was just a number "Ch 100". Component is missing.
        component = location; 
      } else {
        // chainageOrAreaInput was likely a name "Barrage".
        component = chainageOrAreaInput; 
      }
  }

  // 2. Chainage Logic
  if (chainageFromInput) {
      chainageStr = chainageFromInput;
  }

  // 3. Scan for Elements in Input & Description
  const combinedText = `${chainageOrAreaInput} ${description}`;
  STRUCTURAL_ELEMENTS.forEach(p => {
    if (p.regex.test(combinedText)) {
      elements.add(p.label);
    }
  });

  // 4. Chainage from Description (if not found in input)
  if (!chainageStr) {
    chainageStr = extractChainageAndFormat(description);
  }

  // 5. Elevation
  const elMatch = combinedText.match(ELEVATION_PATTERN);
  if (elMatch) {
    const elStr = elMatch[0].trim();
    // Append to chainage string for the "Chainage / EL" column
    chainageStr = chainageStr ? `${chainageStr}, ${elStr}` : elStr;
  }

  // 6. Contextual Rules for "Component" vs "Area"
  const lowerLoc = location.toLowerCase();
  const lowerDesc = combinedText.toLowerCase();

  // Rule: Tailrace + Lift -> Component = "Wall" or "Tailrace Tunnel" with Area "Wall"?
  if (lowerLoc.includes('tailrace') && lowerDesc.includes('lift')) {
      if (!elements.has('Wall')) elements.add('Wall');
      // If component is generic, we might want to ensure it says Tailrace Tunnel or Wall
      if (component === location) component = "Tailrace Tunnel"; 
  }

  if (lowerLoc.includes('pressure tunnel') && lowerDesc.includes('lift')) {
      if (!elements.has('Infill')) elements.add('Infill');
  }
  
  // Clean up Elements string
  const detailElement = Array.from(elements).join(', ');

  return {
    structure: component,
    detailElement,
    detailLocation: chainageStr || ''
  };
};
