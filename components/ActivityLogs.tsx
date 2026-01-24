
import React, { useState, useEffect, useMemo } from 'react';
import { LogEntry, BackupEntry, DPRItem } from '../types';
import { getBackups } from '../services/firebaseService';

interface ActivityLogsProps {
  logs: LogEntry[];
  onRecover?: (backups: BackupEntry[]) => void;
  onRestoreItem?: (item: DPRItem, date: string) => void;
  onRestoreRaw?: (backup: BackupEntry, date: string) => void;
}

export const ActivityLogs: React.FC<ActivityLogsProps> = ({ logs, onRecover, onRestoreItem, onRestoreRaw }) => {
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  
  // Backup / Storage State
  const [isStorageOpen, setIsStorageOpen] = useState(false);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [selectedBackupIds, setSelectedBackupIds] = useState<Set<string>>(new Set());
  
  // Single Restore Modal State
  const [restoreDateModal, setRestoreDateModal] = useState<{item?: DPRItem, backup?: BackupEntry, backupDate: string, type: 'item' | 'raw'} | null>(null);
  const [targetDate, setTargetDate] = useState('');

  // Storage Filters
  const [backupStartDate, setBackupStartDate] = useState<string>(
    new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]
  );
  const [backupEndDate, setBackupEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const handleOpenStorage = async (targetId?: string) => {
    setIsStorageOpen(true);
    setLoadingBackups(true);
    try {
      // Fetch with date filters
      const data = await getBackups(100, backupStartDate, backupEndDate);
      setBackups(data);

      if (targetId) {
          // If a specific ID was requested (via log Inspect), toggle it only
          setSelectedBackupIds(new Set([targetId]));
      } else {
          // Default: Empty selection or keep previous? Resetting is safer.
          setSelectedBackupIds(new Set());
      }
    } catch (error) {
      alert("Failed to load archived data.");
    } finally {
      setLoadingBackups(false);
    }
  };

  // Auto-refresh when dates change if modal is open
  useEffect(() => {
    if (isStorageOpen) {
        handleOpenStorage();
    }
  }, [backupStartDate, backupEndDate]);

  const toggleBackupSelection = (id: string) => {
      setSelectedBackupIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(id)) {
              newSet.delete(id);
          } else {
              newSet.add(id);
          }
          return newSet;
      });
  };

  const getSelectedBackups = () => {
      return backups.filter(b => selectedBackupIds.has(b.id));
  };

  const initiateRestoreSingleItem = (backup: BackupEntry, item: DPRItem) => {
      setTargetDate(backup.date); // Default to original date
      setRestoreDateModal({ item, backupDate: backup.date, type: 'item' });
  };

  const initiateRestoreRaw = (backup: BackupEntry) => {
      setTargetDate(backup.date);
      setRestoreDateModal({ backup, backupDate: backup.date, type: 'raw' });
  };

  const confirmRestore = () => {
      if (restoreDateModal && targetDate) {
          if (restoreDateModal.type === 'item' && onRestoreItem && restoreDateModal.item) {
             onRestoreItem(restoreDateModal.item, targetDate);
          } else if (restoreDateModal.type === 'raw' && onRestoreRaw && restoreDateModal.backup) {
             onRestoreRaw(restoreDateModal.backup, targetDate);
          }
          setRestoreDateModal(null);
      }
  };

  // --- LOG GROUPING LOGIC ---
  const groupedLogs = useMemo(() => {
      if (logs.length === 0) return [];
      
      const result: (LogEntry & { groupCount?: number })[] = [];
      let currentGroup: LogEntry | null = null;
      let count = 0;

      logs.forEach((log) => {
          const isSessionLog = log.action === "Session Active" || log.details.includes("User authenticated");
          
          if (isSessionLog) {
              if (currentGroup && currentGroup.user === log.user && (currentGroup.action === "Session Active" || currentGroup.details.includes("User authenticated"))) {
                  count++;
                  // Update timestamp to show range? For now just keep latest (first in list)
              } else {
                  // Push previous group
                  if (currentGroup) {
                      result.push({ ...currentGroup, groupCount: count });
                  }
                  // Start new group
                  currentGroup = log;
                  count = 1;
              }
          } else {
              // Flush any pending session group
              if (currentGroup) {
                  result.push({ ...currentGroup, groupCount: count });
                  currentGroup = null;
                  count = 0;
              }
              // Push normal log
              result.push(log);
          }
      });

      // Flush final
      if (currentGroup) {
          result.push({ ...currentGroup, groupCount: count });
      }

      return result;
  }, [logs]);


  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in relative">
      <div className="border-b border-slate-200 pb-4 flex justify-between items-end">
        <div>
           <h2 className="text-3xl font-bold text-slate-800">System Logs</h2>
           <p className="text-slate-500 mt-1">Audit trail and data recovery center.</p>
        </div>
        <button 
           onClick={() => handleOpenStorage()}
           className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg shadow-emerald-200 transition-all flex items-center gap-2 transform hover:-translate-y-0.5"
        >
           <i className="fas fa-ambulance text-lg"></i> Open Recovery Center
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
         <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <i className="fas fa-list text-slate-400"></i>
            <h3 className="text-sm font-bold text-slate-700 uppercase">Recent Activity Stream</h3>
         </div>
         <div className="overflow-x-auto">
           <table className="w-full text-left border-collapse">
             <thead className="bg-white border-b border-slate-100">
               <tr>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-40">Time</th>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-40">User</th>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-40">Action</th>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Details</th>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32">Source</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-50">
               {groupedLogs.length === 0 ? (
                 <tr>
                   <td colSpan={5} className="p-8 text-center text-slate-400 italic">No activity recorded yet.</td>
                 </tr>
               ) : (
                 groupedLogs.map((log) => {
                   const date = new Date(log.timestamp);
                   const isJson = log.details.startsWith('{') || log.details.startsWith('[');
                   const isGrouped = (log.groupCount || 0) > 1;

                   return (
                     <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                       <td className="p-4 text-sm text-slate-500 whitespace-nowrap">
                         <div className="font-medium text-slate-700">{date.toLocaleDateString()}</div>
                         <div className="text-xs text-slate-400">{date.toLocaleTimeString()}</div>
                       </td>
                       <td className="p-4">
                         <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                             {log.user.charAt(0).toUpperCase()}
                           </div>
                           <span className="text-sm font-medium text-slate-700">{log.user.split(' ')[0]}</span>
                         </div>
                       </td>
                       <td className="p-4">
                         <span className={`text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wide
                           ${log.action.includes('Delete') ? 'bg-red-50 text-red-600' : 
                             log.action.includes('Update') ? 'bg-blue-50 text-blue-600' : 
                             'bg-emerald-50 text-emerald-600'}`}>
                           {log.action}
                         </span>
                       </td>
                       <td className="p-4 text-sm text-slate-600 max-w-md truncate" title={log.details}>
                         {isGrouped ? (
                             <span className="text-slate-400 italic">
                                 <i className="fas fa-layer-group mr-1"></i>
                                 Collapsed {log.groupCount} consecutive login sessions
                             </span>
                         ) : isJson ? (
                             <button 
                                onClick={() => setSelectedLog(log)}
                                className="text-indigo-600 font-bold hover:underline text-xs flex items-center gap-1"
                             >
                                <i className="fas fa-code"></i> View Data Payload
                             </button>
                         ) : log.details}
                       </td>
                       <td className="p-4">
                         {(log as any).relatedBackupId && (
                             <button 
                                onClick={() => handleOpenStorage((log as any).relatedBackupId)}
                                className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-sm"
                             >
                                 <i className="fas fa-search mr-1"></i> Inspect
                             </button>
                         )}
                       </td>
                     </tr>
                   );
                 })
               )}
             </tbody>
           </table>
         </div>
      </div>

      {/* Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 relative flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                 <h3 className="text-lg font-bold text-slate-800">Log Details: {selectedLog.action}</h3>
                 <button onClick={() => setSelectedLog(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                    <i className="fas fa-times text-slate-500"></i>
                 </button>
              </div>
              <div className="bg-slate-900 rounded-lg p-4 overflow-auto flex-1 border border-slate-700 shadow-inner">
                  <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap">
                      {(() => {
                          try {
                              return JSON.stringify(JSON.parse(selectedLog.details), null, 2);
                          } catch(e) {
                              return selectedLog.details;
                          }
                      })()}
                  </pre>
              </div>
           </div>
        </div>
      )}

      {/* RESTORE DATE SELECTION MODAL */}
      {restoreDateModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
              <div className="mb-4">
                 <h3 className="text-lg font-bold text-slate-800">
                     {restoreDateModal.type === 'raw' ? 'Convert Raw Text to Record' : 'Restore to Report'}
                 </h3>
                 <p className="text-sm text-slate-500 mt-1">Select which date to add this item to.</p>
              </div>
              
              <div className="mb-6">
                 <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Target Date</label>
                 <input 
                    type="date" 
                    value={targetDate} 
                    onChange={e => setTargetDate(e.target.value)} 
                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold"
                 />
              </div>

              <div className="flex gap-3">
                 <button onClick={() => setRestoreDateModal(null)} className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl">Cancel</button>
                 <button onClick={confirmRestore} className="flex-1 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-200">
                    <i className="fas fa-plus-circle mr-2"></i> {restoreDateModal.type === 'raw' ? 'Create Record' : 'Add Item'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* RECOVERY CENTER MODAL */}
      {isStorageOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full h-full md:h-[95vh] md:max-w-[95vw] relative flex flex-col overflow-hidden">
              
              {/* Header */}
              <div className="flex justify-between items-center p-4 md:p-6 border-b border-slate-200 bg-slate-50">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
                        <i className="fas fa-first-aid text-white text-2xl"></i>
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-slate-800">Recovery Center</h3>
                        <p className="text-sm text-slate-500">Select multiple entries to reconstruct a partial or full day report.</p>
                    </div>
                 </div>
                 <button onClick={() => setIsStorageOpen(false)} className="w-10 h-10 rounded-full bg-white hover:bg-slate-100 shadow border border-slate-200 flex items-center justify-center transition-colors">
                    <i className="fas fa-times text-slate-600"></i>
                 </button>
              </div>

              {/* Content */}
              <div className="flex-1 flex overflow-hidden">
                  
                  {/* Sidebar List */}
                  <div className="w-full md:w-1/3 border-r border-slate-200 flex flex-col bg-slate-50/50">
                     
                     {/* Date Filter */}
                     <div className="p-4 border-b border-slate-200 bg-white shadow-sm z-10">
                        <div className="flex items-center justify-between mb-2">
                             <label className="text-xs font-bold text-slate-400 uppercase tracking-wider"><i className="far fa-calendar-alt mr-1"></i> Date Range</label>
                             <div className="text-[10px] text-slate-400">
                                {selectedBackupIds.size} Selected
                             </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input 
                                type="date" 
                                value={backupStartDate}
                                onChange={(e) => setBackupStartDate(e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded text-sm bg-slate-50 hover:bg-white focus:bg-white transition-colors cursor-pointer" 
                            />
                            <input 
                                type="date" 
                                value={backupEndDate}
                                onChange={(e) => setBackupEndDate(e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded text-sm bg-slate-50 hover:bg-white focus:bg-white transition-colors cursor-pointer" 
                            />
                        </div>
                     </div>

                     <div className="flex-1 overflow-y-auto">
                        {loadingBackups ? (
                            <div className="p-12 text-center text-slate-400">
                                <i className="fas fa-circle-notch fa-spin text-3xl mb-3 text-emerald-500"></i><br/>
                                Scanning Archives...
                            </div>
                        ) : backups.length === 0 ? (
                            <div className="p-12 text-center text-slate-400 italic">
                                <i className="fas fa-search text-3xl mb-3 opacity-20"></i><br/>
                                No backups found in this range.
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {backups.map(item => {
                                    const date = new Date(item.timestamp);
                                    const isSelected = selectedBackupIds.has(item.id);
                                    
                                    return (
                                        <div 
                                            key={item.id} 
                                            onClick={() => toggleBackupSelection(item.id)}
                                            className={`p-4 cursor-pointer hover:bg-white transition-all border-l-4 group ${isSelected ? 'bg-white border-emerald-500 shadow-sm' : 'border-transparent hover:border-slate-300'}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`mt-1 w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300 group-hover:border-slate-400'}`}>
                                                    {isSelected && <i className="fas fa-check text-white text-[10px]"></i>}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isSelected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                                            {item.date}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 font-mono">{date.toLocaleTimeString()}</span>
                                                    </div>
                                                    <div className="text-sm font-medium text-slate-800 mb-2 line-clamp-2 leading-relaxed">
                                                        {item.rawInput.substring(0, 80).replace(/\n/g, ' ')}...
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs text-slate-500">
                                                        <div className="flex items-center gap-1">
                                                            <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-600">{item.user.charAt(0)}</div>
                                                            {item.user.split(' ')[0]}
                                                        </div>
                                                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${item.parsedItems.length === 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100'}`}>
                                                            <i className="fas fa-layer-group text-[10px]"></i> {item.parsedItems.length} items
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                     </div>
                  </div>

                  {/* Combined Preview View */}
                  <div className="hidden md:block w-2/3 p-6 overflow-y-auto bg-slate-50">
                      {selectedBackupIds.size > 0 ? (
                          <div className="space-y-6 max-w-4xl mx-auto">
                              
                              <div className="flex justify-between items-center sticky top-0 bg-slate-50 pt-2 pb-4 z-10 border-b border-slate-200 mb-4">
                                  <div>
                                     <h2 className="text-2xl font-bold text-slate-800">Preview Reconstruction</h2>
                                     <p className="text-sm text-slate-500 font-mono">{selectedBackupIds.size} backups selected</p>
                                  </div>
                                  
                                  {onRecover && (
                                     <button 
                                        onClick={() => onRecover(getSelectedBackups())}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-emerald-200 hover:shadow-emerald-300 transition-all flex items-center gap-2 animate-pulse"
                                     >
                                         <i className="fas fa-magic"></i> Reconstruct Full Report
                                     </button>
                                  )}
                              </div>

                              {getSelectedBackups().map((backup, index) => (
                                  <div key={backup.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                                      <div className="p-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
                                          <div className="flex items-center gap-2">
                                              <span className="bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded-md">Entry #{index + 1}</span>
                                              <span className="text-sm text-slate-600 font-medium">{new Date(backup.timestamp).toLocaleTimeString()} by {backup.user}</span>
                                          </div>
                                          <div className="text-xs text-slate-400 font-mono">ID: {backup.id.substring(0,8)}...</div>
                                      </div>
                                      
                                      {backup.parsedItems.length === 0 ? (
                                         <div className="p-6">
                                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                                                <p className="text-xs font-bold text-amber-700 uppercase mb-2"><i className="fas fa-exclamation-triangle mr-1"></i> No Structured Data Found</p>
                                                <p className="text-sm text-slate-700 font-mono whitespace-pre-wrap bg-white p-3 rounded border border-amber-100">
                                                    {backup.rawInput}
                                                </p>
                                            </div>
                                            <button 
                                                onClick={() => initiateRestoreRaw(backup)}
                                                className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                                            >
                                                <i className="fas fa-wand-magic-sparkles"></i> Convert Raw Text to Record
                                            </button>
                                         </div>
                                      ) : (
                                        <div className="grid grid-cols-1 divide-y divide-slate-100">
                                            {backup.parsedItems.map((item, i) => (
                                                <div key={i} className="p-4 hover:bg-slate-50 flex gap-4 group">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs font-bold border border-emerald-100 flex-shrink-0">
                                                        {i + 1}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 whitespace-nowrap">{item.location}</span>
                                                            <span className="text-xs text-slate-500 truncate">{item.component}</span>
                                                        </div>
                                                        <p className="text-sm text-slate-700 leading-relaxed break-words">{item.activityDescription}</p>
                                                        <div className="flex gap-2 mt-2">
                                                            <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                                                            {item.quantity} {item.unit}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center">
                                                        {onRestoreItem && (
                                                            <button 
                                                                onClick={() => initiateRestoreSingleItem(backup, item)}
                                                                className="bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm whitespace-nowrap"
                                                            >
                                                                <i className="fas fa-plus-circle mr-1"></i> Add to Report
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                      )}
                                  </div>
                              ))}
                          </div>
                      ) : (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400">
                              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                                 <i className="fas fa-check-double text-3xl text-slate-300"></i>
                              </div>
                              <p className="text-xl font-bold text-slate-500">Select entries to combine</p>
                              <p className="text-sm mt-2 max-w-sm text-center">Tick the boxes on the left to merge multiple backups (e.g. Morning + Afternoon) into a single report.</p>
                          </div>
                      )}
                  </div>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};
