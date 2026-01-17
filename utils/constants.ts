

export const LOCATION_HIERARCHY: Record<string, string[]> = {
  "Headworks": [
    "Barrage",
    "Weir",
    "Upstream Apon",
    "Stilling Basin",
    "Syphon",
    "Intake",
    "Gravel Trap",
    "Settling Basin / Headpond",
    "Downstream Works",
    "Flood Walls",
    "Other Headworks"
  ],
  "Headrace Tunnel (HRT)": [
    "HRT from Inlet",
    "HRT from Adit",
    "Rock Trap",
    "Portals",
    "Adit Tunnel",
    "Other HRT Works"
  ],
  "Pressure Tunnels": [
    "Surge Tank",
    "Ventilation Tunnel",
    "Vertical Shaft",
    "Anchor Block (Top)",
    "Anchor Block (Bottom) or 90",
    "Lower Pressure Tunnel (LPT)",
    "Bifurcation or Y",
    "Other Works"
  ],
  "Powerhouse": [
    "Main Building",
    "Tailrace Tunnel (TRT)",
    "Tailrace Pool (TRT Pool)",
    "Turbine Outlet Gate",
    "Tailrace Gate",
    "Tailrace Downstream Apron and Flood Wall",
    "Transformer Cavern",
    "Control Building",
    "Service Bay",
    "Other Works"
  ]
};

// Defined sort order for the report
export const LOCATION_SORT_ORDER = [
  "Headworks",
  "Headrace Tunnel (HRT)",
  "Pressure Tunnels",
  "Powerhouse"
];

export const getLocationPriority = (location: string): number => {
  if (!location) return 999;
  const index = LOCATION_SORT_ORDER.findIndex(key => 
    location.toLowerCase().includes(key.toLowerCase()) || 
    key.toLowerCase().includes(location.toLowerCase())
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
  { regex: /\b(casing)\b/i, label: "Casing" },
  { regex: /\b(gantry)\b/i, label: "Gantry" },
  { regex: /\b(bulkhead)\b/i, label: "Bulkhead" },
  { regex: /\b(overbreak)\b/i, label: "Overbreak Zone" },
  { regex: /\b(machine hall)\b/i, label: "Machine Hall" },
  { regex: /\b(control building)\b/i, label: "Control Building" },
  { regex: /\b(service bay)\b/i, label: "Service Bay" },
  { regex: /\b(turbine floor)\b/i, label: "Turbine Floor" },
  { regex: /\b(generator floor)\b/i, label: "Generator Floor" },
  { regex: /\b(miv|main inlet valve)\b/i, label: "MIV" },
  { regex: /\b(first|1st)\s+lift\b/i, label: "1st Lift" },
  { regex: /\b(second|2nd)\s+lift\b/i, label: "2nd Lift" },
  { regex: /\b(third|3rd)\s+lift\b/i, label: "3rd Lift" },
  { regex: /\b(u\/s|upstream)\b/i, label: "U/S" },
  { regex: /\b(d\/s|downstream)\b/i, label: "D/S" },
  { regex: /\b(left\s+bank)\b/i, label: "LB" },
  { regex: /\b(right\s+bank)\b/i, label: "RB" },
];

// Expanded to handle "Ch 0 to 38m" and simple "0+000"
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
    // Group 1 is first number, Group 2 is second number (optional)
    const startRaw = match[1];
    const endRaw = match[2];

    const start = formatChainageNumber(startRaw);
    if (endRaw) {
      const end = formatChainageNumber(endRaw);
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
  let component = componentInput || "";
  
  // Try to find chainage in the "Chainage / Area" field first
  const chainageFromInput = extractChainageAndFormat(chainageOrAreaInput);
  
  if (!component) {
      if (chainageFromInput) {
        // chainageOrAreaInput was just a number "Ch 100". Component is inferred to be Location.
        component = location; 
      } else {
        // chainageOrAreaInput was likely a name "Barrage".
        component = chainageOrAreaInput; 
      }
  }

  // 2. Chainage Logic - PRIORITIZE explicit field
  if (chainageFromInput) {
      chainageStr = chainageFromInput;
  } else {
      // Fallback: try to find chainage in description
      chainageStr = extractChainageAndFormat(description);
  }

  // 3. Scan for Elements in Input & Description
  const combinedText = `${chainageOrAreaInput} ${description}`;
  STRUCTURAL_ELEMENTS.forEach(p => {
    if (p.regex.test(combinedText)) {
      elements.add(p.label);
    }
  });

  // 4. Elevation
  const elMatch = combinedText.match(ELEVATION_PATTERN);
  if (elMatch) {
    const elStr = elMatch[0].trim();
    // Append to chainage string for the "Chainage / EL" column
    chainageStr = chainageStr ? `${chainageStr}, ${elStr}` : elStr;
  }

  // 5. Contextual Rules for "Component" vs "Area"
  const lowerLoc = location.toLowerCase();
  const lowerDesc = combinedText.toLowerCase();

  // Rule: Tailrace + Lift -> Component = "Wall" or "Tailrace Tunnel" with Area "Wall"?
  if (lowerLoc.includes('tailrace') && lowerDesc.includes('lift')) {
      if (!elements.has('Wall')) elements.add('Wall');
      // If component is generic, we might want to ensure it says Tailrace Tunnel or Wall
      if (component === location) component = "Tailrace Tunnel (TRT)"; 
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
