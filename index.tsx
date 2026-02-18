
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Layout } from './components/Layout';
import { SetupGuide } from './components/SetupGuide';
import { InputSection } from './components/InputSection';
import { HistoryList } from './components/HistoryList';
import { ReportTable } from './components/ReportTable';
import { ActivityLogs } from './components/ActivityLogs';
import { RecycleBin } from './components/RecycleBin';
import { QuantityView } from './components/QuantityView';
import { HRTLiningView } from './components/HRTLiningView';
import { FinancialEstimateView } from './components/FinancialEstimateView';
import { ProjectSettingsView } from './components/ProjectSettings';
import { ProfileView } from './components/ProfileView';
import { MasterRecordModal } from './components/MasterRecordModal';
import { 
  subscribeToReports, 
  saveReportToCloud, 
  logActivity, 
  subscribeToLogs, 
  signInWithGoogle, 
  logoutUser, 
  subscribeToAuth, 
  moveReportToTrash, 
  subscribeToTrash, 
  restoreTrashItem, 
  savePermanentBackup, 
  getProjectSettings, 
  saveProjectSettings, 
  incrementUserStats, 
  moveItemToTrash, 
  isConfigured, 
  missingKeys, 
  createSystemCheckpoint,
  saveRawInput
} from './services/firebaseService';
import { DailyReport, DPRItem, TabView, LogEntry, TrashItem, ProjectSettings, BackupEntry } from './types';
import { LOCATION_HIERARCHY } from './utils/constants';

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
  
  const [undoStack, setUndoStack] = useState<DPRItem[][]>([]);
  const [redoStack, setRedoStack] = useState<DPRItem[][]>([]);
  const [inspectItem, setInspectItem] = useState<DPRItem | null>(null);
  const [isGlobalSaving, setIsGlobalSaving] = useState(false);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [hierarchy, setHierarchy] = useState(LOCATION_HIERARCHY);
  
  const [bypassConfig, setBypassConfig] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      const loader = document.getElementById('loading-indicator');
      if (loader) {
         loader.style.opacity = '0';
         setTimeout(() => loader.remove(), 500);
      }
    }
  }, [authLoading]);
  
  const handleLogin = async () => {
      try {
          const u = await signInWithGoogle();
          setUser(u);
      } catch(e) {
          alert("Login failed");
      }
  };

  const handleLogout = async () => {
      await logoutUser();
      setUser(null);
      setReports([]);
  };

  const configLoaded = isConfigured || bypassConfig;

  useEffect(() => {
    const unsubAuth = subscribeToAuth((u) => {
        setUser(u);
        setAuthLoading(false);
        if(u) {
            logActivity(u.displayName || u.email, "Session Active", `User authenticated at ${new Date().toLocaleTimeString()}`, new Date().toISOString().split('T')[0]);
        }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
      if (user) {
          const unsubReports = subscribeToReports((data) => {
              setReports(data);
          });
          const unsubLogs = subscribeToLogs(setLogs);
          const unsubTrash = subscribeToTrash(setTrashItems);
          
          getProjectSettings().then(s => {
              if(s) {
                  setSettings(s);
                  if(s.locationHierarchy) setHierarchy(s.locationHierarchy);
              }
          });

          return () => {
              unsubReports();
              unsubLogs();
              unsubTrash();
          };
      }
  }, [user]);

  useEffect(() => {
      const found = reports.find(r => r.date === currentDate);
      if (found) {
          setCurrentEntries(found.entries);
          setCurrentReportId(found.id);
      } else {
          setCurrentEntries([]);
          setCurrentReportId(null);
      }
      setUndoStack([]);
      setRedoStack([]);
  }, [currentDate, reports]);
  
  const handleItemsAdded = async (newItems: DPRItem[], rawText: string) => {
      setIsGlobalSaving(true);
      
      const updatedEntries = [...currentEntries, ...newItems];
      setCurrentEntries(updatedEntries);
      
      let reportId = currentReportId;
      if (!reportId) {
          reportId = `${currentDate}_${crypto.randomUUID()}`;
          setCurrentReportId(reportId);
      }

      const reportData: DailyReport = {
          id: reportId,
          date: currentDate,
          lastUpdated: new Date().toISOString(),
          projectTitle: settings?.projectName || "Bhotekoshi Hydroelectric Project",
          companyName: settings?.companyName || "Construction Management",
          entries: updatedEntries
      };

      try {
          await saveReportToCloud(reportData);
          
          const backupId = await savePermanentBackup(currentDate, rawText, newItems, user?.displayName || 'Unknown', reportId);
          
          const locs = Array.from(new Set(newItems.map(i => i.location)));
          const comps = Array.from(new Set(newItems.filter(i => i.component).map(i => i.component!)));
          const isManual = rawText.includes("Manual Creation");

          await saveRawInput(
              rawText,
              currentDate,
              locs,
              comps,
              user?.displayName || 'Unknown',
              isManual ? 'manual' : 'ai_processed'
          );

          await logActivity(
              user?.displayName || 'Unknown', 
              isManual ? "Manual Creation" : "AI Import", 
              `${isManual ? 'Created' : 'Imported'} ${newItems.length} items for ${currentDate}`, 
              currentDate,
              backupId
          );
          
          await incrementUserStats(user?.uid, newItems.length);

      } catch (error) {
          console.error("Save failed", error);
          alert("Failed to save changes to cloud. Please check connection.");
      } finally {
          setIsGlobalSaving(false);
      }
  };

  const handleDeleteItem = async (itemId: string) => {
      if (!currentReportId) return;
      const itemToDelete = currentEntries.find(i => i.id === itemId);
      if (!itemToDelete) return;

      const updatedEntries = currentEntries.filter(i => i.id !== itemId);
      setCurrentEntries(updatedEntries);

      const reportToSave = { 
          ...reports.find(r => r.id === currentReportId)!, 
          entries: updatedEntries,
          lastUpdated: new Date().toISOString()
      };
      
      await saveReportToCloud(reportToSave);
      await moveItemToTrash(itemToDelete, currentReportId, currentDate, user?.displayName || 'Unknown');
  };

  const handleUpdateItem = async (itemId: string, updates: Partial<DPRItem>) => {
      if (!currentReportId) return;
      
      const updatedEntries = currentEntries.map(i => i.id === itemId ? { ...i, ...updates, lastModifiedBy: user?.displayName, lastModifiedAt: new Date().toISOString() } : i);
      setCurrentEntries(updatedEntries);

      const reportToSave = {
          ...reports.find(r => r.id === currentReportId)!,
          entries: updatedEntries,
          lastUpdated: new Date().toISOString()
      };
      await saveReportToCloud(reportToSave);
  };
  
  const handleUpdateItemField = (id: string, field: keyof DPRItem, value: string) => {
      handleUpdateItem(id, { [field]: value });
  };

  const handleCreateNewReport = () => {
      const today = new Date().toISOString().split('T')[0];
      if (today !== currentDate) {
          setCurrentDate(today);
          setActiveTab(TabView.INPUT);
      }
  };

  const handleDeleteReport = async (reportId: string) => {
      const report = reports.find(r => r.id === reportId);
      if (report) {
         await moveReportToTrash(report, user?.displayName || 'Unknown');
         if (reportId === currentReportId) {
             setCurrentReportId(null);
             setCurrentEntries([]);
         }
      }
  };

  const handleUndo = async () => {
      if (undoStack.length === 0) return;
      const prev = undoStack[undoStack.length - 1];
      setRedoStack(prevStack => [...prevStack, currentEntries]);
      setUndoStack(prev => prev.slice(0, -1));
      setCurrentEntries(prev);
      
      if (currentReportId) {
           const reportToSave = {
              ...reports.find(r => r.id === currentReportId)!,
              entries: prev,
              lastUpdated: new Date().toISOString()
          };
          await saveReportToCloud(reportToSave);
      }
  };

  const handleRedo = async () => {
      if (redoStack.length === 0) return;
      const next = redoStack[redoStack.length - 1];
      setUndoStack(prev => [...prev, currentEntries]);
      setRedoStack(prev => prev.slice(0, -1));
      setCurrentEntries(next);
      
      if (currentReportId) {
           const reportToSave = {
              ...reports.find(r => r.id === currentReportId)!,
              entries: next,
              lastUpdated: new Date().toISOString()
          };
          await saveReportToCloud(reportToSave);
      }
  };

  const handleSaveSettings = async (newSettings: ProjectSettings) => {
      await saveProjectSettings(newSettings);
      setSettings(newSettings);
      setHierarchy(newSettings.locationHierarchy);
  };

  const handleRecoverBackups = async (backupsToRecover: BackupEntry[]) => {
      if (backupsToRecover.length === 0) return;
      setIsGlobalSaving(true);
      
      for (const b of backupsToRecover) {
           const targetDate = b.date;
           let targetReport = reports.find(r => r.date === targetDate);
           const restoredItems = b.parsedItems.map(i => ({ ...i, isRecovered: true }));
           
           if (targetReport) {
               targetReport.entries = [...targetReport.entries, ...restoredItems];
               targetReport.lastUpdated = new Date().toISOString();
           } else {
               targetReport = {
                   id: `${targetDate}_restored_${crypto.randomUUID()}`,
                   date: targetDate,
                   lastUpdated: new Date().toISOString(),
                   projectTitle: settings?.projectName || "Restored Project",
                   companyName: settings?.companyName || "",
                   entries: restoredItems,
                   isRecovered: true
               };
           }
           await saveReportToCloud(targetReport);
      }
      setIsGlobalSaving(false);
      alert(`Restored ${backupsToRecover.length} sessions.`);
  };

  const handleToggleBlockItem = async (itemId: string) => {
      if (!settings) return;
      const currentBlocked = settings.blockedLiningItemIds || [];
      let newBlocked;
      if (currentBlocked.includes(itemId)) {
          newBlocked = currentBlocked.filter(id => id !== itemId);
      } else {
          newBlocked = [...currentBlocked, itemId];
      }
      const updatedSettings = { ...settings, blockedLiningItemIds: newBlocked };
      await handleSaveSettings(updatedSettings);
  };


  if (!configLoaded) {
    return <SetupGuide missingKeys={missingKeys} onBypass={() => setBypassConfig(true)} />;
  }

  if (!user && !authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md w-full animate-fade-in">
           <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200">
             <i className="fas fa-hard-hat text-white text-3xl"></i>
           </div>
           <h1 className="text-2xl font-black text-slate-800 mb-2">Welcome Back</h1>
           <p className="text-slate-500 mb-8">Sign in to access your construction DPR dashboard.</p>
           
           <button 
             onClick={handleLogin}
             className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-black transition-all hover:scale-[1.02] shadow-xl"
           >
             <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
             Sign in with Google
           </button>
           
           <div className="mt-8 pt-6 border-t border-slate-100 text-xs text-slate-400">
              Authorized personnel only.
           </div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
      switch(activeTab) {
          case TabView.INPUT:
             return <InputSection 
                currentDate={currentDate} 
                onDateChange={setCurrentDate} 
                onItemsAdded={handleItemsAdded}
                onViewReport={() => setActiveTab(TabView.VIEW_REPORT)}
                entryCount={currentEntries.length}
                user={user}
                hierarchy={hierarchy}
                customItemTypes={settings?.itemTypes}
             />;
          case TabView.VIEW_REPORT:
             return currentReportId ? (
                 <ReportTable 
                    report={reports.find(r => r.id === currentReportId)!} 
                    onDeleteItem={handleDeleteItem}
                    onUpdateItem={handleUpdateItemField}
                    onUpdateRow={handleUpdateItem}
                    onUndo={handleUndo}
                    canUndo={undoStack.length > 0}
                    onRedo={handleRedo}
                    canRedo={redoStack.length > 0}
                    onInspectItem={setInspectItem}
                    hierarchy={hierarchy}
                 /> 
             ) : (
                 <div className="text-center py-20 text-slate-400">
                    <i className="fas fa-folder-open text-4xl mb-4"></i>
                    <p>No report exists for {currentDate}</p>
                    <button onClick={() => setActiveTab(TabView.INPUT)} className="text-indigo-600 font-bold mt-2 underline">Create entries</button>
                 </div>
             );
          case TabView.HISTORY:
             return <HistoryList 
                reports={reports} 
                currentReportId={currentReportId || ''} 
                onSelectReport={(id) => {
                    const r = reports.find(r => r.id === id);
                    if(r) { setCurrentDate(r.date); setCurrentReportId(r.id); setActiveTab(TabView.VIEW_REPORT); }
                }}
                onDeleteReport={handleDeleteReport}
                onCreateNew={handleCreateNewReport}
             />;
          case TabView.LOGS:
             return <ActivityLogs 
                logs={logs} 
                onRecover={handleRecoverBackups}
             />;
          case TabView.RECYCLE_BIN:
             return <RecycleBin logs={logs} trashItems={trashItems} onRestore={restoreTrashItem} />;
          case TabView.QUANTITY:
             return <QuantityView 
                reports={reports} 
                user={user} 
                onInspectItem={setInspectItem} 
                onHardSync={() => {}} 
                customItemTypes={settings?.itemTypes}
             />;
          case TabView.LINING:
             return <HRTLiningView 
                reports={reports} 
                user={user} 
                onInspectItem={setInspectItem} 
                blockedItemIds={settings?.blockedLiningItemIds || []} 
                onToggleBlock={handleToggleBlockItem}
             />;
          case TabView.FINANCIAL:
             return <FinancialEstimateView reports={reports} settings={settings} onSaveSettings={handleSaveSettings} />;
          case TabView.SETTINGS:
             return <ProjectSettingsView 
                currentSettings={settings} 
                onSave={handleSaveSettings} 
                reports={reports}
                quantities={[]}
                user={user}
             />;
          case TabView.PROFILE:
             return <ProfileView user={user} />;
          default:
             return null;
      }
  };

  return (
    <Layout 
        activeTab={activeTab} 
        onTabChange={(t) => { setActiveTab(t); localStorage.setItem('activeTab', t); }} 
        user={user} 
        onLogout={handleLogout}
        onSaveCheckpoint={() => createSystemCheckpoint(user?.displayName || 'User')}
    >
        {renderContent()}
        
        {inspectItem && (
            <MasterRecordModal 
                item={inspectItem} 
                isOpen={!!inspectItem} 
                onClose={() => setInspectItem(null)}
                onUpdate={handleUpdateItem}
                onSplit={() => {}} 
                onDelete={(id) => { handleDeleteItem(id); setInspectItem(null); }}
                hierarchy={hierarchy}
                customItemTypes={settings?.itemTypes}
            />
        )}
    </Layout>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
