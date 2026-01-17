import React, { useState } from 'react';
import { LogEntry, BackupEntry } from '../types';
import { getBackups } from '../services/firebaseService';

interface ActivityLogsProps {
  logs: LogEntry[];
}

export const ActivityLogs: React.FC<ActivityLogsProps> = ({ logs }) => {
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  
  // Backup / Storage State
  const [isStorageOpen, setIsStorageOpen] = useState(false);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupEntry | null>(null);

  const formatDetails = (details: string) => {
      try {
          const obj = JSON.parse(details);
          return (
             <span className="text-indigo-600 font-bold cursor-pointer hover:underline" onClick={() => setSelectedLog({ ...selectedLog!, details } as any)}>
                View JSON Details
             </span>
          );
      } catch (e) {
          return details;
      }
  };

  const handleOpenStorage = async () => {
    setIsStorageOpen(true);
    setLoadingBackups(true);
    try {
      const data = await getBackups(50); // Get last 50 entries
      setBackups(data);
    } catch (error) {
      alert("Failed to load archived data.");
    } finally {
      setLoadingBackups(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in relative">
      <div className="border-b border-slate-200 pb-4 flex justify-between items-end">
        <div>
           <h2 className="text-3xl font-bold text-slate-800">Activity Logs</h2>
           <p className="text-slate-500 mt-1">Audit trail of all changes made by users across the system.</p>
        </div>
        <button 
           onClick={handleOpenStorage}
           className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2"
        >
           <i className="fas fa-database"></i> Raw Input Storage
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
         <div className="overflow-x-auto">
           <table className="w-full text-left border-collapse">
             <thead className="bg-slate-50 border-b border-slate-200">
               <tr>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Timestamp</th>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">User</th>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Details</th>
                 <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Report Date</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
               {logs.length === 0 ? (
                 <tr>
                   <td colSpan={5} className="p-8 text-center text-slate-400 italic">No activity recorded yet.</td>
                 </tr>
               ) : (
                 logs.map((log) => {
                   const date = new Date(log.timestamp);
                   
                   // Try to detect if details is JSON for the onclick handler context
                   const isJson = log.details.startsWith('{') || log.details.startsWith('[');

                   return (
                     <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                       <td className="p-4 text-sm text-slate-500 whitespace-nowrap">
                         {date.toLocaleDateString()} <span className="text-slate-400 text-xs ml-1">{date.toLocaleTimeString()}</span>
                       </td>
                       <td className="p-4 text-sm font-medium text-indigo-600">
                         <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold">
                             {log.user.charAt(0).toUpperCase()}
                           </div>
                           {log.user}
                         </div>
                       </td>
                       <td className="p-4 text-sm font-semibold text-slate-700">
                         {log.action}
                       </td>
                       <td className="p-4 text-sm text-slate-600 max-w-xs truncate" title={log.details}>
                         {isJson ? (
                             <button 
                                onClick={() => setSelectedLog(log)}
                                className="text-indigo-600 font-bold hover:underline text-xs"
                             >
                                <i className="fas fa-code mr-1"></i> View Change Data
                             </button>
                         ) : log.details}
                       </td>
                       <td className="p-4 text-sm text-slate-500 font-mono">
                         {log.reportDate}
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

      {/* RAW STORAGE MODAL */}
      {isStorageOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full h-[90vh] relative flex flex-col overflow-hidden">
              
              {/* Header */}
              <div className="flex justify-between items-center p-6 border-b border-slate-200 bg-slate-50">
                 <div>
                    <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                       <i className="fas fa-database text-indigo-600"></i> Raw Input Archive
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                       Original WhatsApp text and AI-parsed results saved automatically.
                    </p>
                 </div>
                 <button onClick={() => setIsStorageOpen(false)} className="w-10 h-10 rounded-full bg-white hover:bg-slate-100 shadow border border-slate-200 flex items-center justify-center transition-colors">
                    <i className="fas fa-times text-slate-600"></i>
                 </button>
              </div>

              {/* Content */}
              <div className="flex-1 flex overflow-hidden">
                  {/* Sidebar List */}
                  <div className="w-1/3 border-r border-slate-200 overflow-y-auto bg-slate-50/50">
                     {loadingBackups ? (
                         <div className="p-8 text-center text-slate-400">
                             <i className="fas fa-circle-notch fa-spin text-2xl mb-2"></i><br/>
                             Loading archive...
                         </div>
                     ) : backups.length === 0 ? (
                         <div className="p-8 text-center text-slate-400 italic">No archives found.</div>
                     ) : (
                         <div className="divide-y divide-slate-100">
                             {backups.map(item => {
                                 const date = new Date(item.timestamp);
                                 const isActive = selectedBackup?.id === item.id;
                                 return (
                                     <div 
                                        key={item.id} 
                                        onClick={() => setSelectedBackup(item)}
                                        className={`p-4 cursor-pointer hover:bg-indigo-50 transition-colors ${isActive ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'border-l-4 border-transparent'}`}
                                     >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                                                {item.date}
                                            </span>
                                            <span className="text-[10px] text-slate-400">{date.toLocaleTimeString()}</span>
                                        </div>
                                        <div className="text-sm font-medium text-slate-800 mb-1 line-clamp-2">
                                            {item.rawInput.substring(0, 60).replace(/\n/g, ' ')}...
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-slate-500">
                                            <span><i className="fas fa-user mr-1"></i> {item.user}</span>
                                            <span><i className="fas fa-list-check mr-1"></i> {item.parsedItems.length} items</span>
                                        </div>
                                     </div>
                                 );
                             })}
                         </div>
                     )}
                  </div>

                  {/* Main Detail View */}
                  <div className="w-2/3 p-6 overflow-y-auto bg-white">
                      {selectedBackup ? (
                          <div className="space-y-6">
                              <div className="flex justify-between items-start bg-slate-50 p-4 rounded-xl border border-slate-200">
                                  <div>
                                     <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Archive ID</div>
                                     <div className="text-sm font-mono text-slate-600">{selectedBackup.id}</div>
                                  </div>
                                  <div className="text-right">
                                     <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Captured At</div>
                                     <div className="text-sm font-mono text-slate-600">{new Date(selectedBackup.timestamp).toLocaleString()}</div>
                                  </div>
                              </div>

                              <div>
                                  <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                                      <i className="fab fa-whatsapp text-green-500 text-lg"></i> Original Raw Input
                                  </h4>
                                  <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 text-sm font-mono whitespace-pre-wrap text-slate-700">
                                      {selectedBackup.rawInput}
                                  </div>
                              </div>

                              <div>
                                  <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                                      <i className="fas fa-robot text-indigo-500"></i> AI Parsed Output
                                  </h4>
                                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 overflow-x-auto shadow-inner">
                                      <pre className="text-xs font-mono text-green-400">
                                          {JSON.stringify(selectedBackup.parsedItems, null, 2)}
                                      </pre>
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div className="h-full flex flex-col items-center justify-center text-slate-300">
                              <i className="fas fa-mouse-pointer text-4xl mb-4"></i>
                              <p>Select an archived item from the list to view details.</p>
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