
export interface DPRItem {
  id: string;
  location: string;
  chainageOrArea: string;
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
  details: string;
  reportDate: string;
}

export interface TrashItem {
  trashId: string;
  originalId: string; // ID of the report or the item
  type: 'report' | 'item';
  content: DailyReport | DPRItem; // The actual data to restore
  deletedAt: string;
  deletedBy: string;
  reportDate: string;
  reportId?: string; // If it's an item, we need to know which report it belonged to
}

export enum TabView {
  INPUT = 'input',
  VIEW_REPORT = 'view_report',
  HISTORY = 'history',
  LOGS = 'logs',
  RECYCLE_BIN = 'recycle_bin'
}

declare global {
  interface Window {
    html2canvas: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;
  }
}