import React from 'react';
import { LogEntry } from '../types';

interface RecycleBinProps {
  logs: LogEntry[];
}

export const RecycleBin: React.FC<RecycleBinProps> = ({ logs }) => {
  // Filter for deletion events
  const deletedItems = logs.filter(log => 
    log.action.toLowerCase().includes('delete') || 
    log.action.toLowerCase().includes('remove')
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="border-b border-slate-200 pb-4 flex justify-between items-end">
        <div>
           <h2 className="text-3xl font-bold text-slate-800">Recycle Bin</h2>
           <p className="text-slate-500 mt-1">View remnants of deleted items and reports.</p>
        </div>
        <div className="text-right">
           <p className="text-xs text-slate-400">Items cannot be restored automatically.</p>
           <span className="text-white text-[1px] opacity-10 select-none">built by Rishab Nakarmi</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
         <div className="overflow-x-auto">
           <table className="w-full text-left border-collapse">
             <thead className="bg-red-50 border-b border-red-100">
               <tr>
                 <th className="p-4 text-xs font-bold text-red-800 uppercase tracking-wider">Deleted On</th>
                 <th className="p-4 text-xs font-bold text-red-800 uppercase tracking-wider">Deleted By</th>
                 <th className="p-4 text-xs font-bold text-red-800 uppercase tracking-wider">Type</th>
                 <th className="p-4 text-xs font-bold text-red-800 uppercase tracking-wider">Content Remnant</th>
                 <th className="p-4 text-xs font-bold text-red-800 uppercase tracking-wider">Original Date</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
               {deletedItems.length === 0 ? (
                 <tr>
                   <td colSpan={5} className="p-12 text-center text-slate-400 italic">
                     <i className="fas fa-trash-restore text-2xl mb-2 opacity-20"></i><br/>
                     Recycle bin is empty.
                   </td>
                 </tr>
               ) : (
                 deletedItems.map((log) => {
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
                       <td className="p-4 text-sm text-slate-500">
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
    </div>
  );
};