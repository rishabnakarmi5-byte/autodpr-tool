
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Layout } from './components/Layout';
import { InputSection } from './components/InputSection';
import { HistoryList } from './components/HistoryList';
import { ReportTable } from './components/ReportTable';
import { ActivityLogs } from './components/ActivityLogs';
import { RecycleBin } from './components/RecycleBin';
import { QuantityView } from './components/QuantityView';
import { ProjectSettingsView } from './components/ProjectSettings';
import { ProfileView } from './components/ProfileView';
import { subscribeToReports, saveReportToCloud, deleteReportFromCloud, logActivity, subscribeToLogs, signInWithGoogle, logoutUser, subscribeToAuth, moveItemToTrash, moveReportToTrash, subscribeToTrash, restoreTrashItem, savePermanentBackup, saveReportHistory, syncQuantitiesFromItems, getProjectSettings, saveProjectSettings, incrementUserStats, subscribeToQuantities, updateQuantity } from './services/firebaseService';
import { DailyReport, DPRItem, TabView, LogEntry, TrashItem, ProjectSettings, QuantityEntry, BackupEntry } from './types';
import { getLocationPriority, LOCATION_HIERARCHY, parseQuantityDetails } from './utils/constants';

const App = () => {
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<TabView>(() => {
    return (localStorage.getItem('activeTab') as TabView) || TabView.INPUT;
  });
  
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [allQuantities, setAllQuantities] = useState<QuantityEntry[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentEntries, setCurrentEntries] = useState<DPRItem[]>([]);
  const [undoStack, setUndoStack] = useState<DPRItem[][]>([]);
  const [redoStack, setRedoStack] = useState<DPRItem[][]>([]);
  const [isGlobalSaving, setIsGlobalSaving] = useState(false); // New global saving lock
  
  // Settings State
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [hierarchy, setHierarchy] = useState(LOCATION_HIERARCHY);

  useEffect(() => {
    const unsubscribeAuth = subscribeToAuth((u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) logActivity(u.displayName || u.email || 'Unknown', "Session Active", "User authenticated via Google", "N/A");
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    const unsubscribe = subscribeToReports((data) => setReports(data));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToLogs((data) => setLogs(data));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToTrash((data) => setTrashItems(data));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToQuantities((data) => setAllQuantities(data));
    return () => unsubscribe();
  }, []);

  // Load Settings
  useEffect(() => {
      getProjectSettings().then(s => {
          if(s) {
              setSettings(s);
              if(s.locationHierarchy) setHierarchy(s.locationHierarchy);
          }
      });
  }, []);

  useEffect(() => {
    const existingReport = reports.find(r => r.date === currentDate);
    if (existingReport) {
      if (currentReportId !== existingReport.id) setCurrentReportId(existingReport.id);
      if (JSON.stringify(existingReport.entries) !== JSON.stringify(currentEntries)) setCurrentEntries(existingReport.entries);
    } else {
      const isIdBelongingToOtherDate = reports.some(r => r.id === currentReportId && r.date !== currentDate);
      if (isIdBelongingToOtherDate || !currentReportId) {
         setCurrentReportId(null); 
         setCurrentEntries([]);
      }
    }
  }, [currentDate, reports]);
  
  useEffect(() => {
      setUndoStack([]);
      setRedoStack([]);
  }, [currentDate, currentReportId]);

  const handleLogin = async () => { try { await signInWithGoogle(); } catch (error) { alert("Failed to sign in."); } };
  const getUserName = () => user?.displayName || user?.email || 'Anonymous';
  const handleSelectReport = (id: string) => { const r = reports.find(r => r.id === id); if (r) { setCurrentDate(r.date); setActiveTab(TabView.VIEW_REPORT); } };
  const handleCreateNew = () => { setCurrentDate(new Date().toISOString().split('T')[0]); setActiveTab(TabView.INPUT); };
  
  const handleTabChange = (tab: TabView) => {
      if (tab === TabView.INPUT) setCurrentDate(new Date().toISOString().split('T')[0]);
      setActiveTab(tab);
  };

  const saveCurrentState = async (entries: DPRItem[], date: string, reportId: string | null, isRecovered = false) => {
    const id = reportId || crypto.randomUUID();
    // Optimistic Update locally immediately
    if (!reportId) setCurrentReportId(id);
    setCurrentEntries(entries);

    const report: DailyReport = {
      id, 
      date, 
      lastUpdated: new Date().toISOString(), 
      projectTitle: settings?.projectName || "Bhotekoshi Hydroelectric Project", 
      entries,
      isRecovered
    };

    try {
      // Critical: Await the cloud save to ensure data persistence
      await saveReportToCloud(report);
      // Background saves
      saveReportHistory(report).catch(console.error);
      return report;
    } catch (e) { 
      console.error("Failed to save", e); 
      alert("CRITICAL ERROR: Failed to save report to cloud. Please check your internet.");
      return null; 
    }
  };

  // Helper to manage undo stack push
  const pushUndo = (entries: DPRItem[]) => {
      setUndoStack(prev => [...prev.slice(-19), entries]);
      setRedoStack([]); // Clear redo on new action
  };

  const handleItemsAdded = async (newItems: DPRItem[], rawText: string) => {
    setIsGlobalSaving(true);
    try {
        const existingReportOnServer = reports.find(r => r.date === currentDate);
        const effectiveReportId = existingReportOnServer ? existingReportOnServer.id : (currentReportId || crypto.randomUUID());
        const baseEntries = existingReportOnServer ? existingReportOnServer.entries : currentEntries;

        pushUndo(baseEntries);
        
        // 1. First save the Backup - this is our safety net
        const backupId = await savePermanentBackup(currentDate, rawText, newItems, getUserName(), effectiveReportId);

        let updatedEntries = [...baseEntries, ...newItems];
        updatedEntries.sort((a, b) => getLocationPriority(a.location) - getLocationPriority(b.location));
        
        // 2. Save Report to Cloud & Wait for confirmation
        const savedReport = await saveCurrentState(updatedEntries, currentDate, effectiveReportId);
        
        // 3. One Shot Sync: Quantities (Background)
        if (savedReport) {
            syncQuantitiesFromItems(newItems, savedReport, getUserName()).catch(console.error);
            incrementUserStats(user?.uid, newItems.length).catch(console.error);
        }
        
        logActivity(getUserName(), "Report Updated", `Added ${newItems.length} items`, currentDate, backupId || undefined);
    } catch(e) {
        alert("Error saving data. Please check your connection.");
    } finally {
        setIsGlobalSaving(false);
    }
  };

  const handleUpdateItem = (id: string, field: keyof DPRItem, value: string) => {
    pushUndo(currentEntries);
    const updatedEntries = currentEntries.map(item => item.id === id ? { ...item, [field]: value } : item);
    saveCurrentState(updatedEntries, currentDate, currentReportId); // background save for small edits
    logActivity(getUserName(), "Updated Item", `Changed ${field}`, currentDate);
  };

  const handleDeleteItem = async (id: string) => {
    pushUndo(currentEntries);
    const item = currentEntries.find(i => i.id === id);
    if (!item || !currentReportId) return;
    await moveItemToTrash(item, currentReportId, currentDate, getUserName());
    const updatedEntries = currentEntries.filter(item => item.id !== id);
    saveCurrentState(updatedEntries, currentDate, currentReportId);
    logActivity(getUserName(), "Deleted Item", `Deleted entry for ${item?.location}`, currentDate);
  };

  const handleUndo = async () => {
      if (undoStack.length === 0) return;
      const previousState = undoStack[undoStack.length - 1];
      setRedoStack(prev => [...prev, currentEntries]);
      setUndoStack(undoStack.slice(0, -1));
      await saveCurrentState(previousState, currentDate, currentReportId);
      logActivity(getUserName(), "Undo", "Reverted report state", currentDate);
  };

  const handleRedo = async () => {
      if (redoStack.length === 0) return;
      const nextState = redoStack[redoStack.length - 1];
      setUndoStack(prev => [...prev, currentEntries]);
      setRedoStack(redoStack.slice(0, -1));
      await saveCurrentState(nextState, currentDate, currentReportId);
      logActivity(getUserName(), "Redo", "Restored report state", currentDate);
  };

  const handleNormalizeReport = async () => {
      pushUndo(currentEntries);
      const updatedEntries = currentEntries.map(item => {
          const parsed = parseQuantityDetails(item.location, item.component, item.chainageOrArea, item.activityDescription);
          return {
              ...item,
              component: parsed.structure || item.component,
              structuralElement: parsed.detailElement || item.structuralElement,
              chainage: parsed.detailLocation || item.chainage
          };
      });
      await saveCurrentState(updatedEntries, currentDate, currentReportId);
      logActivity(getUserName(), "Normalize", "Re-parsed all items in active report", currentDate);
  };

  const handleNormalizeQuantities = async () => {
      if (!confirm("This will re-scan and normalize Chainage & Area for ALL quantities in the system. Continue?")) return;
      let count = 0;
      for (const qty of allQuantities) {
          const parsed = parseQuantityDetails(qty.location, qty.structure, qty.detailLocation || '', qty.description);
          if (parsed.detailElement !== qty.detailElement || parsed.detailLocation !== qty.detailLocation) {
              await updateQuantity({
                  ...qty,
                  detailElement: parsed.detailElement || qty.detailElement,
                  detailLocation: parsed.detailLocation || qty.detailLocation,
                  lastUpdated: new Date().toISOString()
              }, qty, getUserName());
              count++;
          }
      }
      alert(`Normalized ${count} entries.`);
      logActivity(getUserName(), "Normalize Quantities", `Batch updated ${count} entries`, new Date().toISOString());
  };

  const handleSaveSettings = async (s: ProjectSettings) => {
      setSettings(s);
      setHierarchy(s.locationHierarchy);
      await saveProjectSettings(s);
  };

  // --- RECOVERY FEATURE ---
  const handleRecoverBackup = async (backup: BackupEntry) => {
      if (window.confirm(`Create a NEW report for ${backup.date} from this backup? This will overwrite any existing unsaved draft for that date.`)) {
          setIsGlobalSaving(true);
          try {
             const reportId = crypto.randomUUID();
             const entries = backup.parsedItems.map(item => ({...item, id: crypto.randomUUID()})); // Regen IDs
             
             await saveCurrentState(entries, backup.date, reportId, true);
             
             // Sync Qty
             await syncQuantitiesFromItems(entries, { id: reportId, date: backup.date, entries } as DailyReport, `RECOVERY_${getUserName()}`);

             setCurrentDate(backup.date);
             setCurrentReportId(reportId);
             setCurrentEntries(entries);
             setActiveTab(TabView.VIEW_REPORT);
             logActivity(getUserName(), "RECOVERY", `Restored report from backup ID ${backup.id}`, backup.date);
          } catch(e) {
             alert("Recovery failed.");
          } finally {
             setIsGlobalSaving(false);
          }
      }
  };

  const currentReport: DailyReport = {
    id: currentReportId || 'temp', date: currentDate, lastUpdated: new Date().toISOString(), projectTitle: settings?.projectName || "Bhotekoshi Hydroelectric Project", entries: currentEntries
  };

  if (authLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-slate-500 font-medium animate-pulse">Initializing...</p>
          </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
         <div className="absolute inset-0 z-0 opacity-10">
             <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-400 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2"></div>
             <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-400 rounded-full blur-[100px] translate-x-1/2 translate-y-1/2"></div>
         </div>
         <div className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full relative z-10 text-center">
             <div className="w-24 h-24 bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-200 rotate-3 hover:rotate-6 transition-transform">
                <i className="fas fa-hard-hat text-4xl text-white"></i>
             </div>
             <h1 className="text-3xl font-extrabold text-slate-800 mb-2 tracking-tight">DPR Maker</h1>
             <p className="text-slate-500 mb-8 leading-relaxed">Construction Daily Progress Reporting</p>
             <button 
                 onClick={handleLogin}
                 className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:-translate-y-1 shadow-lg flex items-center justify-center gap-3 group relative overflow-hidden"
             >
                 <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                 <i className="fab fa-google text-lg"></i>
                 <span>Sign In with Google</span>
             </button>
         </div>
      </div>
    );
  }

  return (
    <Layout activeTab={activeTab} onTabChange={handleTabChange} user={user} onLogout={logoutUser}>
        {activeTab === TabView.INPUT && <InputSection currentDate={currentDate} onDateChange={setCurrentDate} onItemsAdded={handleItemsAdded} onViewReport={() => setActiveTab(TabView.VIEW_REPORT)} entryCount={currentEntries.length} user={user} hierarchy={hierarchy} />}
        {activeTab === TabView.VIEW_REPORT && <ReportTable report={currentReport} onDeleteItem={handleDeleteItem} onUpdateItem={handleUpdateItem} onUndo={handleUndo} canUndo={undoStack.length > 0} onRedo={handleRedo} canRedo={redoStack.length > 0} onNormalize={handleNormalizeReport} hierarchy={hierarchy} />}
        {activeTab === TabView.QUANTITY && <QuantityView reports={reports} user={user} onNormalize={handleNormalizeQuantities} />}
        {activeTab === TabView.HISTORY && <HistoryList reports={reports} currentReportId={currentReportId || ''} onSelectReport={handleSelectReport} onDeleteReport={async (id) => { await moveReportToTrash(reports.find(r => r.id === id)!, getUserName()); }} onCreateNew={handleCreateNew} />}
        {activeTab === TabView.LOGS && <ActivityLogs logs={logs} onRecover={handleRecoverBackup} />}
        {activeTab === TabView.RECYCLE_BIN && <RecycleBin logs={logs} trashItems={trashItems} onRestore={async (item) => { await restoreTrashItem(item); }} />}
        {activeTab === TabView.SETTINGS && <ProjectSettingsView currentSettings={settings} onSave={handleSaveSettings} />}
        {activeTab === TabView.PROFILE && <ProfileView user={user} />}
        
        {/* Global Saving Overlay */}
        {isGlobalSaving && (
            <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center backdrop-blur-sm">
                <div className="bg-white p-6 rounded-2xl flex flex-col items-center shadow-2xl animate-bounce-in">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <h3 className="text-lg font-bold text-slate-800">Saving Securely...</h3>
                    <p className="text-sm text-slate-500">Writing to Cloud Database</p>
                </div>
            </div>
        )}
    </Layout>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
