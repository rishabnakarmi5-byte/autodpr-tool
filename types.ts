
export interface DPRItem {
  id: string;
  location: string;
  component?: string;
  chainageOrArea: string;
  activityDescription: string;
  plannedNextActivity: string;
  createdBy?: string;
  isDefaulted?: boolean; // Flag if AI defaulted to C25
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
  details: string;
  reportDate: string;
  relatedBackupId?: string;
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

export interface ProjectSettings {
  id: string;
  projectName: string;
  description: string;
  adminEmail: string;
  hierarchy: Record<string, string[]>;
  itemTypes: string[];
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  joinDate: string;
  entryCount: number;
  exp: number;
  level: number;
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
