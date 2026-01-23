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
import { DailyReport, DPRItem, TabView, LogEntry, TrashItem, ProjectSettings, EditHistory } from './types';
import { getLocationPriority, LOCATION_HIERARCHY } from './utils/constants';
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

  const saveReportState = async (report: DailyReport) => {
    if (report.date === currentDate) {
      setUndoStack(prev => [currentEntries, ...prev].slice(0, 20));
      setRedoStack([]);
      setCurrentEntries(report.entries);
    }
    
    setIsGlobalSaving(true);
    try {
      await saveReportToCloud(report);
      saveReportHistory(report);
    } finally {
      setIsGlobalSaving(false);
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0 || !currentReportId) return;
    const prev = undoStack[0];
    setRedoStack(curr => [currentEntries, ...curr]);
    setUndoStack(curr => curr.slice(1));
    
    const report: DailyReport = {
      id: currentReportId,
      date: currentDate,
      lastUpdated: new Date().toISOString(),
      projectTitle: settings?.projectName || "Bhotekoshi Hydroelectric Project",
      companyName: settings?.companyName,
      entries: prev
    };
    saveReportState(report);
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !currentReportId) return;
    const next = redoStack[0];
    setUndoStack(curr => [currentEntries, ...curr]);
    setRedoStack(curr => curr.slice(1));
    
    const report: DailyReport = {
      id: currentReportId,
      date: currentDate,
      lastUpdated: new Date().toISOString(),
      projectTitle: settings?.projectName || "Bhotekoshi Hydroelectric Project",
      companyName: settings?.companyName,
      entries: next
    };
    saveReportState(report);
  };

  const findReportForItem = (itemId: string): DailyReport | undefined => {
    return reports.find(r => r.entries.some(e => e.id === itemId));
  };

  const handleUpdateItem = (id: string, updates: Partial<DPRItem>) => {
    const targetReport = findReportForItem(id);
    if (!targetReport) return;

    // Logic to calculate derived fields (Auto-refresh 'Area / CH' column)
    let derivedUpdates: Partial<DPRItem> = {};
    const currentItem = targetReport.entries.find(e => e.id === id);
    
    if (currentItem && (updates.chainage !== undefined || updates.structuralElement !== undefined)) {
        const newCh = updates.chainage !== undefined ? updates.chainage : currentItem.chainage;
        const newSt = updates.structuralElement !== undefined ? updates.structuralElement : currentItem.structuralElement;
        derivedUpdates.chainageOrArea = `${newCh || ''} ${newSt || ''}`.trim();
    }

    const newEntries = targetReport.entries.map(item => {
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
          ...derivedUpdates, // Apply derived field updates
          lastModifiedBy: getUserName(), 
          lastModifiedAt: new Date().toISOString(),
          editHistory: [...(item.editHistory || []), ...history]
        };
      }
      return item;
    });

    saveReportState({ ...targetReport, entries: newEntries, lastUpdated: new Date().toISOString() });
    
    // Update the inspector modal live if it's open, including derived fields
    if(inspectItem?.id === id) {
        setInspectItem(prev => prev ? ({...prev, ...updates, ...derivedUpdates}) : null);
    }
  };

  const handleHardSync = async () => {
    if (!window.confirm("Perform Global Autofill? The AI will learn from your manually corrected entries to fix old data. Proceed?")) return;
    
    setIsGlobalSaving(true);
    let updatedCount = 0;

    try {
      const verifiedItems: DPRItem[] = [];
      reports.forEach(r => {
          r.entries.forEach(e => {
              const hasHistory = e.editHistory && e.editHistory.length > 0;
              const hasComplexLocation = e.component && (e.activityDescription.toLowerCase().includes('apron') || e.activityDescription.toLowerCase().includes('key'));
              if ((hasHistory || hasComplexLocation) && e.quantity > 0 && e.unit) {
                  if (verifiedItems.length < 25) verifiedItems.push(e);
              }
          });
      });

      const learnedContext = verifiedItems.map(v => 
          `USER VERIFIED MAPPING: Text "${v.activityDescription}" maps to [Location: ${v.location}, Component: ${v.component}, Element: ${v.structuralElement}, Qty: ${v.quantity}, Unit: ${v.unit}, Type: ${v.itemType}]`
      ).join('\n');

      for (const report of reports) {
        let reportModified = false;
        const newEntries = await Promise.all(report.entries.map(async (item) => {
          // If record is "thin" (no quantity, no unit, or unclassified), re-parse
          const needsRepair = !item.quantity || item.quantity === 0 || !item.unit || item.unit === "" || item.itemType === 'Other';
          
          if (needsRepair && item.activityDescription) {
            const result = await autofillItemData(item.activityDescription, settings?.itemTypes, learnedContext);
            if (result.quantity !== undefined || result.unit) {
              reportModified = true;
              updatedCount++;
              return { 
                ...item, 
                ...result, 
                unit: result.unit || item.unit || 'm3', // Absolute fallback
                lastModifiedBy: 'AI Global Sync',
                lastModifiedAt: new Date().toISOString() 
              };
            }
          }
          return item;
        }));

        if (reportModified) {
          await saveReportToCloud({ ...report, entries: newEntries, lastUpdated: new Date().toISOString() });
        }
      }
      alert(`Hard Sync Complete! Successfully updated ${updatedCount} records.`);
    } catch (e) {
      console.error(e);
      alert("Hard Sync failed.");
    } finally {
      setIsGlobalSaving(false);
    }
  };

  const handleSplitItem = (originalItem: DPRItem) => {
    const targetReport = findReportForItem(originalItem.id);
    if (!targetReport) return;

    const newItem: DPRItem = {
        ...originalItem,
        id: crypto.randomUUID(),
        activityDescription: `${originalItem.activityDescription} (Split)`,
        quantity: 0, 
        unit: originalItem.unit || 'm3',
        createdBy: getUserName(),
        lastModifiedAt: new Date().toISOString(),
        editHistory: [{
          timestamp: new Date().toISOString(),
          user: getUserName(),
          field: 'Source',
          oldValue: 'None',
          newValue: `Split from ID ${originalItem.id.substring(0, 8)}`
        }]
    };
    
    const index = targetReport.entries.findIndex(e => e.id === originalItem.id);
    const newEntries = [...targetReport.entries];
    newEntries.splice(index + 1, 0, newItem);
    
    saveReportState({ ...targetReport, entries: newEntries, lastUpdated: new Date().toISOString() });
  };

  const handleDeleteItem = async (itemId: string) => {
    const targetReport = findReportForItem(itemId);
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

  const handleItemsAdded = async (newItems: DPRItem[], rawText: string) => {
    const id = currentReportId || crypto.randomUUID();
    
    // HYDRATION: Ensure every item has an explicit unit string before saving
    const hydratedItems = newItems.map(item => ({
        ...item,
        unit: item.unit || 'm3', // Enforce 'm3' default if empty
        id: item.id || crypto.randomUUID(),
        createdBy: item.createdBy || getUserName()
    }));

    const backupId = await savePermanentBackup(currentDate, rawText, hydratedItems, getUserName(), id);
    const stamped = hydratedItems.map(i => ({...i, sourceBackupId: backupId || undefined}));
    const combined = [...currentEntries, ...stamped].sort((a, b) => getLocationPriority(a.location) - getLocationPriority(b.location));
    
    const report: DailyReport = {
      id,
      date: currentDate,
      lastUpdated: new Date().toISOString(),
      projectTitle: settings?.projectName || "Bhotekoshi Hydroelectric Project",
      companyName: settings?.companyName,
      entries: combined
    };
    
    saveReportState(report);
    logActivity(getUserName(), "Items Added", `Added ${newItems.length} records`, currentDate, backupId || undefined);
    incrementUserStats(user?.uid, newItems.length);
  };

  const handleToggleBlockItem = async (itemId: string) => {
      if(!settings) return;
      const currentBlocked = settings.blockedLiningItemIds || [];
      let newBlocked;
      if (currentBlocked.includes(itemId)) {
          newBlocked = currentBlocked.filter(id => id !== itemId);
      } else {
          newBlocked = [...currentBlocked, itemId];
      }
      const newSettings = { ...settings, blockedLiningItemIds: newBlocked };
      setSettings(newSettings);
      await saveProjectSettings(newSettings);
      logActivity(getUserName(), "Lining Block Toggle", `${currentBlocked.includes(itemId) ? 'Unblocked' : 'Blocked'} item ${itemId} from lining progress`, currentDate);
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  if (!user) return <div className="h-screen flex items-center justify-center"><button onClick={signInWithGoogle} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">Sign In to DPR Tool</button></div>;

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab} user={user} onLogout={logoutUser}>
        {activeTab === TabView.INPUT && <InputSection currentDate={currentDate} onDateChange={setCurrentDate} onItemsAdded={handleItemsAdded} onViewReport={() => setActiveTab(TabView.VIEW_REPORT)} entryCount={currentEntries.length} user={user} hierarchy={hierarchy} />}
        {activeTab === TabView.VIEW_REPORT && <ReportTable report={{id: currentReportId || '', date: currentDate, lastUpdated: '', projectTitle: settings?.projectName || '', companyName: settings?.companyName, entries: currentEntries}} onDeleteItem={handleDeleteItem} onUpdateItem={(id, f, v) => handleUpdateItem(id, {[f]: v})} onUpdateRow={handleUpdateItem} onUndo={handleUndo} canUndo={undoStack.length > 0} onRedo={handleRedo} canRedo={redoStack.length > 0} onInspectItem={setInspectItem} hierarchy={hierarchy} />}
        {activeTab === TabView.LINING && <HRTLiningView reports={reports} user={user} onInspectItem={setInspectItem} onHardSync={handleHardSync} blockedItemIds={settings?.blockedLiningItemIds || []} onToggleBlock={handleToggleBlockItem} />}
        {activeTab === TabView.QUANTITY && <QuantityView reports={reports} user={user} onInspectItem={setInspectItem} onHardSync={handleHardSync} customItemTypes={settings?.itemTypes} />}
        {activeTab === TabView.HISTORY && <HistoryList reports={reports} currentReportId={currentReportId || ''} onSelectReport={(id) => { const r = reports.find(r=>r.id===id); if(r) setCurrentDate(r.date); setActiveTab(TabView.VIEW_REPORT); }} onDeleteReport={(id) => moveReportToTrash(reports.find(r=>r.id===id)!, getUserName())} onCreateNew={() => { setCurrentDate(new Date().toISOString().split('T')[0]); setActiveTab(TabView.INPUT); }} />}
        {activeTab === TabView.LOGS && <ActivityLogs logs={logs} />}
        {activeTab === TabView.RECYCLE_BIN && <RecycleBin logs={logs} trashItems={trashItems} onRestore={restoreTrashItem} />}
        {activeTab === TabView.SETTINGS && <ProjectSettingsView currentSettings={settings} onSave={(s) => { setSettings(s); setHierarchy(s.locationHierarchy); saveProjectSettings(s); }} reports={reports} quantities={[]} user={user} />}
        {activeTab === TabView.PROFILE && <ProfileView user={user} />}
        
        {inspectItem && <MasterRecordModal item={inspectItem} isOpen={true} onClose={() => setInspectItem(null)} onUpdate={handleUpdateItem} onSplit={handleSplitItem} onDelete={handleDeleteItem} hierarchy={hierarchy} customItemTypes={settings?.itemTypes} />}
        {isGlobalSaving && <div className="fixed bottom-8 right-8 bg-slate-900 text-white px-4 py-2 rounded-lg shadow-xl animate-bounce z-50 text-xs font-bold uppercase tracking-wider">Cloud Syncing...</div>}
    </Layout>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);