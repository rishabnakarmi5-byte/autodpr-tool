
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Layout } from './components/Layout';
import { InputSection } from './components/InputSection';
import { HistoryList } from './components/HistoryList';
import { ReportTable } from './components/ReportTable';
import { ActivityLogs } from './components/ActivityLogs';
import { RecycleBin } from './components/RecycleBin';
import { QuantityView } from './components/QuantityView';
import { HRTLiningView } from './components/HRTLiningView';
import { ProjectSettingsView } from './components/ProjectSettings';
import { ProfileView } from './components/ProfileView';
import { MasterRecordModal } from './components/MasterRecordModal';
import { subscribeToReports, saveReportToCloud, logActivity, subscribeToLogs, signInWithGoogle, logoutUser, subscribeToAuth, moveReportToTrash, subscribeToTrash, restoreTrashItem, savePermanentBackup, saveReportHistory, getProjectSettings, saveProjectSettings, incrementUserStats } from './services/firebaseService';
import { DailyReport, DPRItem, TabView, LogEntry, TrashItem, ProjectSettings, EditHistory } from './types';
import { getLocationPriority, LOCATION_HIERARCHY, parseQuantityDetails } from './utils/constants';

const App = () => {
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabView>(() => (localStorage.getItem('activeTab') as TabView) || TabView.INPUT);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentEntries, setCurrentEntries] = useState<DPRItem[]>([]);
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  
  // Undo/Redo Engine
  const [undoStack, setUndoStack] = useState<DPRItem[][]>([]);
  const [redoStack, setRedoStack] = useState<DPRItem[][]>([]);
  
  // Master Record Inspector
  const [inspectItem, setInspectItem] = useState<DPRItem | null>(null);
  const [isGlobalSaving, setIsGlobalSaving] = useState(false);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [hierarchy, setHierarchy] = useState(LOCATION_HIERARCHY);

  useEffect(() => {
    const unsubAuth = subscribeToAuth((u) => { setUser(u); setAuthLoading(false); });
    const unsubReports = subscribeToReports(setReports);
    const unsubLogs = subscribeToLogs(setLogs);
    const unsubTrash = subscribeToTrash(setTrashItems);
    getProjectSettings().then(s => { if(s) { setSettings(s); if(s.locationHierarchy) setHierarchy(s.locationHierarchy); } });
    return () => { unsubAuth(); unsubReports(); unsubLogs(); unsubTrash(); };
  }, []);

  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);

  useEffect(() => {
    const existing = reports.find(r => r.date === currentDate);
    if (existing) {
      setCurrentReportId(existing.id);
      setCurrentEntries(existing.entries);
    } else {
      setCurrentReportId(null);
      setCurrentEntries([]);
    }
    setUndoStack([]);
    setRedoStack([]);
  }, [currentDate, reports]);

  const getUserName = () => user?.displayName || user?.email || 'Anonymous';

  const saveState = async (entries: DPRItem[]) => {
    setUndoStack(prev => [currentEntries, ...prev].slice(0, 20));
    setRedoStack([]);
    setCurrentEntries(entries);
    
    const id = currentReportId || crypto.randomUUID();
    const report: DailyReport = {
      id,
      date: currentDate,
      lastUpdated: new Date().toISOString(),
      projectTitle: settings?.projectName || "Bhotekoshi Hydroelectric Project",
      entries
    };
    
    setIsGlobalSaving(true);
    try {
      await saveReportToCloud(report);
      saveReportHistory(report);
    } finally {
      setIsGlobalSaving(false);
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[0];
    setRedoStack(curr => [currentEntries, ...curr]);
    setUndoStack(curr => curr.slice(1));
    saveState(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setUndoStack(curr => [currentEntries, ...curr]);
    setRedoStack(curr => curr.slice(1));
    saveState(next);
  };

  const handleUpdateItem = (id: string, updates: Partial<DPRItem>) => {
    const newEntries = currentEntries.map(item => {
      if (item.id === id) {
        const history: EditHistory[] = Object.entries(updates).map(([field, val]) => ({
          timestamp: new Date().toISOString(),
          user: getUserName(),
          field,
          oldValue: String((item as any)[field] || ''),
          newValue: String(val)
        }));
        return { 
          ...item, 
          ...updates, 
          lastModifiedBy: getUserName(), 
          lastModifiedAt: new Date().toISOString(),
          editHistory: [...(item.editHistory || []), ...history]
        };
      }
      return item;
    });
    saveState(newEntries);
    if(inspectItem?.id === id) setInspectItem(prev => prev ? ({...prev, ...updates}) : null);
  };

  const handleItemsAdded = async (newItems: DPRItem[], rawText: string) => {
    const id = currentReportId || crypto.randomUUID();
    const backupId = await savePermanentBackup(currentDate, rawText, newItems, getUserName(), id);
    const stamped = newItems.map(i => ({...i, sourceBackupId: backupId || undefined}));
    const combined = [...currentEntries, ...stamped].sort((a, b) => getLocationPriority(a.location) - getLocationPriority(b.location));
    saveState(combined);
    logActivity(getUserName(), "Items Added", `Added ${newItems.length} records`, currentDate, backupId || undefined);
    incrementUserStats(user?.uid, newItems.length);
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  if (!user) return <div className="h-screen flex items-center justify-center"><button onClick={signInWithGoogle} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">Sign In to DPR Tool</button></div>;

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab} user={user} onLogout={logoutUser}>
        {activeTab === TabView.INPUT && <InputSection currentDate={currentDate} onDateChange={setCurrentDate} onItemsAdded={handleItemsAdded} onViewReport={() => setActiveTab(TabView.VIEW_REPORT)} entryCount={currentEntries.length} user={user} hierarchy={hierarchy} />}
        {activeTab === TabView.VIEW_REPORT && <ReportTable report={{id: currentReportId || '', date: currentDate, lastUpdated: '', projectTitle: settings?.projectName || '', entries: currentEntries}} onDeleteItem={(id) => saveState(currentEntries.filter(e => e.id !== id))} onUpdateItem={(id, f, v) => handleUpdateItem(id, {[f]: v})} onUpdateRow={handleUpdateItem} onUndo={handleUndo} canUndo={undoStack.length > 0} onRedo={handleRedo} canRedo={redoStack.length > 0} onInspectItem={setInspectItem} hierarchy={hierarchy} />}
        {activeTab === TabView.LINING && <HRTLiningView reports={reports} user={user} onInspectItem={setInspectItem} />}
        {activeTab === TabView.QUANTITY && <QuantityView reports={reports} user={user} onInspectItem={setInspectItem} />}
        {activeTab === TabView.HISTORY && <HistoryList reports={reports} currentReportId={currentReportId || ''} onSelectReport={(id) => { const r = reports.find(r=>r.id===id); if(r) setCurrentDate(r.date); setActiveTab(TabView.VIEW_REPORT); }} onDeleteReport={(id) => moveReportToTrash(reports.find(r=>r.id===id)!, getUserName())} onCreateNew={() => { setCurrentDate(new Date().toISOString().split('T')[0]); setActiveTab(TabView.INPUT); }} />}
        {activeTab === TabView.LOGS && <ActivityLogs logs={logs} />}
        {activeTab === TabView.RECYCLE_BIN && <RecycleBin logs={logs} trashItems={trashItems} onRestore={restoreTrashItem} />}
        {activeTab === TabView.SETTINGS && <ProjectSettingsView currentSettings={settings} onSave={(s) => { setSettings(s); setHierarchy(s.locationHierarchy); saveProjectSettings(s); }} reports={reports} quantities={[]} user={user} />}
        {activeTab === TabView.PROFILE && <ProfileView user={user} />}
        
        {inspectItem && <MasterRecordModal item={inspectItem} isOpen={true} onClose={() => setInspectItem(null)} onUpdate={handleUpdateItem} onSplit={(item) => {/* handle split */}} hierarchy={hierarchy} />}
        {isGlobalSaving && <div className="fixed bottom-8 right-8 bg-slate-900 text-white px-4 py-2 rounded-lg shadow-xl animate-bounce z-50 text-xs font-bold uppercase tracking-wider">Cloud Syncing...</div>}
    </Layout>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
