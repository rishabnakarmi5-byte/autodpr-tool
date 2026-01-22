
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
import { subscribeToReports, saveReportToCloud, deleteReportFromCloud, logActivity, subscribeToLogs, signInWithGoogle, logoutUser, subscribeToAuth, moveItemToTrash, moveReportToTrash, subscribeToTrash, restoreTrashItem, savePermanentBackup, saveReportHistory, syncQuantitiesFromItems, getProjectSettings, saveProjectSettings, incrementUserStats, subscribeToQuantities, updateQuantity } from './services/firebaseService';
import { DailyReport, DPRItem, TabView, LogEntry, TrashItem, ProjectSettings, QuantityEntry, BackupEntry, EditHistory } from './types';
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
  const [isGlobalSaving, setIsGlobalSaving] = useState(false); 
  
  // Notification State
  const [notification, setNotification] = useState<{message: string, type: 'info' | 'success'} | null>(null);
  const lastLogIdRef = useRef<string | null>(null);
  const isFirstLoadRef = useRef(true);

  // Settings State
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [hierarchy, setHierarchy] = useState(LOCATION_HIERARCHY);

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

  useEffect(() => {
    const unsubscribe = subscribeToReports((data) => setReports(data));
    return () => unsubscribe();
  }, []);

  // --- NOTIFICATION LOGIC VIA LOGS ---
  useEffect(() => {
    const unsubscribe = subscribeToLogs((data) => {
        setLogs(data);
        
        if (data.length > 0) {
            const latestLog = data[0];
            
            // Skip logic on very first load to avoid spamming alerts for old data
            if (isFirstLoadRef.current) {
                lastLogIdRef.current = latestLog.id;
                isFirstLoadRef.current = false;
                return;
            }

            // Check if this is a NEW log and NOT from the current user
            if (latestLog.id !== lastLogIdRef.current) {
                const currentUserName = user?.displayName || user?.email || 'Unknown';
                const currentUserEmail = user?.email || '';
                const isMe = latestLog.user === currentUserName || latestLog.user.includes(currentUserName.split(' ')[0]);

                // RESTRICTION: Only allow notifications for specific emails
                const ALLOWED_EMAILS = ['rishabnakarmi5@gmail.com'];
                const isAllowed = ALLOWED_EMAILS.includes(currentUserEmail);

                if (isAllowed && !isMe && (latestLog.action === 'Report Updated' || latestLog.action.includes('Recovery'))) {
                    // 1. In-App Toast
                    setNotification({
                        message: `${latestLog.user} just updated the report!`,
                        type: 'info'
                    });
                    setTimeout(() => setNotification(null), 5000);

                    // 2. Browser System Notification
                    if ("Notification" in window && Notification.permission === "granted") {
                        new Notification("DPR Update", {
                            body: `${latestLog.user}: ${latestLog.details}`,
                            icon: '/vite.svg'
                        });
                    }
                }
                lastLogIdRef.current = latestLog.id;
            }
        }
    });
    return () => unsubscribe();
  }, [user]);

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
      await saveReportToCloud(report);
      saveReportHistory(report).catch(console.error);
      return report;
    } catch (e) { 
      console.error("Failed to save", e); 
      alert("CRITICAL ERROR: Failed to save report to cloud. Please check your internet.");
      return null; 
    }
  };

  const pushUndo = (entries: DPRItem[]) => {
      setUndoStack(prev => [...prev.slice(-19), entries]);
      setRedoStack([]); 
  };

  const handleItemsAdded = async (newItems: DPRItem[], rawText: string) => {
    setIsGlobalSaving(true);
    try {
        const existingReportOnServer = reports.find(r => r.date === currentDate);
        const effectiveReportId = existingReportOnServer ? existingReportOnServer.id : (currentReportId || crypto.randomUUID());
        const baseEntries = existingReportOnServer ? existingReportOnServer.entries : []; 

        pushUndo(baseEntries);
        
        // 1. Create Backup
        const backupId = await savePermanentBackup(currentDate, rawText, newItems, getUserName(), effectiveReportId);

        // 2. Stamp items with backupId
        const stampedItems = newItems.map(item => ({
            ...item,
            sourceBackupId: backupId || undefined
        }));

        let updatedEntries = [...baseEntries, ...stampedItems];
        updatedEntries.sort((a, b) => getLocationPriority(a.location) - getLocationPriority(b.location));
        
        const savedReport = await saveCurrentState(updatedEntries, currentDate, effectiveReportId);
        
        if (savedReport) {
            syncQuantitiesFromItems(stampedItems, savedReport, getUserName()).catch(console.error);
            incrementUserStats(user?.uid, stampedItems.length).catch(console.error);
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
    const updatedEntries = currentEntries.map(item => {
        if (item.id === id) {
            // Record History
            const historyEntry: EditHistory = {
                timestamp: new Date().toISOString(),
                user: getUserName(),
                field: field,
                oldValue: String(item[field] || ''),
                newValue: value
            };
            
            return {
                ...item, 
                [field]: value,
                lastModifiedBy: getUserName(),
                lastModifiedAt: new Date().toISOString(),
                editHistory: [...(item.editHistory || []), historyEntry]
            };
        }
        return item;
    });
    saveCurrentState(updatedEntries, currentDate, currentReportId); 
    logActivity(getUserName(), "Updated Item", `Changed ${field}`, currentDate);
  };

  const handleUpdateRow = (id: string, updates: Partial<DPRItem>) => {
    pushUndo(currentEntries);
    const updatedEntries = currentEntries.map(item => {
        if (item.id === id) {
            const historyEntries: EditHistory[] = [];
            Object.entries(updates).forEach(([key, val]) => {
                historyEntries.push({
                    timestamp: new Date().toISOString(),
                    user: getUserName(),
                    field: key,
                    oldValue: String((item as any)[key] || ''),
                    newValue: String(val)
                });
            });

            return { 
                ...item, 
                ...updates,
                lastModifiedBy: getUserName(),
                lastModifiedAt: new Date().toISOString(),
                editHistory: [...(item.editHistory || []), ...historyEntries]
            };
        }
        return item;
    });
    saveCurrentState(updatedEntries, currentDate, currentReportId); 
    logActivity(getUserName(), "Row Updated", `Batch update on ${Object.keys(updates).join(', ')}`, currentDate);
  };

  const handleSplitItem = async (originalItem: DPRItem) => {
      pushUndo(currentEntries);
      const newItemId = crypto.randomUUID();
      const newItem: DPRItem = {
          ...originalItem,
          id: newItemId,
          activityDescription: `${originalItem.activityDescription} (Copy)`,
          createdBy: getUserName(),
          lastModifiedBy: getUserName(),
          lastModifiedAt: new Date().toISOString(),
          editHistory: [{
              timestamp: new Date().toISOString(),
              user: getUserName(),
              field: 'creation',
              oldValue: 'N/A',
              newValue: `Split from ${originalItem.id}`
          }]
      };
      
      const updatedEntries = [...currentEntries, newItem];
      updatedEntries.sort((a, b) => getLocationPriority(a.location) - getLocationPriority(b.location));
      
      await saveCurrentState(updatedEntries, currentDate, currentReportId);
      logActivity(getUserName(), "Split Item", `Duplicated item ${originalItem.id} for splitting`, currentDate);
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
      logActivity(getUserName(), "Settings Updated", `Modified Project Configurations`, new Date().toISOString());
  };

  const handleRecoverBackup = async (backups: BackupEntry[]) => {
      if(backups.length === 0) return;
      const primaryDate = backups[0].date;

      if (window.confirm(`Reconstruct Report for ${primaryDate} using ${backups.length} selected backup(s)?\n\nThis will OVERWRITE any existing draft for this date.`)) {
          setIsGlobalSaving(true);
          try {
             const reportId = crypto.randomUUID();
             let allEntries: DPRItem[] = [];
             backups.forEach(b => {
                 const itemsWithNewIds = b.parsedItems.map(item => ({
                     ...item, 
                     id: crypto.randomUUID(),
                     sourceBackupId: b.id // Preserve origin
                 }));
                 allEntries = [...allEntries, ...itemsWithNewIds];
             });
             allEntries.sort((a, b) => getLocationPriority(a.location) - getLocationPriority(b.location));
             await saveCurrentState(allEntries, primaryDate, reportId, true);
             await syncQuantitiesFromItems(allEntries, { id: reportId, date: primaryDate, entries: allEntries } as DailyReport, `RECOVERY_${getUserName()}`);

             setCurrentDate(primaryDate);
             setCurrentReportId(reportId);
             setCurrentEntries(allEntries);
             setActiveTab(TabView.VIEW_REPORT);
             logActivity(getUserName(), "RECOVERY", `Reconstructed report from ${backups.length} backups`, primaryDate);
          } catch(e) {
             console.error(e);
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
        {activeTab === TabView.VIEW_REPORT && <ReportTable report={currentReport} onDeleteItem={handleDeleteItem} onUpdateItem={handleUpdateItem} onUpdateRow={handleUpdateRow} onUndo={handleUndo} canUndo={undoStack.length > 0} onRedo={handleRedo} canRedo={redoStack.length > 0} onNormalize={handleNormalizeReport} onSplitItem={handleSplitItem} hierarchy={hierarchy} />}
        {activeTab === TabView.LINING && <HRTLiningView reports={reports} user={user} />}
        {activeTab === TabView.QUANTITY && <QuantityView reports={reports} user={user} onNormalize={handleNormalizeQuantities} />}
        {activeTab === TabView.HISTORY && <HistoryList reports={reports} currentReportId={currentReportId || ''} onSelectReport={handleSelectReport} onDeleteReport={async (id) => { await moveReportToTrash(reports.find(r => r.id === id)!, getUserName()); }} onCreateNew={handleCreateNew} />}
        {activeTab === TabView.LOGS && <ActivityLogs logs={logs} onRecover={handleRecoverBackup} />}
        {activeTab === TabView.RECYCLE_BIN && <RecycleBin logs={logs} trashItems={trashItems} onRestore={async (item) => { await restoreTrashItem(item); }} />}
        {activeTab === TabView.SETTINGS && <ProjectSettingsView currentSettings={settings} onSave={handleSaveSettings} reports={reports} quantities={allQuantities} user={user} />}
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

        {/* Real-time Toast Notification */}
        {notification && (
            <div className={`fixed top-4 right-4 z-[10000] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in transition-all ${
                notification.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white'
            }`}>
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    <i className="fas fa-bell animate-pulse"></i>
                </div>
                <div>
                    <h4 className="font-bold text-sm">New Activity</h4>
                    <p className="text-xs opacity-90">{notification.message}</p>
                </div>
                <button onClick={() => setNotification(null)} className="ml-2 opacity-60 hover:opacity-100">
                    <i className="fas fa-times"></i>
                </button>
            </div>
        )}
    </Layout>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
