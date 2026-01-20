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
import { subscribeToReports, saveReportToCloud, logActivity, subscribeToLogs, signInWithGoogle, logoutUser, subscribeToAuth, moveItemToTrash, moveReportToTrash, subscribeToTrash, restoreTrashItem, savePermanentBackup, saveReportHistory, subscribeToSettings, getOrUpdateProfile, saveProjectSettings } from './services/firebaseService';
import { DailyReport, DPRItem, TabView, LogEntry, TrashItem, ProjectSettings, UserProfile } from './types';
import { getLocationPriority, LOCATION_HIERARCHY } from './utils/constants';

const DEFAULT_SETTINGS: ProjectSettings = {
  id: 'global_config',
  projectName: "Bhotekoshi Hydroelectric Project",
  description: "Standard Construction Progress Tracking",
  adminEmail: "",
  hierarchy: LOCATION_HIERARCHY,
  itemTypes: ["C25 Concrete", "C10 Plum Concrete", "C30 Concrete", "Rebar", "Formwork", "Excavation", "Shotcrete", "Gabion", "Stone Masonry"]
};

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
  const [reviewAlert, setReviewAlert] = useState<string | null>(null);

  useEffect(() => {
    const unsubAuth = subscribeToAuth(async (u: any) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        const p = await getOrUpdateProfile(u);
        setProfile(p);
      }
    });

    const unsubSettings = subscribeToSettings((s) => {
      if (s) {
        setSettings(s);
      } else {
        // If settings missing in DB, use default to allow app to start
        setSettings(DEFAULT_SETTINGS);
      }
    });

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
    
    // Check for "Review Needed" areas (e.g., Vertical Shaft mentioned in requirement)
    if (newItems.some(i => i.location.toLowerCase().includes('vertical shaft'))) {
      setReviewAlert("Pending review needed for Vertical Shaft area. Please verify quantities in the Quantities tab.");
    }

    const p = await getOrUpdateProfile(user);
    setProfile(p);
  };

  if (authLoading || !settings) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-100">
        <div className="spinner"></div>
        <div className="mt-4 text-slate-500 font-medium">Initializing Construction Environment...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
         <div className="bg-white rounded-3xl p-12 max-w-md w-full shadow-2xl text-center animate-fade-in">
             <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-500/20">
                <i className="fas fa-hard-hat text-white text-3xl"></i>
             </div>
             <h1 className="text-3xl font-bold mb-2 text-slate-800">DPR Maker Pro</h1>
             <p className="text-slate-500 text-sm mb-8">Professional Site Management & Progress Tracking</p>
             <button onClick={signInWithGoogle} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 shadow-lg hover:bg-indigo-700 transition-all active:scale-95">
                <i className="fab fa-google"></i> Sign in with Google
             </button>
             <p className="mt-6 text-xs text-slate-400">Access restricted to authorized personnel.</p>
         </div>
      </div>
    );
  }

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab} user={user} profile={profile} onLogout={logoutUser}>
      
      {reviewAlert && (
        <div className="mb-6 bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-sm flex justify-between items-center animate-fade-in">
           <div className="flex items-center gap-3">
              <i className="fas fa-triangle-exclamation text-amber-500 text-xl"></i>
              <div>
                 <p className="text-sm font-bold text-amber-800">Quantities Review Requested</p>
                 <p className="text-xs text-amber-700">{reviewAlert}</p>
              </div>
           </div>
           <button onClick={() => { setActiveTab(TabView.QUANTITY); setReviewAlert(null); }} className="text-xs font-bold bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 transition-all">Go to Quantities</button>
        </div>
      )}

      {activeTab === TabView.INPUT && (
        <InputSection 
           currentDate={currentDate} 
           onDateChange={setCurrentDate} 
           onItemsAdded={handleItemsAdded} 
           onViewReport={() => setActiveTab(TabView.VIEW_REPORT)} 
           entryCount={currentEntries.length} 
           user={user} 
           hierarchy={settings.hierarchy} 
        />
      )}

      {activeTab === TabView.VIEW_REPORT && (
        <ReportTable 
          report={{ 
            id: currentReportId || 'tmp', 
            date: currentDate, 
            lastUpdated: '', 
            projectTitle: settings.projectName, 
            entries: currentEntries 
          }} 
          onDeleteItem={(id) => {
            const item = currentEntries.find(i => i.id === id);
            if(item && currentReportId) {
               moveItemToTrash(item, currentReportId, currentDate, user.displayName);
               const next = currentEntries.filter(i => i.id !== id);
               setCurrentEntries(next);
               saveReportToCloud({ id: currentReportId, date: currentDate, entries: next, lastUpdated: new Date().toISOString(), projectTitle: settings.projectName });
            }
          }} 
          onUpdateItem={(id, field, value) => {
             const next = currentEntries.map(i => i.id === id ? { ...i, [field]: value } : i);
             setCurrentEntries(next);
             saveReportToCloud({ id: currentReportId, date: currentDate, entries: next, lastUpdated: new Date().toISOString(), projectTitle: settings.projectName });
          }} 
        />
      )}

      {activeTab === TabView.QUANTITY && <QuantityView reports={reports} user={user} settings={settings} />}
      {activeTab === TabView.SETTINGS && <SettingsTab settings={settings} user={user} />}
      {activeTab === TabView.LOGS && <ActivityLogs logs={logs} />}
      {activeTab === TabView.HISTORY && <HistoryList reports={reports} currentReportId={currentReportId || ''} onSelectReport={(id) => {
        const r = reports.find(x => x.id === id);
        if(r) { setCurrentDate(r.date); setActiveTab(TabView.VIEW_REPORT); }
      }} onDeleteReport={moveReportToTrash} onCreateNew={() => setActiveTab(TabView.INPUT)} />}
      {activeTab === TabView.RECYCLE_BIN && <RecycleBin logs={logs} trashItems={trashItems} onRestore={restoreTrashItem} />}
    </Layout>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);