
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Layout } from './components/Layout';
import { InputSection } from './components/InputSection';
import { HistoryList } from './components/HistoryList';
import { ReportTable } from './components/ReportTable';
import { ActivityLogs } from './components/ActivityLogs';
import { RecycleBin } from './components/RecycleBin';
import { QuantityView } from './components/QuantityView';
import { SettingsTab } from './components/SettingsTab';
import { subscribeToReports, saveReportToCloud, logActivity, subscribeToLogs, signInWithGoogle, logoutUser, subscribeToAuth, moveItemToTrash, moveReportToTrash, subscribeToTrash, restoreTrashItem, savePermanentBackup, saveReportHistory, subscribeToSettings, getOrUpdateProfile } from './services/firebaseService';
import { DailyReport, DPRItem, TabView, LogEntry, TrashItem, ProjectSettings, UserProfile } from './types';
import { getLocationPriority } from './utils/constants';

const App = () => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabView>(() => (localStorage.getItem('activeTab') as TabView) || TabView.INPUT);
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentEntries, setCurrentEntries] = useState<DPRItem[]>([]);

  useEffect(() => {
    const unsubAuth = subscribeToAuth(async (u: any) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        const p = await getOrUpdateProfile(u);
        setProfile(p);
      }
    });
    const unsubSettings = subscribeToSettings(setSettings);
    return () => { unsubAuth(); unsubSettings(); };
  }, []);

  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);
  useEffect(() => { return subscribeToReports(setReports); }, []);
  useEffect(() => { return subscribeToLogs(setLogs); }, []);
  useEffect(() => { return subscribeToTrash(setTrashItems); }, []);

  useEffect(() => {
    const existing = reports.find(r => r.date === currentDate);
    if (existing) {
      setCurrentReportId(existing.id);
      setCurrentEntries(existing.entries);
    } else {
      setCurrentReportId(null);
      setCurrentEntries([]);
    }
  }, [currentDate, reports]);

  const handleItemsAdded = async (newItems: DPRItem[], rawText: string) => {
    const id = currentReportId || crypto.randomUUID();
    const updated = [...currentEntries, ...newItems].sort((a, b) => getLocationPriority(a.location) - getLocationPriority(b.location));
    setCurrentEntries(updated);
    setCurrentReportId(id);
    const report: DailyReport = { id, date: currentDate, lastUpdated: new Date().toISOString(), projectTitle: settings?.projectName || "DPR Report", entries: updated };
    await saveReportToCloud(report);
    const bid = await savePermanentBackup(currentDate, rawText, newItems, user.displayName, id);
    logActivity(user.displayName, "Report Updated", `Added ${newItems.length} items`, currentDate, bid);
    // Refresh profile locally to show level up
    const p = await getOrUpdateProfile(user);
    setProfile(p);
  };

  if (authLoading || !settings) return <div className="h-screen flex items-center justify-center bg-slate-100"><div className="spinner"></div></div>;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
         <div className="bg-white rounded-3xl p-12 max-w-md w-full shadow-2xl text-center">
             <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl"><i className="fas fa-hard-hat text-white text-3xl"></i></div>
             <h1 className="text-3xl font-bold mb-2">DPR Maker Pro</h1>
             <button onClick={signInWithGoogle} className="w-full mt-8 bg-indigo-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 shadow-lg hover:bg-indigo-700 transition-all"><i className="fab fa-google"></i> Sign in with Google</button>
         </div>
      </div>
    );
  }

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab} user={user} profile={profile} onLogout={logoutUser}>
      {activeTab === TabView.INPUT && <InputSection currentDate={currentDate} onDateChange={setCurrentDate} onItemsAdded={handleItemsAdded} onViewReport={() => setActiveTab(TabView.VIEW_REPORT)} entryCount={currentEntries.length} user={user} hierarchy={settings.hierarchy} />}
      {activeTab === TabView.VIEW_REPORT && <ReportTable report={{ id: currentReportId || 'tmp', date: currentDate, lastUpdated: '', projectTitle: settings.projectName, entries: currentEntries }} onDeleteItem={() => {}} onUpdateItem={() => {}} />}
      {activeTab === TabView.QUANTITY && <QuantityView reports={reports} user={user} settings={settings} />}
      {activeTab === TabView.SETTINGS && <SettingsTab settings={settings} user={user} />}
      {activeTab === TabView.LOGS && <ActivityLogs logs={logs} />}
      {activeTab === TabView.RECYCLE_BIN && <RecycleBin logs={logs} trashItems={trashItems} onRestore={restoreTrashItem} />}
    </Layout>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
