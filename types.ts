export interface DPRItem {
  id: string;
  location: string;
  chainageOrArea: string;
  activityDescription: string;
  plannedNextActivity: string;
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

export enum TabView {
  INPUT = 'input',
  VIEW_REPORT = 'view_report',
  HISTORY = 'history',
  LOGS = 'logs'
}

declare global {
  interface Window {
    html2canvas: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;
  }
}