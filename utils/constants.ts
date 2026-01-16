
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