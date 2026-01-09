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

export enum TabView {
  INPUT = 'input',
  VIEW_REPORT = 'view_report',
  HISTORY = 'history'
}
