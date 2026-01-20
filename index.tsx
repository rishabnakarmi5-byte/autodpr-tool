
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Layout } from './components/Layout';
import { InputSection } from './components/InputSection';
import { HistoryList } from './components/HistoryList';
import { ReportTable } from './components/ReportTable';
import { ActivityLogs } from './components/ActivityLogs';
import { RecycleBin } from './components/RecycleBin';
import { QuantityView } from './components/QuantityView';
import { subscribeToReports, saveReportToCloud, deleteReportFromCloud, logActivity, subscribeToLogs, signInWithGoogle, logoutUser, subscribeToAuth, moveItemToTrash, moveReportToTrash, subscribeToTrash, restoreTrashItem, savePermanentBackup, saveReportHistory } from './services/firebaseService';
import { DailyReport, DPRItem, TabView, LogEntry, TrashItem } from './types';
import { getLocationPriority } from './utils/constants';

const App = () => {
  // --- STATE ---
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [configError, setConfigError] = useState(false);
  
  const [activeTab, setActiveTab] = useState<TabView>(() => {
    return (localStorage.getItem('activeTab') as TabView) || TabView.INPUT;
  });
  
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentEntries, setCurrentEntries] = useState<DPRItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Undo Stack State
  const [undoStack, setUndoStack] = useState<DPRItem[][]>([]);

  // --- PERSISTENCE & SYNC ---

  useEffect(() => {
    // Check if configuration is missing immediately
    if (!process.env.FIREBASE_API_KEY || process.env.FIREBASE_API_KEY === 'undefined') {
       setConfigError(true);
       setAuthLoading(false); // Stop spinner
       return;
    }

    const unsubscribeAuth = subscribeToAuth((u: any) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        logActivity(u.displayName || u.email || 'Unknown', "Session Active", "User authenticated via Google", "N/A");
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  // Sync Reports from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToReports((data: DailyReport[]) => {
      setReports(data);
    });
    return () => unsubscribe();
  }, []);

  // Sync Logs from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToLogs((data: LogEntry[]) => setLogs(data));
    return () => unsubscribe();
  }, []);

  // Sync Trash Items
  useEffect(() => {
    const unsubscribe = subscribeToTrash((data: TrashItem[]) => setTrashItems(data));
    return () => unsubscribe();
  }, []);

  // When reports update or date changes, ensure the active view reflects the date's report
  useEffect(() => {
    const existingReport = reports.find(r => r.date === currentDate);

    if (existingReport) {
      if (currentReportId !== existingReport.id) {
         setCurrentReportId(existingReport.id);
      }
      if (JSON.stringify(existingReport.entries) !== JSON.stringify(currentEntries)) {
         setCurrentEntries(existingReport.entries);
      }
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
  }, [currentDate, currentReportId]);


  // --- HANDLERS ---

  const handleLogin = async () => {
    if (configError) {
      alert("Cannot login: Firebase configuration is missing.");
      return;
    }
    try {
      await signInWithGoogle();
    } catch (error) {
      alert("Failed to sign in via Google. Please check your internet connection.");
    }
  };

  const getUserName = () => user?.displayName || user?.email || 'Anonymous';

  const handleSelectReport = (id: string) => {
    const report = reports.find(r => r.id === id);
    if (report) {
      setCurrentDate(report.date);
      setActiveTab(TabView.VIEW_REPORT);
    }
  };

  const handleCreateNew = () => {
    setCurrentDate(new Date().toISOString().split('T')[0]);
    setActiveTab(TabView.INPUT);
  };
  
  const handleTabChange = (tab: TabView) => {
      if (tab === TabView.INPUT) {
          const today = new Date().toISOString().split('T')[0];
          setCurrentDate(today);
      }
      setActiveTab(tab);
  };

  const handleViewReport = () => {
    setActiveTab(TabView.VIEW_REPORT);
  };

  const saveCurrentState = async (entries: DPRItem[], date: string, reportId: string | null) => {
    const id = reportId || crypto.randomUUID();
    if (!reportId) setCurrentReportId(id);
    
    setIsSaving(true);
    const report: DailyReport = {
      id,
      date,
      lastUpdated: new Date().toISOString(),
      projectTitle: "Bhotekoshi Hydroelectric Project",
      entries
    };
    
    try {
      await saveReportToCloud(report);
      await saveReportHistory(report);
    } catch (e) {
      console.error("Failed to save", e);
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  // --- UNDO SYSTEM ---
  const captureUndoState = (entries: DPRItem[]) => {
      setUndoStack(prev => [...prev.slice(-19), entries]);
  };

  const handleUndo = async () => {
      if (undoStack.length === 0) return;
      
      const previousState = undoStack[undoStack.length - 1];
      const newStack = undoStack.slice(0, -1);
      
      setUndoStack(newStack);
      setCurrentEntries(previousState);
      await saveCurrentState(previousState, currentDate, currentReportId);
      
      logActivity(getUserName(), "Undo", "Reverted report to previous state", currentDate);
  };

  const handleItemsAdded = async (newItems: DPRItem[], rawText: string) => {
    const existingReportOnServer = reports.find(r => r.date === currentDate);
    const effectiveReportId = existingReportOnServer ? existingReportOnServer.id : (currentReportId || crypto.randomUUID());
    const baseEntries = existingReportOnServer ? existingReportOnServer.entries : currentEntries;

    captureUndoState(baseEntries);

    const backupId = await savePermanentBackup(currentDate, rawText, newItems, getUserName(), effectiveReportId);

    let updatedEntries = [...baseEntries, ...newItems];
    updatedEntries.sort((a, b) => {
      return getLocationPriority(a.location) - getLocationPriority(b.location);
    });
    
    setCurrentReportId(effectiveReportId);
    setCurrentEntries(updatedEntries);
    
    await saveCurrentState(updatedEntries, currentDate, effectiveReportId);
    
    logActivity(
      getUserName(), 
      "Report Updated", 
      `Added ${newItems.length} items`, 
      currentDate,
      backupId || undefined
    );
  };

  const handleUpdateItem = (id: string, field: keyof DPRItem, value: string) => {
    const updatedEntries = currentEntries.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    );
    setCurrentEntries(updatedEntries);
    saveCurrentState(updatedEntries, currentDate, currentReportId);
    
    const item = currentEntries.find(i => i.id === id);
    logActivity(getUserName(), "Updated Item", `Changed ${field}`, currentDate);
  };

  const handleUpdateAllEntries = (newEntries: DPRItem[]) => {
    captureUndoState(currentEntries);
    setCurrentEntries(newEntries);
    saveCurrentState(newEntries, currentDate, currentReportId);
    logActivity(getUserName(), "Normalized Report", `Bulk updated ${newEntries.length} items to standard hierarchy`, currentDate);
  };

  const handleDeleteItem = async (id: string) => {
    captureUndoState(currentEntries);

    const item = currentEntries.find(i => i.id === id);
    if (!item || !currentReportId) return;

    await moveItemToTrash(item, currentReportId, currentDate, getUserName());

    const updatedEntries = currentEntries.filter(item => item.id !== id);
    setCurrentEntries(updatedEntries);
    saveCurrentState(updatedEntries, currentDate, currentReportId);
    
    logActivity(getUserName(), "Deleted Item", `Deleted entry for ${item?.location}`, currentDate);
  };

  const handleDateChange = (date: string) => {
    setCurrentDate(date);
    logActivity(getUserName(), "Changed Date", `Switched view to ${date}`, date);
  };

  const handleDeleteReport = async (id: string) => {
    const reportToDelete = reports.find(r => r.id === id);
    if (reportToDelete) {
      await moveReportToTrash(reportToDelete, getUserName());
      logActivity(getUserName(), "Deleted Report", `Deleted entire report ID: ${id}`, "N/A");
      
      if (currentReportId === id) {
         setCurrentEntries([]);
      }
    }
  };

  const handleRestore = async (item: TrashItem) => {
    await restoreTrashItem(item);
    logActivity(getUserName(), "Restored Item", `Restored ${item.type} from trash bin`, item.reportDate);
  };

  const currentReport: DailyReport = {
    id: currentReportId || 'temp',
    date: currentDate,
    lastUpdated: new Date().toISOString(),
    projectTitle: "Bhotekoshi Hydroelectric Project", 
    entries: currentEntries
  };

  if (authLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-100">
        <div className="spinner"></div>
        <div className="text-slate-500 font-medium mt-4">Verifying Identity...</div>
      </div>
    );
  }

  // --- CONFIGURATION ERROR SCREEN ---
  if (configError && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
         <div className="bg-white rounded-3xl p-8 md:p-12 max-w-md w-full shadow-2xl text-center border border-red-100">
             <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <i className="fas fa-exclamation-triangle text-red-500 text-3xl"></i>
             </div>
             <h1 className="text-2xl font-bold text-slate-800 mb-2">Configuration Error</h1>
             <p className="text-slate-500 mb-6">
               The application could not load because Firebase configuration is missing.
             </p>
             <div className="bg-slate-100 p-4 rounded text-xs text-left font-mono text-slate-600 mb-6 overflow-x-auto">
                <p className="font-bold text-slate-800">Missing Variables:</p>
                FIREBASE_API_KEY<br/>
                FIREBASE_AUTH_DOMAIN<br/>
                FIREBASE_PROJECT_ID
             </div>
             <p className="text-xs text-slate-400">
               Please check your deployment settings or .env file.
             </p>
         </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
         <div className="bg-white rounded-3xl p-8 md:p-12 max-w-md w-full shadow-2xl text-center animate-fade-in">
             <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-500/30">
                <i className="fas fa-hard-hat text-white text-3xl"></i>
             </div>
             <h1 className="text-3xl font-bold text-slate-800 mb-2">Construction DPR Maker</h1>
             <p className="text-slate-500 mb-8">Professional Construction Management</p>
             
             <button 
               onClick={handleLogin}
               className="w-full bg-white border border-slate-200 text-slate-700 font-bold py-4 px-6 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-3 shadow-sm group"
             >
               <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6" />
               Sign in with Google
               <i className="fas fa-arrow-right opacity-0 group-hover:opacity-100 transition-opacity ml-auto text-slate-400"></i>
             </button>
             
             <p className="mt-8 text-xs text-slate-400">
               Secured by Firebase Authentication. <br/>
               Access is restricted to authorized site personnel.
             </p>
         </div>
      </div>
    );
  }

  return (
    <>
      <Layout activeTab={activeTab} onTabChange={handleTabChange} user={user} onLogout={logoutUser}>
        
        <div className={`fixed top-4 right-4 z-50 transition-all duration-300 transform ${isSaving ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'}`}>
          <div className="bg-white/90 backdrop-blur text-indigo-600 px-4 py-2 rounded-full shadow-lg border border-indigo-100 flex items-center gap-2 text-sm font-bold">
             <i className="fas fa-circle-notch fa-spin"></i> Saving changes...
          </div>
        </div>

        {activeTab === TabView.INPUT && (
          <InputSection 
            currentDate={currentDate}
            onDateChange={handleDateChange}
            onItemsAdded={handleItemsAdded}
            onViewReport={handleViewReport}
            entryCount={currentEntries.length}
            user={user}
          />
        )}

        {activeTab === TabView.VIEW_REPORT && (
          <ReportTable 
            report={currentReport}
            onDeleteItem={handleDeleteItem}
            onUpdateItem={handleUpdateItem}
            onUpdateAllEntries={handleUpdateAllEntries}
            onUndo={handleUndo}
            canUndo={undoStack.length > 0}
          />
        )}

        {activeTab === TabView.QUANTITY && (
          <QuantityView reports={reports} user={user} />
        )}

        {activeTab === TabView.HISTORY && (
          <HistoryList 
            reports={reports}
            currentReportId={currentReportId || ''}
            onSelectReport={handleSelectReport}
            onDeleteReport={handleDeleteReport}
            onCreateNew={handleCreateNew}
          />
        )}

        {activeTab === TabView.LOGS && (
          <ActivityLogs logs={logs} />
        )}
        
        {activeTab === TabView.RECYCLE_BIN && (
          <RecycleBin 
            logs={logs} 
            trashItems={trashItems}
            onRestore={handleRestore}
          />
        )}
      </Layout>
    </>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
