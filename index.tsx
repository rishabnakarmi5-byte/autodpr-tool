
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
import { subscribeToReports, saveReportToCloud, logActivity, subscribeToLogs, signInWithGoogle, logoutUser, subscribeToAuth, moveReportToTrash, subscribeToTrash, restoreTrashItem, savePermanentBackup, saveReportHistory, getProjectSettings, saveProjectSettings, incrementUserStats, moveItemToTrash } from './services/firebaseService';
import { DailyReport, DPRItem, TabView, LogEntry, TrashItem, ProjectSettings, EditHistory, BackupEntry } from './types';
import { getLocationPriority, LOCATION_HIERARCHY, standardizeHRTMapping } from './utils/constants';
import { autofillItemData } from './services/geminiService';

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

  useEffect(() => {
    const unsubAuth = subscribeToAuth((u) => { setUser(u); setAuthLoading(false); });
    const unsubReports = subscribeToReports(setReports);
    const unsubLogs = subscribeToLogs(setLogs);
    const unsubTrash = subscribeToTrash(setTrashItems);
    getProjectSettings().then(s => { 
      if(s) { 
        setSettings(s); 
        if(s.locationHierarchy) setHierarchy(s.locationHierarchy); 
      } 
    });
    return () => { unsubAuth(); unsubReports(); unsubLogs(); unsubTrash(); };
  }, []);

  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);

  useEffect(() => {
    // Strict date matching to prevent duplicates
    const existing = reports.find(r => r.date === currentDate);
    if (existing) {
      setCurrentReportId(existing.id);
      setCurrentEntries(existing.entries);
    } else {
      setCurrentReportId(null);
      setCurrentEntries([]);
    }
  }, [currentDate, reports]);

  const getUserName = () => user?.displayName || user?.email || 'Anonymous';

  const saveReportState = async (report: DailyReport) => {
    const cleanedEntries = report.entries.map(e => {
        const { location, component } = standardizeHRTMapping(e.location, e.component);
        return { ...e, location, component };
    });
    const cleanedReport = { ...report, entries: cleanedEntries };

    setReports(prev => {
        const idx = prev.findIndex(r => r.id === cleanedReport.id);
        if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = cleanedReport;
            return copy;
        } else {
            return [cleanedReport, ...prev];
        }
    });

    if (cleanedReport.date === currentDate) {
      setUndoStack(prev => [currentEntries, ...prev].slice(0, 20));
      setCurrentEntries(cleanedReport.entries);
      setCurrentReportId(cleanedReport.id);
    }
    
    setIsGlobalSaving(true);
    try {
      await saveReportToCloud(cleanedReport);
      saveReportHistory(cleanedReport);
    } finally {
      setIsGlobalSaving(false);
    }
  };

  const handleItemsAdded = async (newItems: (DPRItem & { extractedDate?: string })[], rawText: string) => {
    setIsGlobalSaving(true);
    try {
        // Group items by date. Fallback to current UI date if no date extracted from text.
        const itemsByDate: Record<string, DPRItem[]> = {};
        const normalizeDate = (d: string) => {
             // Ensure valid YYYY-MM-DD
             if (!d || d === 'NaN' || d === 'Invalid Date') return currentDate;
             // Attempt to fix simple formatting issues if necessary (e.g. 2026-2-4 -> 2026-02-04)
             try {
                return new Date(d).toISOString().split('T')[0];
             } catch {
                return currentDate;
             }
        };
        
        newItems.forEach(item => {
            const { extractedDate, ...cleanItem } = item;
            const rawDate = extractedDate || currentDate;
            const targetDate = normalizeDate(rawDate);

            if (!itemsByDate[targetDate]) itemsByDate[targetDate] = [];
            
            const { location, component } = standardizeHRTMapping(cleanItem.location, cleanItem.component);
            itemsByDate[targetDate].push({
                ...cleanItem,
                id: cleanItem.id || crypto.randomUUID(),
                location,
                component,
                createdBy: getUserName(),
                lastModifiedAt: new Date().toISOString()
            } as DPRItem);
        });

        // Unique backup ID for the session
        const backupId = await savePermanentBackup(currentDate, rawText, newItems as DPRItem[], getUserName(), "Bulk Entry Session");

        // Sync each grouped date to Cloud
        for (const [date, items] of Object.entries(itemsByDate)) {
            const existingReport = reports.find(r => r.date === date);
            const reportId = existingReport ? existingReport.id : crypto.randomUUID();
            const existingEntries = existingReport?.entries || [];

            // ONLY tag with backupId if it's a multi-item batch. 
            // Single items are treated as manual/atomic entries to avoid "Bulk Entry" badge.
            const stampedItems = items.map(i => ({ 
                ...i, 
                sourceBackupId: (items.length > 1) ? backupId : undefined 
            }));
            
            const combined = [...existingEntries, ...stampedItems].sort((a, b) => getLocationPriority(a.location) - getLocationPriority(b.location));

            const report: DailyReport = {
                id: reportId,
                date: date,
                lastUpdated: new Date().toISOString(),
                projectTitle: settings?.projectName || "Bhotekoshi Hydroelectric Project",
                companyName: settings?.companyName,
                entries: combined
            };
            
            await saveReportToCloud(report);
            if (date === currentDate) {
                setCurrentEntries(combined);
                setCurrentReportId(reportId);
            }
        }
        
        logActivity(getUserName(), "Add Items", `Added ${newItems.length} records`, currentDate, backupId || undefined);
        incrementUserStats(user?.uid, newItems.length);
    } finally {
        setIsGlobalSaving(false);
    }
  };

  const handleUpdateItem = (id: string, updates: Partial<DPRItem>) => {
    const targetReport = reports.find(r => r.entries.some(e => e.id === id));
    if (!targetReport) return;

    const newEntries = targetReport.entries.map(item => {
      if (item.id === id) {
        return { 
          ...item, 
          ...updates,
          lastModifiedBy: getUserName(), 
          lastModifiedAt: new Date().toISOString()
        };
      }
      return item;
    });

    saveReportState({ ...targetReport, entries: newEntries, lastUpdated: new Date().toISOString() });
    if(inspectItem?.id === id) setInspectItem(prev => prev ? ({...prev, ...updates}) : null);
  };

  const handleDeleteItem = async (itemId: string) => {
    const targetReport = reports.find(r => r.entries.some(e => e.id === itemId));
    if (!targetReport) return;
    const itemToDelete = targetReport.entries.find(e => e.id === itemId);
    if (!itemToDelete) return;
    if (window.confirm("Archive this record?")) {
      await moveItemToTrash(itemToDelete, targetReport.id, targetReport.date, getUserName());
      const newEntries = targetReport.entries.filter(e => e.id !== itemId);
      await saveReportState({ ...targetReport, entries: newEntries, lastUpdated: new Date().toISOString() });
      if (inspectItem?.id === itemId) setInspectItem(null);
    }
  };

  const handleRecoverBackups = async (backups: BackupEntry[]) => {
      const confirmMsg = backups.length === 1 
        ? `Restore data from session ${backups[0].id.substring(0,8)}?` 
        : `Restore data from ${backups.length} sessions?`;
      
      if (!window.confirm(confirmMsg + " Duplicates will be skipped.")) return;

      setIsGlobalSaving(true);
      try {
          const reportsToSave = new Map<string, DailyReport>();
          let restoreCount = 0;

          const getReport = (date: string): DailyReport => {
              if (reportsToSave.has(date)) return reportsToSave.get(date)!;
              const existing = reports.find(r => r.date === date);
              if (existing) return { ...existing, entries: [...existing.entries] }; 
              return {
                  id: crypto.randomUUID(),
                  date: date,
                  lastUpdated: new Date().toISOString(),
                  projectTitle: settings?.projectName || "Bhotekoshi Hydroelectric Project",
                  companyName: settings?.companyName,
                  entries: []
              };
          };

          const allExistingIds = new Set<string>();
          reports.forEach(r => r.entries.forEach(e => allExistingIds.add(e.id)));

          for (const backup of backups) {
              for (const item of backup.parsedItems) {
                  if (allExistingIds.has(item.id)) continue; 

                  // Determine date priority: extractedDate -> backup.date
                  let targetDate = backup.date;
                  const castItem = item as (DPRItem & { extractedDate?: string });
                  if (castItem.extractedDate && /^\d{4}-\d{2}-\d{2}$/.test(castItem.extractedDate)) {
                      targetDate = castItem.extractedDate;
                  }

                  const report = getReport(targetDate);
                  
                  const itemToRestore = { ...item };
                  // Ensure ID linkage for revert capability
                  if (!itemToRestore.sourceBackupId) {
                      itemToRestore.sourceBackupId = backup.id;
                  }
                  
                  const { location, component } = standardizeHRTMapping(itemToRestore.location, itemToRestore.component);
                  itemToRestore.location = location;
                  itemToRestore.component = component;
                  
                  report.entries.push(itemToRestore);
                  report.entries.sort((a, b) => getLocationPriority(a.location) - getLocationPriority(b.location));
                  
                  reportsToSave.set(targetDate, report);
                  allExistingIds.add(item.id);
                  restoreCount++;
              }
          }

          if (restoreCount === 0) {
              alert("No new items to restore (all items already exist).");
          } else {
              for (const report of reportsToSave.values()) {
                  await saveReportToCloud(report);
              }
              logActivity(getUserName(), "Data Recovery", `Restored ${restoreCount} items from backups`, currentDate);
              alert(`Successfully restored ${restoreCount} items.`);
          }
      } catch (e) {
          console.error("Recovery failed", e);
          alert("Recovery failed. Check console.");
      } finally {
          setIsGlobalSaving(false);
      }
  };

  const handleRevertBulkSession = async (backupId: string) => {
      if (!window.confirm("Permanently remove ALL items created during this bulk upload session? (Manual updates will be safe)")) return;
      setIsGlobalSaving(true);
      try {
          const reportsToUpdate = reports.filter(r => r.entries.some(e => e.sourceBackupId === backupId));
          for (const report of reportsToUpdate) {
              const filteredEntries = report.entries.filter(e => e.sourceBackupId !== backupId);
              await saveReportToCloud({ ...report, entries: filteredEntries });
          }
          alert("Bulk session reverted. Cleanup complete.");
      } finally {
          setIsGlobalSaving(false);
      }
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  if (!user) return <div className="h-screen flex items-center justify-center"><button onClick={signInWithGoogle} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">Sign In to DPR Tool</button></div>;

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab} user={user} onLogout={logoutUser}>
        {activeTab === TabView.INPUT && <InputSection currentDate={currentDate} onDateChange={setCurrentDate} onItemsAdded={handleItemsAdded} onViewReport={() => setActiveTab(TabView.VIEW_REPORT)} entryCount={currentEntries.length} user={user} hierarchy={hierarchy} customItemTypes={settings?.itemTypes} />}
        {activeTab === TabView.VIEW_REPORT && <ReportTable report={{id: currentReportId || '', date: currentDate, lastUpdated: '', projectTitle: settings?.projectName || '', companyName: settings?.companyName, entries: currentEntries}} onDeleteItem={handleDeleteItem} onUpdateItem={(id, f, v) => handleUpdateItem(id, {[f]: v})} onUpdateRow={handleUpdateItem} onUndo={() => {}} canUndo={false} onRedo={() => {}} canRedo={false} onInspectItem={setInspectItem} hierarchy={hierarchy} />}
        {activeTab === TabView.LINING && <HRTLiningView reports={reports} user={user} onInspectItem={setInspectItem} onHardSync={() => {}} blockedItemIds={settings?.blockedLiningItemIds || []} onToggleBlock={() => {}} />}
        {activeTab === TabView.QUANTITY && <QuantityView reports={reports} user={user} onInspectItem={setInspectItem} onHardSync={() => {}} customItemTypes={settings?.itemTypes} />}
        {activeTab === TabView.HISTORY && <HistoryList reports={reports} currentReportId={currentReportId || ''} onSelectReport={(id) => { const r = reports.find(r=>r.id===id); if(r) setCurrentDate(r.date); setActiveTab(TabView.VIEW_REPORT); }} onDeleteReport={(id) => moveReportToTrash(reports.find(r=>r.id===id)!, getUserName())} onCreateNew={() => setActiveTab(TabView.INPUT)} />}
        {activeTab === TabView.LOGS && <ActivityLogs logs={logs} onRevertBulk={handleRevertBulkSession} onRecover={handleRecoverBackups} />}
        {activeTab === TabView.RECYCLE_BIN && <RecycleBin logs={logs} trashItems={trashItems} onRestore={restoreTrashItem} />}
        {activeTab === TabView.SETTINGS && <ProjectSettingsView currentSettings={settings} onSave={(s) => { setSettings(s); setHierarchy(s.locationHierarchy); saveProjectSettings(s); }} reports={reports} quantities={[]} user={user} />}
        {activeTab === TabView.PROFILE && <ProfileView user={user} />}
        {inspectItem && <MasterRecordModal item={inspectItem} isOpen={true} onClose={() => setInspectItem(null)} onUpdate={handleUpdateItem} onSplit={() => {}} onDelete={handleDeleteItem} hierarchy={hierarchy} customItemTypes={settings?.itemTypes} />}
        {isGlobalSaving && <div className="fixed bottom-8 right-8 bg-slate-900 text-white px-4 py-2 rounded-lg shadow-xl animate-bounce z-50 text-xs font-bold uppercase tracking-wider">Cloud Syncing...</div>}
    </Layout>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
