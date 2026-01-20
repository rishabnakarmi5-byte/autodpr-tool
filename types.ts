

export interface DPRItem {
  id: string;
  location: string;
  component?: string; // Sub-location (e.g. Barrage, Powerhouse Main Building)
  structuralElement?: string; // New: Area (e.g. Raft, Wall)
  chainage?: string; // New: Chainage or Elevation
  chainageOrArea: string; // Legacy/Fallback: Combined string
  activityDescription: string;
  plannedNextActivity: string;
  createdBy?: string; // Track who added this item
}

export interface DailyReport {
  id: string;
  date: string;
  lastUpdated: string;
  projectTitle: string;
  entries: DPRItem[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string; // Can be a simple string or JSON stringified object
  reportDate: string;
}

export interface TrashItem {
  trashId: string;
  originalId: string; // ID of the report or the item
  type: 'report' | 'item' | 'quantity';
  content: DailyReport | DPRItem | QuantityEntry; // The actual data to restore
  deletedAt: string;
  deletedBy: string;
  reportDate: string;
  reportId?: string; // If it's an item, we need to know which report it belonged to
}

export interface BackupEntry {
  id: string;
  date: string;
  timestamp: string;
  user: string;
  rawInput: string;
  parsedItems: DPRItem[];
  reportIdContext: string;
}

export interface QuantityEntry {
  id: string;
  date: string;
  location: string;
  structure: string; // Component (e.g., Barrage, Weir)
  detailElement?: string; // "Area" (e.g., Raft, Wall, Kicker)
  detailLocation?: string; // "Chainage / EL" (e.g., Ch 100, EL 1177)
  itemType: string; // E.g., "C25 Concrete", "Rebar", "Formwork"
  description: string;
  quantityValue: number; // Parsed number
  quantityUnit: string; // Parsed unit
  originalRawString: string; // The full "35.6 m3" string
  originalReportItemId?: string; // Link to source report item (to prevent duplicates)
  reportId?: string;
  lastUpdated: string;
  updatedBy: string;
}

export interface ProjectSettings {
  projectName: string;
  projectDescription: string;
  locationHierarchy: Record<string, string[]>;
  customItems: string[];
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  totalEntries: number;
  totalDays: number; // Days active
  level: number;
  xp: number;
  joinedDate: string;
}

export enum TabView {
  INPUT = 'input',
  VIEW_REPORT = 'view_report',
  QUANTITY = 'quantity',
  HISTORY = 'history',
  LOGS = 'logs',
  RECYCLE_BIN = 'recycle_bin',
  SETTINGS = 'settings',
  PROFILE = 'profile'
}

declare global {
  interface Window {
    html2canvas: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;
  }
}