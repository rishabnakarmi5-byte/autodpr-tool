import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Layout } from './components/Layout';
import { InputSection } from './components/InputSection';
import { HistoryList } from './components/HistoryList';
import { ReportTable } from './components/ReportTable';
import { ActivityLogs } from './components/ActivityLogs';
import { RecycleBin } from './components/RecycleBin';
import { subscribeToReports, saveReportToCloud, deleteReportFromCloud, logActivity, subscribeToLogs, signInWithGoogle, logoutUser, subscribeToAuth } from './services/firebaseService';
import { DailyReport, DPRItem, TabView, LogEntry } from './types';
import { User } from "firebase/auth";

const App = () => {
  // --- STATE ---
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<TabView>(() => {
    return (localStorage.getItem('activeTab') as TabView) || TabView.INPUT;
  });
  
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentEntries, setCurrentEntries] = useState<DPRItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // --- PERSISTENCE & SYNC ---

  useEffect(() => {
    const unsubscribeAuth = subscribeToAuth((u) => {
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
    const unsubscribe = subscribeToReports((data) => {
      setReports(data);
    });
    return () => unsubscribe();
  }, []);

  // Sync Logs from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToLogs((data) => setLogs(data));
    return () => unsubscribe();
  }, []);

  // When reports update or date changes, ensure the active view reflects the date's report
  useEffect(() => {
    // Check if there is already a report for the currently selected date
    const existingReport = reports.find(r => r.date === currentDate);

    if (existingReport) {
      if (currentReportId !== existingReport.id) {
         setCurrentReportId(existingReport.id);
      }
      // Only update entries if they differ (to avoid typing lag/loops)
      if (JSON.stringify(existingReport.entries) !== JSON.stringify(currentEntries)) {
         setCurrentEntries(existingReport.entries);
      }
    } else {
      // No report exists for this date on the cloud
      // If we were previously looking at a valid ID that was NOT this date, reset.
      // But if we are "creating" a new one locally (entries > 0), keep it.
      
      const isIdBelongingToOtherDate = reports.some(r => r.id === currentReportId && r.date !== currentDate);
      
      if (isIdBelongingToOtherDate || !currentReportId) {
         // Reset for a fresh day
         const newId = crypto.randomUUID();
         setCurrentReportId(newId);
         setCurrentEntries([]);
      }
    }
  }, [currentDate, reports]);


  // --- HANDLERS ---

  const handleLogin = async () => {
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
      // This will trigger the useEffect above to sync state
      setCurrentDate(report.date);
      setActiveTab(TabView.VIEW_REPORT);
    }
  };

  const handleCreateNew = () => {
    // Reset to today. The useEffect will pick up if today has a report or not.
    setCurrentDate(new Date().toISOString().split('T')[0]);
    setActiveTab(TabView.INPUT);
  };
  
  // Wrapper for tab changing to handle specific resets
  const handleTabChange = (tab: TabView) => {
      if (tab === TabView.INPUT) {
          // Rule: "Daily updates tab's date to follow today's date by default unless manually changed"
          // We interpret this as: clicking the tab resets to today to avoid accidental edits to old history.
          const today = new Date().toISOString().split('T')[0];
          setCurrentDate(today);
      }
      setActiveTab(tab);
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
    } catch (e) {
      console.error("Failed to save", e);
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const handleItemsAdded = (newItems: DPRItem[]) => {
    // Append to existing entries for this day
    const updatedEntries = [...currentEntries, ...newItems];
    setCurrentEntries(updatedEntries);
    saveCurrentState(updatedEntries, currentDate, currentReportId);
    
    // Auto-switch to view report to see the result
    setActiveTab(TabView.VIEW_REPORT);
    logActivity(getUserName(), "Added Items", `Parsed and added ${newItems.length} items from input`, currentDate);
  };

  const handleUpdateItem = (id: string, field: keyof DPRItem, value: string) => {
    const updatedEntries = currentEntries.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    );
    setCurrentEntries(updatedEntries);
    saveCurrentState(updatedEntries, currentDate, currentReportId);
    
    const item = currentEntries.find(i => i.id === id);
    const location = item?.location || 'Unknown';
    logActivity(getUserName(), "Updated Item", `Changed ${field} for location ${location}`, currentDate);
  };

  const handleDeleteItem = (id: string) => {
    const item = currentEntries.find(i => i.id === id);
    const updatedEntries = currentEntries.filter(item => item.id !== id);
    setCurrentEntries(updatedEntries);
    saveCurrentState(updatedEntries, currentDate, currentReportId);
    logActivity(getUserName(), "Deleted Item", `Deleted entry for location ${item?.location || 'Unknown'} - Details: ${item?.activityDescription}`, currentDate);
  };

  const handleDateChange = (date: string) => {
    // Changing the date updates state. 
    // The useEffect [currentDate, reports] will handle loading existing data for that date.
    setCurrentDate(date);
    logActivity(getUserName(), "Changed Date", `Switched view to ${date}`, date);
  };

  const handleDeleteReport = async (id: string) => {
    await deleteReportFromCloud(id);
    logActivity(getUserName(), "Deleted Report", `Deleted entire report ID: ${id}`, "N/A");
    if (currentReportId === id) {
       // Reset to today or clear
       setCurrentEntries([]);
    }
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
         <div className="bg-white rounded-3xl p-8 md:p-12 max-w-md w-full shadow-2xl text-center">
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
        
        {/* Saving Indicator */}
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
            entryCount={currentEntries.length}
          />
        )}

        {activeTab === TabView.VIEW_REPORT && (
          <ReportTable 
            report={currentReport}
            onDeleteItem={handleDeleteItem}
            onUpdateItem={handleUpdateItem}
          />
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
          <RecycleBin logs={logs} />
        )}
      </Layout>
    </>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);