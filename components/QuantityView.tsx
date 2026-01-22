
import React, { useMemo } from 'react';
import { DailyReport, DPRItem } from '../types';
import { ITEM_PATTERNS } from '../utils/constants';

interface QuantityViewProps {
  reports: DailyReport[];
  user?: any;
  onInspectItem?: (item: DPRItem) => void;
}

export const QuantityView: React.FC<QuantityViewProps> = ({ reports, onInspectItem }) => {
  // Derive quantities directly from reports (SSOT)
  const quantities = useMemo(() => {
      const allItems: DPRItem[] = [];
      reports.forEach(r => {
          r.entries.forEach(e => {
              if (e.quantity > 0 || e.itemType !== 'Other') {
                  allItems.push({ ...e, date: r.date } as any); // Inject date for display
              }
          });
      });
      return allItems.sort((a,b) => new Date((b as any).date).getTime() - new Date((a as any).date).getTime());
  }, [reports]);

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
         <h2 className="text-2xl font-bold text-slate-800">Quantity Ledger</h2>
         <p className="text-slate-500 text-sm">Derived directly from Master Records.</p>
      </div>

      <div className="bg-white rounded-2xl shadow border border-slate-200 flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-slate-100 sticky top-0 z-10">
            <tr>
                <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b">Date</th>
                <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b">Location</th>
                <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b">Activity</th>
                <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b">Item Type</th>
                <th className="p-3 text-xs font-bold text-right uppercase border-b">Qty</th>
                <th className="p-3 text-xs font-bold uppercase border-b">Unit</th>
                <th className="p-3 text-xs font-bold uppercase border-b text-center">Action</th>
            </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
            {quantities.map((item) => (
                <tr key={item.id} className="hover:bg-indigo-50/30 group">
                    <td className="p-3 text-slate-500 whitespace-nowrap">{(item as any).date}</td>
                    <td className="p-3 font-medium text-slate-800">{item.location}</td>
                    <td className="p-3 text-slate-700 max-w-xs truncate">{item.activityDescription}</td>
                    <td className="p-3"><span className="bg-slate-100 px-2 py-1 rounded text-xs">{item.itemType}</span></td>
                    <td className="p-3 text-right font-bold text-indigo-600">{item.quantity}</td>
                    <td className="p-3 text-slate-500">{item.unit}</td>
                    <td className="p-3 text-center">
                        <button 
                            onClick={() => onInspectItem && onInspectItem(item)} 
                            className="text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                        >
                            <i className="fas fa-edit"></i> Edit
                        </button>
                    </td>
                </tr>
            ))}
            </tbody>
        </table>
      </div>
    </div>
  );
};
