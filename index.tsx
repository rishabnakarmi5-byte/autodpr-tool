
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
import { SubContractorBillingView } from './components/SubContractorBillingView';
import { ProjectSettingsView } from './components/ProjectSettings';
import { ProfileView } from './components/ProfileView';
import { MasterRecordModal } from './components/MasterRecordModal';
import { PhotoGalleryView } from './components/PhotoGalleryView';
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
  saveRawInput,
  updateRawInputStatus,
  mergeReportsInCloud
} from './services/firebaseService';
import { deletePhotoAssociation } from './services/photoService';
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
  
  const handleItemsAdded = async (newItems: DPRItem[], rawText: string, photoIds: string[], existingRawLogId?: string) => {
      setIsGlobalSaving(true);
      
      const updatedEntries = [...currentEntries, ...newItems];
      setCurrentEntries(updatedEntries);
      
      let reportId = currentReportId;
      if (!reportId) {
          const existingReport = reports.find(r => r.date === currentDate);
          if (existingReport) {
              reportId = existingReport.id;
              setCurrentReportId(reportId);
          } else {
              reportId = `${currentDate}_${crypto.randomUUID()}`;
              setCurrentReportId(reportId);
          }
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

          // Always ensure raw input is saved
          if (!existingRawLogId) {
              await saveRawInput(
                  rawText,
                  currentDate,
                  locs,
                  comps,
                  user?.displayName || 'Unknown',
                  isManual ? 'manual' : 'ai_processed'
              );
          } else {
              // Update status of existing log
              await updateRawInputStatus(existingRawLogId, 'ai_processed');
          }

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

  const mergeDuplicateReports = async (date: string) => {
      const duplicateReports = reports.filter(r => r.date === date);
      if (duplicateReports.length <= 1) return;

      // Sort by lastUpdated, keep the most recent one
      duplicateReports.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
      
      const targetReport = duplicateReports[0];
      const sourceReports = duplicateReports.slice(1);

      for (const source of sourceReports) {
          await mergeReportsInCloud(source.id, targetReport.id);
      }
      
      // Refresh local state will happen automatically via subscription
  };

  const handleDeleteItem = async (itemId: string) => {
      let targetReport = reports.find(r => r.entries.some(e => e.id === itemId));
      
      if (!targetReport) {
          console.error("Item not found in any report");
          return;
      }

      const itemToDelete = targetReport.entries.find(i => i.id === itemId);
      if (!itemToDelete) return;

      // Clean up photo associations
      if (itemToDelete.photoIds) {
          for (const photoId of itemToDelete.photoIds) {
              await deletePhotoAssociation(photoId, itemToDelete.id);
          }
      }
      
      const updatedEntries = targetReport.entries.filter(i => i.id !== itemId);
      
      if (currentReportId === targetReport.id) {
          setCurrentEntries(updatedEntries);
      }

      const reportToSave = { 
          ...targetReport, 
          entries: updatedEntries,
          lastUpdated: new Date().toISOString()
      };
      
      // Optimistic update
      setReports(prev => prev.map(r => r.id === reportToSave.id ? reportToSave : r));

      await saveReportToCloud(reportToSave);
      await moveItemToTrash(itemToDelete, targetReport.id, targetReport.date, user?.displayName || 'Unknown');
  };

  const handleUpdateReportNote = async (reportId: string, note: string) => {
      const targetReport = reports.find(r => r.id === reportId);
      if (!targetReport) return;

      const reportToSave = {
          ...targetReport,
          note: note,
          lastUpdated: new Date().toISOString()
      };

      setReports(prev => prev.map(r => r.id === reportToSave.id ? reportToSave : r));
      await saveReportToCloud(reportToSave);
  };

  const handleUpdateItem = async (itemId: string, updates: Partial<DPRItem>) => {
      // Find which report contains this item
      let targetReport = reports.find(r => r.entries.some(e => e.id === itemId));
      
      // If not found in loaded reports, check if it's in the current session (newly added but not saved to reports list yet?)
      // But reports state should be source of truth.
      
      if (!targetReport) {
          console.error("Item not found in any report");
          return;
      }

      const updatedEntries = targetReport.entries.map(i => {
          if (i.id === itemId) {
              const newHistoryEntries = Object.keys(updates)
                  .filter(key => key !== 'lastModifiedBy' && key !== 'lastModifiedAt' && key !== 'editHistory' && (i as any)[key] !== updates[key as keyof DPRItem])
                  .map(key => ({
                      timestamp: new Date().toISOString(),
                      user: user?.displayName || 'Unknown',
                      field: key,
                      oldValue: String((i as any)[key] || ''),
                      newValue: String((updates as any)[key] || '')
                  }));

              return { 
                  ...i, 
                  ...updates,
                  lastModifiedBy: user?.displayName, 
                  lastModifiedAt: new Date().toISOString(),
                  editHistory: (i.editHistory || []).concat(newHistoryEntries)
              };
          }
          return i;
      });
      
      // If we are currently viewing this report, update currentEntries state too
      if (currentReportId === targetReport.id) {
          setCurrentEntries(updatedEntries);
      }

      const reportToSave = {
          ...targetReport,
          entries: updatedEntries,
          lastUpdated: new Date().toISOString()
      };
      
      // Optimistic update for UI
      setReports(prev => prev.map(r => r.id === reportToSave.id ? reportToSave : r));

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

  const handleSplitItem = async (item: DPRItem) => {
      const newItem: DPRItem = {
          ...item,
          id: crypto.randomUUID(),
          activityDescription: `${item.activityDescription} (Split)`,
          lastModifiedAt: new Date().toISOString()
      };
      
      const targetReport = reports.find(r => r.entries.some(e => e.id === item.id));
      if (!targetReport) return;

      const updatedEntries = [...targetReport.entries, newItem];
      
      if (currentReportId === targetReport.id) {
          setCurrentEntries(updatedEntries);
      }

      const reportToSave = {
          ...targetReport,
          entries: updatedEntries,
          lastUpdated: new Date().toISOString()
      };
      
      setReports(prev => prev.map(r => r.id === reportToSave.id ? reportToSave : r));
      await saveReportToCloud(reportToSave);
      setInspectItem(newItem);
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

  const handleReorderEntries = async (newEntries: DPRItem[]) => {
      if (!currentReportId) return;
      
      const targetReport = reports.find(r => r.id === currentReportId);
      if (!targetReport) return;

      setCurrentEntries(newEntries);

      const reportToSave = {
          ...targetReport,
          entries: newEntries,
          lastUpdated: new Date().toISOString()
      };
      
      setReports(prev => prev.map(r => r.id === reportToSave.id ? reportToSave : r));
      await saveReportToCloud(reportToSave);
  };

  const handleManualEntry = async () => {
      const newItem: DPRItem = {
          id: crypto.randomUUID(),
          location: Object.keys(hierarchy)[0] || "Headworks",
          component: hierarchy[Object.keys(hierarchy)[0]]?.[0] || "",
          chainageOrArea: "",
          activityDescription: "New manual entry",
          quantity: 0,
          unit: "m3",
          plannedNextActivity: "",
          createdBy: user?.displayName || 'Unknown',
          lastModifiedAt: new Date().toISOString()
      };
      
      await handleItemsAdded([newItem], "Manual Creation", []);
      setInspectItem(newItem);
  };

  const handleNavigateDate = (direction: 'prev' | 'next') => {
      const date = new Date(currentDate);
      date.setDate(date.getDate() + (direction === 'prev' ? -1 : 1));
      setCurrentDate(date.toISOString().split('T')[0]);
  };

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
                    onUpdateNote={(note) => handleUpdateReportNote(currentReportId!, note)}
                    onUndo={handleUndo}
                    canUndo={undoStack.length > 0}
                    onRedo={handleRedo}
                    canRedo={redoStack.length > 0}
                    onInspectItem={setInspectItem}
                    onAddManualItem={handleManualEntry}
                    onReorderEntries={handleReorderEntries}
                    hierarchy={hierarchy}
                    onNavigateDate={handleNavigateDate}
                    onGoToHistory={() => setActiveTab(TabView.HISTORY)}
                 /> 
             ) : (
                 <div className="text-center py-20 text-slate-400">
                    <i className="fas fa-folder-open text-4xl mb-4"></i>
                    <p>No report exists for {currentDate}</p>
                    <div className="flex flex-col gap-3 mt-6 items-center">
                        <div className="flex gap-2">
                             <button onClick={() => handleNavigateDate('prev')} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold hover:bg-slate-300 transition-all text-sm">
                                Previous {new Date(new Date(currentDate).setDate(new Date(currentDate).getDate() - 1)).toISOString().split('T')[0]}
                             </button>
                             <button onClick={() => handleNavigateDate('next')} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold hover:bg-slate-300 transition-all text-sm">
                                Next {new Date(new Date(currentDate).setDate(new Date(currentDate).getDate() + 1)).toISOString().split('T')[0]}
                             </button>
                        </div>
                        <button onClick={() => setActiveTab(TabView.HISTORY)} className="text-indigo-600 font-bold hover:underline text-sm">Check all history</button>
                        <button onClick={() => setActiveTab(TabView.INPUT)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all">Create entries via AI</button>
                        <button onClick={handleManualEntry} className="text-indigo-600 font-bold hover:underline">Or create manual entry</button>
                    </div>
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
          case TabView.SUBCONTRACTOR_BILL:
             return <SubContractorBillingView reports={reports} settings={settings} onInspectItem={setInspectItem} />;
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
          case TabView.PHOTOS:
             return <PhotoGalleryView reports={reports} onInspectItem={setInspectItem} />;
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
        onSaveCheckpoint={() => createSystemCheckpoint(user?.displayName || 'User', true)}
    >
        {renderContent()}
        
        {inspectItem && (
            <MasterRecordModal 
                item={inspectItem} 
                isOpen={!!inspectItem} 
                onClose={() => setInspectItem(null)}
                onUpdate={handleUpdateItem}
                onSplit={handleSplitItem} 
                onDelete={(id) => { handleDeleteItem(id); setInspectItem(null); }}
                hierarchy={hierarchy}
                customItemTypes={settings?.itemTypes}
                user={user}
            />
        )}
        
        {reports.filter(r => r.date === currentDate).length > 1 && (
            <div className="fixed bottom-20 right-8 z-50">
                <button 
                    onClick={() => mergeDuplicateReports(currentDate)}
                    className="bg-amber-500 text-white px-6 py-3 rounded-full font-bold shadow-lg hover:bg-amber-600 transition-all"
                >
                    Merge Duplicate Reports
                </button>
            </div>
        )}
    </Layout>
  );
};

const container = document.getElementById('root')!;
let root = (window as any)._reactRoot;
if (!root) {
  root = createRoot(container);
  (window as any)._reactRoot = root;
}
root.render(<App />);
