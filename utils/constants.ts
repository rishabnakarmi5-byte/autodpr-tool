
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

// Regex patterns to identify item types from description text
export const ITEM_PATTERNS = [
  { name: "C10 Concrete", pattern: /\b(c10|pcc|infill|grade 10)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C15 Concrete", pattern: /\b(c15|grade 15)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C20 Concrete", pattern: /\b(c20|grade 20)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C25 Concrete", pattern: /\b(c25|grade 25)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C30 Concrete", pattern: /\b(c30|grade 30)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "C35 Concrete", pattern: /\b(c35|grade 35)\b(?!.*plum)/i, defaultUnit: 'm3' },
  { name: "Plum Concrete", pattern: /\b(plum)\b/i, defaultUnit: 'm3' },
  { name: "Rebar", pattern: /\b(rebar|reinforcement|steel|tmt|bar)\b/i, defaultUnit: 'Ton' },
  { name: "Formwork", pattern: /\b(formwork|shuttering)\b/i, defaultUnit: 'm2' },
  { name: "Stone Masonry", pattern: /\b(masonry|rrm|ms wall|stone soling)\b/i, defaultUnit: 'm3' },
  { name: "Concrete Block", pattern: /\b(block work|concrete block|hollow block)\b/i, defaultUnit: 'm3' },
  { name: "Plaster", pattern: /\b(plaster)\b/i, defaultUnit: 'm2' },
  { name: "Excavation", pattern: /\b(excavation|mucking)\b/i, defaultUnit: 'm3' },
  { name: "Shotcrete", pattern: /\b(shotcrete|s\/c)\b/i, defaultUnit: 'm3' },
  { name: "Rock Bolt", pattern: /\b(rock bolt|bolt)\b/i, defaultUnit: 'nos' },
];