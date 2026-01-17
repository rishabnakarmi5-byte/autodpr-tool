
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
  ]
};

// Defined sort order for the report
export const LOCATION_SORT_ORDER = [
  "Headworks",
  "HRT from Inlet",
  "HRT from Adit",
  "Pressure Tunnels",
  "Powerhouse Main Building",
  "Powerhouse", 
  "Bifurcation",
  "Tailrace Tunnel"
];

export const getLocationPriority = (location: string): number => {
  if (!location) return 999;
  // Find index where the defined sort key is contained within the location string
  const index = LOCATION_SORT_ORDER.findIndex(key => 
    location.toLowerCase().includes(key.toLowerCase())
  );
  return index === -1 ? 999 : index;
};

// Regex patterns to identify item types from description text.
// ORDER MATTERS: Specific items checked before generic ones.
export const ITEM_PATTERNS = [
  // 1. Special Concrete Types
  { name: "Plum Concrete", pattern: /\b(plum)\b/i, defaultUnit: 'm3' },
  { name: "Shotcrete", pattern: /\b(shotcrete|s\/c)\b/i, defaultUnit: 'm3' },

  // 2. Standard Concrete Grades (Exclude Plum)
  { name: "C10 Concrete", pattern: /\b(c10|pcc|infill|grade 10|m10)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C15 Concrete", pattern: /\b(c15|grade 15|m15)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C20 Concrete", pattern: /\b(c20|grade 20|m20)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C25 Concrete", pattern: /\b(c25|grade 25|m25)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C30 Concrete", pattern: /\b(c30|grade 30|m30)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C35 Concrete", pattern: /\b(c35|grade 35|m35)\b(?!.*plum)/i, defaultUnit: 'm3' },
  
  // 3. Reinforcement / Steel
  { name: "Rebar", pattern: /\b(rebar|reinforcement|steel|tmt|bar|tor)\b/i, defaultUnit: 'Ton' },
  
  // 4. Formwork
  { name: "Formwork", pattern: /\b(formwork|shuttering)\b/i, defaultUnit: 'm2' },
  
  // 5. Masonry & Walls
  { name: "Stone Masonry", pattern: /\b(masonry|rrm|ms wall|stone soling|soling)\b/i, defaultUnit: 'm3' },
  { name: "Concrete Block", pattern: /\b(block work|concrete block|hollow block|block)\b/i, defaultUnit: 'm3' },
  { name: "Plaster", pattern: /\b(plaster)\b/i, defaultUnit: 'm2' },
  
  // 6. Earthworks
  { name: "Excavation", pattern: /\b(excavation|mucking|digging)\b/i, defaultUnit: 'm3' },
  { name: "Backfill", pattern: /\b(backfill|backfilling)\b/i, defaultUnit: 'm3' },

  // 7. Others
  { name: "Rock Bolt", pattern: /\b(rock bolt|bolt|anchor)\b/i, defaultUnit: 'nos' },
  { name: "Gabion", pattern: /\b(gabion)\b/i, defaultUnit: 'm3' },
];

// Patterns to extract "Specific Location" (Chainage / Area / Element)
export const EXTRACTION_PATTERNS = [
  // Structural Elements
  { regex: /\b(raft|foundation|footing)\b/i, label: "Raft" },
  { regex: /\b(wall|walls|side wall)\b/i, label: "Wall" },
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

  // Lifts and Sides
  { regex: /\b(first|1st)\s+lift\b/i, label: "1st Lift" },
  { regex: /\b(second|2nd)\s+lift\b/i, label: "2nd Lift" },
  { regex: /\b(third|3rd)\s+lift\b/i, label: "3rd Lift" },
  { regex: /\b(u\/s|upstream)\b/i, label: "U/S" },
  { regex: /\b(d\/s|downstream)\b/i, label: "D/S" },
  { regex: /\b(left\s+bank)\b/i, label: "LB" },
  { regex: /\b(right\s+bank)\b/i, label: "RB" },
];

export const CHAINAGE_REGEX = /(?:ch\.?|chainage)\s*([\d\+\-\.]+)/i;