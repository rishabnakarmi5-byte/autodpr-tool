
import React, { useState, useEffect, useMemo } from 'react';
import { LogEntry, BackupEntry, DPRItem } from '../types';
import { getBackups } from '../services/firebaseService';

interface ActivityLogsProps {
  logs: LogEntry[];
  onRecover?: (backups: BackupEntry[]) => void;
  onRestoreItem?: (item: DPRItem, date: string) => void;
  onRestoreRaw?: (backup: BackupEntry, date: string) => void;
  onRevertBulk?: (backupId: string) => void;
}

export const ActivityLogs: React.FC<ActivityLogsProps> = ({ logs, onRecover, onRestoreItem, onRestoreRaw, onRevertBulk }) => {
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [isStorageOpen, setIsStorageOpen] = useState(false);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [selectedBackupIds, setSelectedBackupIds] = useState<Set<string>>(new Set());
  const [restoreDateModal, setRestoreDateModal] = useState<{item?: DPRItem, backup?: BackupEntry, backupDate: string, type: 'item' | 'raw'} | null>(null);
  const [targetDate, setTargetDate] = useState('');

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
      const data = await getBackups(100, backupStartDate, backupEndDate);
      setBackups(data);
      if (targetId) setSelectedBackupIds(new Set([targetId]));
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => { if (isStorageOpen) handleOpenStorage(); }, [backupStartDate, backupEndDate]);

  const toggleBackupSelection = (id: string) => {
      setSelectedBackupIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
          return newSet;
      });
  };

  const getSelectedBackups = () => backups.filter(b => selectedBackupIds.has(b.id));

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
              } else {
                  if (currentGroup) result.push({ ...currentGroup, groupCount: count });
                  currentGroup = log;
                  count = 1;
              }
          } else {
              if (currentGroup) result.push({ ...currentGroup, groupCount: count });
              currentGroup = null;
              count = 0;
              result.push(log);
          }
      });
      if (currentGroup) result.push({ ...currentGroup, groupCount: count });
      return result;
  }, [logs]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in relative">
      <div className="border-b border-slate-200 pb-4 flex justify-between items-end">
        <div>
           <h2 className="text-3xl font-bold text-slate-800 tracking-tight uppercase">System Logs</h2>
           <p className="text-slate-500 mt-1">Audit trail and session management.</p>
        </div>
        <button onClick={() => handleOpenStorage()} className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2">
           <i className="fas fa-ambulance"></i> Recovery Center
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
         <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <i className="fas fa-list text-slate-400"></i>
            <h3 className="text-sm font-bold text-slate-700 uppercase">Recent Activity</h3>
         </div>
         <div className="overflow-x-auto">
           <table className="w-full text-left border-collapse">
             <thead className="bg-white border-b border-slate-100">
               <tr>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase w-40">Time</th>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase w-40">User</th>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase w-40">Action</th>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase">Details</th>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase w-32">Source</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-50">
               {groupedLogs.map((log) => {
                   const date = new Date(log.timestamp);
                   const isGrouped = (log.groupCount || 0) > 1;
                   return (
                     <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                       <td className="p-4 text-sm text-slate-500">
                         <div className="font-bold text-slate-700">{date.toLocaleDateString()}</div>
                         <div className="text-xs">{date.toLocaleTimeString()}</div>
                       </td>
                       <td className="p-4"><span className="text-sm font-medium">{log.user.split(' ')[0]}</span></td>
                       <td className="p-4"><span className="text-[10px] font-black px-2 py-1 rounded bg-slate-100 uppercase">{log.action}</span></td>
                       <td className="p-4 text-sm text-slate-600 truncate max-w-md">{isGrouped ? `Collapsed ${log.groupCount} sessions` : log.details}</td>
                       <td className="p-4">
                         {(log as any).relatedBackupId && (
                             <button onClick={() => handleOpenStorage((log as any).relatedBackupId)} className="bg-white border border-slate-200 text-slate-600 px-3 py-1 rounded text-[10px] font-bold">Inspect</button>
                         )}
                       </td>
                     </tr>
                   );
               })}
             </tbody>
           </table>
         </div>
      </div>

      {isStorageOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full h-full md:h-[95vh] md:max-w-[95vw] relative flex flex-col overflow-hidden">
              <div className="flex justify-between items-center p-6 border-b border-slate-200 bg-slate-50">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg"><i className="fas fa-first-aid text-white text-2xl"></i></div>
                    <div>
                        <h3 className="text-2xl font-bold text-slate-800 uppercase tracking-tight">Recovery Center</h3>
                        <p className="text-sm text-slate-500">Manage bulk sessions and restore structured data.</p>
                    </div>
                 </div>
                 <button onClick={() => setIsStorageOpen(false)} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center"><i className="fas fa-times"></i></button>
              </div>

              <div className="flex-1 flex overflow-hidden">
                  <div className="w-full md:w-1/3 border-r border-slate-200 flex flex-col bg-slate-50/50">
                     <div className="p-4 border-b border-slate-200 bg-white shadow-sm">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Date Filter</label>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="date" value={backupStartDate} onChange={e => setBackupStartDate(e.target.value)} className="p-2 border rounded text-xs" />
                            <input type="date" value={backupEndDate} onChange={e => setBackupEndDate(e.target.value)} className="p-2 border rounded text-xs" />
                        </div>
                     </div>
                     <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                        {backups.map(item => (
                            <div key={item.id} onClick={() => toggleBackupSelection(item.id)} className={`p-4 cursor-pointer hover:bg-white transition-all ${selectedBackupIds.has(item.id) ? 'bg-white border-l-4 border-emerald-500' : 'border-l-4 border-transparent'}`}>
                                <div className="text-[10px] font-bold text-slate-400 mb-1">{item.date} • {new Date(item.timestamp).toLocaleTimeString()}</div>
                                <div className="text-sm font-bold text-slate-800 line-clamp-2">{item.rawInput.substring(0, 80)}...</div>
                                <div className="text-[10px] text-indigo-600 font-black mt-2 uppercase">{item.parsedItems.length} Entries • {item.user.split(' ')[0]}</div>
                            </div>
                        ))}
                     </div>
                  </div>

                  <div className="hidden md:block w-2/3 p-6 overflow-y-auto bg-slate-50">
                      {selectedBackupIds.size > 0 ? (
                          <div className="space-y-6">
                              <div className="flex justify-between items-center pb-4 border-b border-slate-200">
                                  <h2 className="text-xl font-bold text-slate-800">Preview Session</h2>
                                  <div className="flex gap-2">
                                     {selectedBackupIds.size === 1 && onRevertBulk && (
                                         <button onClick={() => onRevertBulk(Array.from(selectedBackupIds)[0])} className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-600 hover:text-white transition-all">
                                             <i className="fas fa-undo-alt mr-2"></i> Revert This Session Only
                                         </button>
                                     )}
                                     {onRecover && (
                                         <button onClick={() => onRecover(getSelectedBackups())} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg">Reconstruct Data</button>
                                     )}
                                  </div>
                              </div>
                              {getSelectedBackups().map(backup => (
                                  <div key={backup.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                      <div className="p-3 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 flex justify-between">
                                          <span>SESSION: {backup.id.substring(0,8)}</span>
                                          <span>{backup.user}</span>
                                      </div>
                                      <div className="p-4">
                                          <p className="text-xs font-mono text-slate-700 bg-slate-50 p-3 rounded-lg mb-4">{backup.rawInput}</p>
                                          <div className="divide-y divide-slate-100">
                                              {backup.parsedItems.map((item, i) => (
                                                  <div key={i} className="py-2 flex justify-between items-center">
                                                      <div>
                                                          <div className="text-[10px] font-black text-indigo-600 uppercase">{item.location} • {item.component}</div>
                                                          <div className="text-xs font-bold text-slate-800">{item.activityDescription}</div>
                                                      </div>
                                                      <div className="text-xs font-black text-slate-400">{item.quantity}{item.unit}</div>
                                                  </div>
                                              ))}
                                          </div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      ) : (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400 italic">
                             <i className="fas fa-layer-group text-4xl mb-4 opacity-20"></i>
                             Select a session from the list to preview or revert.
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
