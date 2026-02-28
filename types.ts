

export interface EditHistory {
  timestamp: string;
  user: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export interface DPRItem {
  id: string;
  location: string;
  component?: string; 
  structuralElement?: string; 
  chainage?: string; 
  chainageOrArea: string; 
  activityDescription: string;
  
  // Master Record Specifics
  quantity: number;
  unit: string;
  itemType?: string; // Auto-classified type (e.g. C25 Concrete)
  
  plannedNextActivity: string;
  createdBy?: string; 
  sourceBackupId?: string; 
  lastModifiedBy?: string;
  lastModifiedAt?: string;
  editHistory?: EditHistory[]; 
  isRecovered?: boolean;
}

export interface DailyReport {
  id: string;
  date: string;
  lastUpdated: string;
  projectTitle: string;
  companyName?: string;
  entries: DPRItem[];
  isRecovered?: boolean; 
}

export interface LogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string; 
  reportDate: string;
}

export interface TrashItem {
  trashId: string;
  originalId: string; 
  type: 'report' | 'item' | 'quantity';
  content: DailyReport | DPRItem | QuantityEntry; 
  deletedAt: string;
  deletedBy: string;
  reportDate: string;
  reportId?: string; 
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
  structure: string; 
  detailElement?: string; 
  detailLocation?: string; 
  itemType: string; 
  description: string;
  quantityValue: number; 
  quantityUnit: string; 
  originalRawString: string; 
  originalReportItemId?: string; 
  reportId?: string;
  lastUpdated: string;
  updatedBy: string;
}

export interface LiningEntry {
  id: string;
  date: string;
  stage: 'Invert' | 'Kicker' | 'Gantry';
  fromCh: number;
  toCh: number;
  volume: number;
  remarks: string;
  source: 'Legacy' | 'System' | 'Manual';
  status?: 'Verified' | 'Conflict' | 'New'; 
  lastUpdated: string;
  linkedItemId?: string; 
}

export interface ItemTypeDefinition {
    name: string;
    pattern: string; 
    defaultUnit: string;
    description?: string;
}

export interface TrainingExample {
  id: string;
  rawInput: string;
  expectedOutput: string; // JSON string
  category: 'location' | 'quantity' | 'general';
  createdAt: string;
}

export interface SubContractor {
  id: string;
  name: string;
  assignedComponents: string[]; // e.g., "Headrace Tunnel - HRT from Adit", "Main Building"
  rates: Record<string, number>; // e.g., { "C25 Concrete": 5000, "Formwork": 1200 }
  createdAt: string;
}

export interface ProjectSettings {
  projectName: string;
  companyName: string;
  projectDescription: string;
  locationHierarchy: Record<string, string[]>;
  itemTypes: ItemTypeDefinition[];
  blockedLiningItemIds?: string[];
  itemRates?: Record<string, number>;
}

// Added UserMood interface for MoodTracker component
export interface UserMood {
  id: string;
  uid: string;
  mood: 'Happy' | 'Excited' | 'Tired' | 'Frustrated' | 'Sad';
  note: string;
  timestamp: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  totalEntries: number;
  totalDays: number; 
  level: number;
  xp: number;
  joinedDate: string;
}

export interface SystemCheckpoint {
  id: string;
  timestamp: string;
  name: string;
  createdBy: string;
  data: {
    reports: DailyReport[];
    quantities: QuantityEntry[];
    lining: LiningEntry[];
    settings: ProjectSettings | null;
  };
}

export enum TabView {
  INPUT = 'input',
  VIEW_REPORT = 'view_report',
  QUANTITY = 'quantity',
  LINING = 'lining',
  FINANCIAL = 'financial',
  HISTORY = 'history',
  LOGS = 'logs',
  RECYCLE_BIN = 'recycle_bin',
  SETTINGS = 'settings',
  PROFILE = 'profile'
}