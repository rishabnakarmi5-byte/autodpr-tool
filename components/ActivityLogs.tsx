import React, { useState } from 'react';
import { LogEntry } from '../types';

interface ActivityLogsProps {
  logs: LogEntry[];
}

export const ActivityLogs: React.FC<ActivityLogsProps> = ({ logs }) => {
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

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

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-3xl font-bold text-slate-800">Activity Logs</h2>
        <p className="text-slate-500 mt-1">Audit trail of all changes made by users across the system.</p>
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
    </div>
  );
};