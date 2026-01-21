
import React, { useState, useEffect } from 'react';
import { LogEntry, BackupEntry } from '../types';
import { getBackups } from '../services/firebaseService';

interface ActivityLogsProps {
  logs: LogEntry[];
  onRecover?: (backup: BackupEntry) => void;
}

export const ActivityLogs: React.FC<ActivityLogsProps> = ({ logs, onRecover }) => {
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  
  // Backup / Storage State
  const [isStorageOpen, setIsStorageOpen] = useState(false);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupEntry | null>(null);
  
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
          const target = data.find(b => b.id === targetId);
          if (target) setSelectedBackup(target);
      } else if (data.length > 0 && !selectedBackup) {
          setSelectedBackup(data[0]);
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
        handleOpenStorage(selectedBackup?.id);
    }
  }, [backupStartDate, backupEndDate]);


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
               {logs.length === 0 ? (
                 <tr>
                   <td colSpan={5} className="p-8 text-center text-slate-400 italic">No activity recorded yet.</td>
                 </tr>
               ) : (
                 logs.map((log) => {
                   const date = new Date(log.timestamp);
                   const isJson = log.details.startsWith('{') || log.details.startsWith('[');

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
                         {isJson ? (
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
                        <p className="text-sm text-slate-500">Access every raw input ever sent to the system.</p>
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
                                    const isActive = selectedBackup?.id === item.id;
                                    return (
                                        <div 
                                            key={item.id} 
                                            onClick={() => setSelectedBackup(item)}
                                            className={`p-4 cursor-pointer hover:bg-white transition-all border-l-4 ${isActive ? 'bg-white border-emerald-500 shadow-md transform scale-[1.02] z-10' : 'border-transparent hover:border-slate-300'}`}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                                    {item.date}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-mono">{date.toLocaleTimeString()}</span>
                                            </div>
                                            <div className="text-sm font-medium text-slate-800 mb-2 line-clamp-2 leading-relaxed">
                                                {item.rawInput.substring(0, 100).replace(/\n/g, ' ')}
                                            </div>
                                            <div className="flex justify-between items-center text-xs text-slate-500">
                                                <div className="flex items-center gap-1">
                                                    <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-600">{item.user.charAt(0)}</div>
                                                    {item.user.split(' ')[0]}
                                                </div>
                                                <div className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full">
                                                    <i className="fas fa-layer-group text-[10px]"></i> {item.parsedItems.length} items
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                     </div>
                  </div>

                  {/* Main Detail View */}
                  <div className="hidden md:block w-2/3 p-6 overflow-y-auto bg-slate-50">
                      {selectedBackup ? (
                          <div className="space-y-6 max-w-4xl mx-auto">
                              
                              <div className="flex justify-between items-center">
                                  <div>
                                     <h2 className="text-2xl font-bold text-slate-800">Backup Details</h2>
                                     <p className="text-sm text-slate-500 font-mono">ID: {selectedBackup.id}</p>
                                  </div>
                                  
                                  {onRecover && (
                                     <button 
                                        onClick={() => onRecover(selectedBackup)}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-emerald-200 hover:shadow-emerald-300 transition-all flex items-center gap-2"
                                     >
                                         <i className="fas fa-history"></i> Reconstruct Report
                                     </button>
                                  )}
                              </div>

                              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                  <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                         <i className="fas fa-keyboard text-emerald-600 text-lg"></i>
                                         <h4 className="text-sm font-bold text-emerald-900 uppercase tracking-wide">Original User Input</h4>
                                      </div>
                                      <button 
                                        onClick={() => navigator.clipboard.writeText(selectedBackup.rawInput)}
                                        className="text-xs text-emerald-600 hover:text-emerald-800 font-bold"
                                      >
                                          Copy Text
                                      </button>
                                  </div>
                                  <div className="p-6 text-sm font-mono whitespace-pre-wrap text-slate-700 bg-white leading-relaxed">
                                      {selectedBackup.rawInput}
                                  </div>
                              </div>

                              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                  <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
                                      <i className="fas fa-robot text-indigo-600 text-lg"></i>
                                      <h4 className="text-sm font-bold text-indigo-900 uppercase tracking-wide">Processed Data ({selectedBackup.parsedItems.length})</h4>
                                  </div>
                                  <div className="max-h-80 overflow-y-auto">
                                      <table className="w-full text-left text-sm">
                                          <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase font-bold border-b border-slate-200 sticky top-0">
                                              <tr>
                                                  <th className="p-3">Location</th>
                                                  <th className="p-3">Component</th>
                                                  <th className="p-3">Activity Description</th>
                                              </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                              {selectedBackup.parsedItems.map((item, idx) => (
                                                  <tr key={idx} className="hover:bg-slate-50">
                                                      <td className="p-3 font-bold text-slate-700">{item.location}</td>
                                                      <td className="p-3 text-slate-600 text-xs">{item.component}</td>
                                                      <td className="p-3 text-slate-500">{item.activityDescription}</td>
                                                  </tr>
                                              ))}
                                          </tbody>
                                      </table>
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400">
                              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                                 <i className="fas fa-mouse-pointer text-3xl text-slate-300"></i>
                              </div>
                              <p className="text-xl font-bold text-slate-500">Select a backup entry</p>
                              <p className="text-sm mt-2">Browse the history on the left to inspect raw data.</p>
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
