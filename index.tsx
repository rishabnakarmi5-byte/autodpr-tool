
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
import { subscribeToReports, saveReportToCloud, deleteReportFromCloud, logActivity, subscribeToLogs, signInWithGoogle, logoutUser, subscribeToAuth, moveItemToTrash, moveReportToTrash, subscribeToTrash, restoreTrashItem, savePermanentBackup, saveReportHistory, getProjectSettings, saveProjectSettings, incrementUserStats, getBackups } from './services/firebaseService';
import { DailyReport, DPRItem, TabView, LogEntry, TrashItem, ProjectSettings, BackupEntry, EditHistory } from './types';
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
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentEntries, setCurrentEntries] = useState<DPRItem[]>([]);
  const [undoStack, setUndoStack] = useState<DPRItem[][]>([]);
  const [redoStack, setRedoStack] = useState<DPRItem[][]>([]);
  
  // Master Record Inspection State
  const [inspectItem, setInspectItem] = useState<DPRItem | null>(null);
  
  const [isGlobalSaving, setIsGlobalSaving] = useState(false); 
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
      if (u) logActivity(u.displayName || u.email || 'Unknown', "Session Active", "User authenticated", "N/A");
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);
  useEffect(() => { return subscribeToReports((data) => setReports(data)); }, []);
  useEffect(() => { return subscribeToLogs((data) => setLogs(data)); }, []);
  useEffect(() => { return subscribeToTrash((data) => setTrashItems(data)); }, []);

  // Listen for 'inspect-item' events from child components (like ReportTable)
  useEffect(() => {
    const handleInspect = (e: CustomEvent) => {
        if (e.detail) {
            setInspectItem(e.detail);
        }
    };
    window.addEventListener('inspect-item' as any, handleInspect);
    return () => window.removeEventListener('inspect-item' as any, handleInspect);
  }, []);

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
  
  const handleLogin = async () => { try { await signInWithGoogle(); } catch (error) { alert("Failed to sign in."); } };
  const getUserName = () => user?.displayName || user?.email || 'Anonymous';
  
  const saveCurrentState = async (entries: DPRItem[], date: string, reportId: string | null, isRecovered = false) => {
    const id = reportId || crypto.randomUUID();
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
      return null; 
    }
  };

  const handleUpdateItem = (id: string, updates: Partial<DPRItem>) => {
    let targetReport = reports.find(r => r.entries.some(e => e.id === id));
    if (!targetReport && currentEntries.some(e => e.id === id)) {
        targetReport = { id: currentReportId || 'temp', date: currentDate, entries: currentEntries } as DailyReport;
    }

    if (targetReport) {
        const updatedEntries = targetReport.entries.map(item => {
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
        
        saveCurrentState(updatedEntries, targetReport.date, targetReport.id);
        
        // Update local inspect item if open
        if (inspectItem && inspectItem.id === id) {
            setInspectItem(prev => prev ? ({ ...prev, ...updates }) : null);
        }
    }
  };

  const handleSplitItem = async (originalItem: DPRItem) => {
      let targetReport = reports.find(r => r.entries.some(e => e.id === originalItem.id));
      if (!targetReport) return;

      const newItemId = crypto.randomUUID();
      const newItem: DPRItem = {
          ...originalItem,
          id: newItemId,
          activityDescription: `${originalItem.activityDescription} (Split)`,
          quantity: 0,
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
      
      const updatedEntries = [...targetReport.entries, newItem];
      updatedEntries.sort((a, b) => getLocationPriority(a.location) - getLocationPriority(b.location));
      
      await saveCurrentState(updatedEntries, targetReport.date, targetReport.id);
      logActivity(getUserName(), "Split Item", `Duplicated item ${originalItem.id}`, targetReport.date);
  };

  const handleItemsAdded = async (newItems: DPRItem[], rawText: string) => {
    setIsGlobalSaving(true);
    try {
        const existingReportOnServer = reports.find(r => r.date === currentDate);
        const effectiveReportId = existingReportOnServer ? existingReportOnServer.id : (currentReportId || crypto.randomUUID());
        const baseEntries = existingReportOnServer ? existingReportOnServer.entries : []; 
        
        const backupId = await savePermanentBackup(currentDate, rawText, newItems, getUserName(), effectiveReportId);
        const stampedItems = newItems.map(item => ({ ...item, sourceBackupId: backupId || undefined }));

        let updatedEntries = [...baseEntries, ...stampedItems];
        updatedEntries.sort((a, b) => getLocationPriority(a.location) - getLocationPriority(b.location));
        
        const savedReport = await saveCurrentState(updatedEntries, currentDate, effectiveReportId);
        if(savedReport) incrementUserStats(user?.uid, stampedItems.length);
        
        logActivity(getUserName(), "Report Updated", `Added ${newItems.length} items`, currentDate, backupId || undefined);
    } catch(e) {
        alert("Error saving data.");
    } finally {
        setIsGlobalSaving(false);
    }
  };

  const handleNormalizeReport = async () => {
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
  };

  if (authLoading) return <div className="h-screen w-full flex items-center justify-center bg-slate-50">Loading...</div>;
  if (!user) return <div className="h-screen flex items-center justify-center"><button onClick={handleLogin}>Sign In</button></div>;

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab} user={user} onLogout={logoutUser}>
        {activeTab === TabView.INPUT && <InputSection currentDate={currentDate} onDateChange={setCurrentDate} onItemsAdded={handleItemsAdded} onViewReport={() => setActiveTab(TabView.VIEW_REPORT)} entryCount={currentEntries.length} user={user} hierarchy={hierarchy} />}
        
        {activeTab === TabView.VIEW_REPORT && <ReportTable report={{id: currentReportId || 'temp', date: currentDate, lastUpdated: new Date().toISOString(), projectTitle: settings?.projectName || '', entries: currentEntries}} onDeleteItem={(id) => handleUpdateItem(id, {})} onUpdateItem={(id, f, v) => handleUpdateItem(id, {[f]: v})} onUpdateRow={handleUpdateItem} onUndo={()=>{}} canUndo={false} onRedo={()=>{}} canRedo={false} onNormalize={handleNormalizeReport} onSplitItem={handleSplitItem} hierarchy={hierarchy} />}
        
        {activeTab === TabView.LINING && <HRTLiningView reports={reports} user={user} onInspectItem={setInspectItem} />}
        {activeTab === TabView.QUANTITY && <QuantityView reports={reports} user={user} onInspectItem={setInspectItem} />}
        
        {activeTab === TabView.HISTORY && <HistoryList reports={reports} currentReportId={currentReportId || ''} onSelectReport={(id) => { const r = reports.find(r=>r.id===id); if(r) { setCurrentDate(r.date); setActiveTab(TabView.VIEW_REPORT); }}} onDeleteReport={async (id) => { await moveReportToTrash(reports.find(r => r.id === id)!, getUserName()); }} onCreateNew={() => { setCurrentDate(new Date().toISOString().split('T')[0]); setActiveTab(TabView.INPUT); }} />}
        {activeTab === TabView.LOGS && <ActivityLogs logs={logs} />}
        {activeTab === TabView.RECYCLE_BIN && <RecycleBin logs={logs} trashItems={trashItems} onRestore={async (item) => { await restoreTrashItem(item); }} />}
        {activeTab === TabView.SETTINGS && <ProjectSettingsView currentSettings={settings} onSave={(s) => { setSettings(s); setHierarchy(s.locationHierarchy); saveProjectSettings(s); }} reports={reports} quantities={[]} user={user} />}
        {activeTab === TabView.PROFILE && <ProfileView user={user} />}
        
        {/* MASTER RECORD MODAL (Global) */}
        {inspectItem && (
            <MasterRecordModal 
                item={inspectItem}
                isOpen={!!inspectItem}
                onClose={() => setInspectItem(null)}
                onUpdate={handleUpdateItem}
                onSplit={handleSplitItem}
                hierarchy={hierarchy}
            />
        )}

        {isGlobalSaving && (
            <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center backdrop-blur-sm text-white">Saving...</div>
        )}
    </Layout>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
