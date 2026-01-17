import React, { useState } from 'react';
import { LogEntry, TrashItem, DPRItem, DailyReport, QuantityEntry } from '../types';

interface RecycleBinProps {
  logs: LogEntry[];
  trashItems: TrashItem[];
  onRestore: (item: TrashItem) => void;
}

export const RecycleBin: React.FC<RecycleBinProps> = ({ logs, trashItems, onRestore }) => {
  const [activeTab, setActiveTab] = useState<'recoverable' | 'logs'>('recoverable');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [viewDetailsItem, setViewDetailsItem] = useState<TrashItem | null>(null);

  // Filter for deletion events for the log view
  const deletedLogs = logs.filter(log => 
    log.action.toLowerCase().includes('delete') || 
    log.action.toLowerCase().includes('remove')
  );

  const handleRestoreClick = async (item: TrashItem) => {
    if(window.confirm(`Restore this ${item.type}?`)) {
       setRestoringId(item.trashId);
       try {
         await onRestore(item);
       } catch (e) {
         alert("Failed to restore item.");
       } finally {
         setRestoringId(null);
       }
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in relative">
      <div className="border-b border-slate-200 pb-4 flex justify-between items-end">
        <div>
           <h2 className="text-3xl font-bold text-slate-800">Recycle Bin</h2>
           <p className="text-slate-500 mt-1">Manage deleted items and view deletion history.</p>
        </div>
        <div className="text-right">
           <span className="text-white text-[1px] opacity-10 select-none">built by Rishab Nakarmi</span>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('recoverable')}
          className={`pb-3 px-4 text-sm font-bold transition-colors border-b-2 ${
            activeTab === 'recoverable' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <i className="fas fa-undo-alt mr-2"></i> Recoverable Items
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 px-4 text-sm font-bold transition-colors border-b-2 ${
            activeTab === 'logs' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <i className="fas fa-history mr-2"></i> Deletion Logs
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden min-h-[400px]">
         
         {activeTab === 'recoverable' && (
           <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse">
               <thead className="bg-slate-50 border-b border-slate-200">
                 <tr>
                   <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Deleted Date</th>
                   <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Type</th>
                   <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Content Summary</th>
                   <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Deleted By</th>
                   <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                 {trashItems.length === 0 ? (
                   <tr>
                     <td colSpan={5} className="p-12 text-center text-slate-400 italic">
                       <i className="fas fa-check-circle text-4xl mb-3 text-green-100 block"></i>
                       No deleted items found. <br/>
                       <span className="text-xs">Items deleted before this update may only appear in Logs.</span>
                     </td>
                   </tr>
                 ) : (
                   trashItems.map((item) => {
                     const date = new Date(item.deletedAt);
                     let summary = "";
                     if (item.type === 'report') {
                        summary = `Full Report for ${(item.content as DailyReport).date}`;
                     } else if (item.type === 'quantity') {
                        const qty = item.content as QuantityEntry;
                        summary = `QTY: ${qty.location} (${qty.quantityValue} ${qty.quantityUnit})`;
                     } else {
                        const dpr = item.content as DPRItem;
                        summary = `${dpr.location} - ${dpr.activityDescription.substring(0, 30)}...`;
                     }

                     return (
                       <tr key={item.trashId} className="hover:bg-slate-50/50 transition-colors">
                         <td className="p-4 text-sm text-slate-500 whitespace-nowrap">
                           {date.toLocaleDateString()} <span className="text-slate-400 text-xs">{date.toLocaleTimeString()}</span>
                         </td>
                         <td className="p-4">
                           <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${
                             item.type === 'report' ? 'bg-purple-100 text-purple-700' : 
                             item.type === 'quantity' ? 'bg-green-100 text-green-700' :
                             'bg-blue-100 text-blue-700'
                           }`}>
                             {item.type}
                           </span>
                         </td>
                         <td className="p-4 text-sm text-slate-700 font-medium cursor-pointer hover:text-indigo-600" onClick={() => setViewDetailsItem(item)}>
                           {summary}
                           <i className="fas fa-eye ml-2 text-slate-300 text-xs"></i>
                         </td>
                         <td className="p-4 text-sm text-slate-500">
                           {item.deletedBy}
                         </td>
                         <td className="p-4 text-right">
                           <button
                             onClick={() => handleRestoreClick(item)}
                             disabled={restoringId === item.trashId}
                             className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ml-auto disabled:opacity-50"
                           >
                             {restoringId === item.trashId ? (
                               <i className="fas fa-circle-notch fa-spin"></i>
                             ) : (
                               <i className="fas fa-trash-arrow-up"></i>
                             )}
                             Restore
                           </button>
                         </td>
                       </tr>
                     );
                   })
                 )}
               </tbody>
             </table>
           </div>
         )}

         {activeTab === 'logs' && (
           <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse">
               <thead className="bg-red-50 border-b border-red-100">
                 <tr>
                   <th className="p-4 text-xs font-bold text-red-800 uppercase tracking-wider">Log Time</th>
                   <th className="p-4 text-xs font-bold text-red-800 uppercase tracking-wider">User</th>
                   <th className="p-4 text-xs font-bold text-red-800 uppercase tracking-wider">Action</th>
                   <th className="p-4 text-xs font-bold text-red-800 uppercase tracking-wider">Details</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                 {deletedLogs.length === 0 ? (
                   <tr>
                     <td colSpan={4} className="p-12 text-center text-slate-400 italic">
                       No deletion history log found.
                     </td>
                   </tr>
                 ) : (
                   deletedLogs.map((log) => {
                     const date = new Date(log.timestamp);
                     return (
                       <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                         <td className="p-4 text-sm text-slate-500 whitespace-nowrap">
                           {date.toLocaleDateString()} <span className="text-slate-400 text-xs ml-1">{date.toLocaleTimeString()}</span>
                         </td>
                         <td className="p-4 text-sm font-medium text-slate-700">
                           {log.user}
                         </td>
                         <td className="p-4 text-xs font-bold text-red-500 uppercase">
                           {log.action}
                         </td>
                         <td className="p-4 text-sm text-slate-600 max-w-xs truncate font-mono bg-slate-50 rounded" title={log.details}>
                           {log.details}
                         </td>
                       </tr>
                     );
                   })
                 )}
               </tbody>
             </table>
           </div>
         )}
      </div>

      {/* Detail View Modal */}
      {viewDetailsItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 relative flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                 <h3 className="text-lg font-bold text-slate-800">Deleted Item Details</h3>
                 <button onClick={() => setViewDetailsItem(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                    <i className="fas fa-times text-slate-500"></i>
                 </button>
              </div>
              <div className="bg-slate-900 rounded-lg p-4 overflow-auto flex-1 border border-slate-700 shadow-inner">
                  <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap">
                      {JSON.stringify(viewDetailsItem.content, null, 2)}
                  </pre>
              </div>
              <div className="mt-4 pt-2 border-t border-slate-100 text-xs text-slate-400 flex justify-between">
                 <span>Deleted by: {viewDetailsItem.deletedBy}</span>
                 <span>ID: {viewDetailsItem.originalId}</span>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};