
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
}

export interface DailyReport {
  id: string;
  date: string;
  lastUpdated: string;
  projectTitle: string;
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
}

export interface ProjectSettings {
  projectName: string;
  projectDescription: string;
  locationHierarchy: Record<string, string[]>;
  itemTypes: ItemTypeDefinition[];
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

/**
 * Added UserMood interface to track user sentiment data
 */
export interface UserMood {
  id: string;
  uid: string;
  mood: 'Happy' | 'Excited' | 'Tired' | 'Frustrated' | 'Sad';
  note?: string;
  timestamp: string;
}

/**
 * Added SystemCheckpoint interface for full database snapshots and restore points
 */
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
  HISTORY = 'history',
  LOGS = 'logs',
  RECYCLE_BIN = 'recycle_bin',
  SETTINGS = 'settings',
  PROFILE = 'profile'
}
