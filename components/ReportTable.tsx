
import React, { useState, useEffect, useRef } from 'react';
import { DailyReport, DPRItem } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';

interface ReportTableProps {
  report: DailyReport;
  onDeleteItem: (id: string) => void;
  onUpdateItem: (id: string, field: keyof DPRItem, value: string) => void;
  onUpdateRow: (id: string, updates: Partial<DPRItem>) => void;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  onInspectItem: (item: DPRItem) => void;
  hierarchy: Record<string, string[]>;
}

export const ReportTable: React.FC<ReportTableProps> = ({ report, onDeleteItem, onUpdateItem, onUpdateRow, onUndo, canUndo, onRedo, canRedo, onInspectItem, hierarchy }) => {
  const [zoom, setZoom] = useState(100);
  const reportRef = useRef<HTMLDivElement>(null);

  const exportToJPG = async () => {
    if (!reportRef.current) return;
    try {
      // Fix: Cast window to any to access html2canvas which is provided as a global script without types
      const canvas = await (window as any).html2canvas(reportRef.current, { scale: 2 });
      const link = document.createElement('a');
      link.download = `DPR_${report.date}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
    } catch (e) {
      alert("Export failed. Ensure data is loaded.");
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in relative pb-20">
      {/* Control Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center no-print">
        <div className="flex gap-2">
          <button onClick={onUndo} disabled={!canUndo} className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-30 transition-all"><i className="fas fa-undo"></i></button>
          <button onClick={onRedo} disabled={!canRedo} className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-30 transition-all"><i className="fas fa-redo"></i></button>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-xl">
            <i className="fas fa-magnifying-glass text-slate-400"></i>
            <input type="range" min="70" max="150" value={zoom} onChange={e => setZoom(parseInt(e.target.value))} className="w-24 accent-indigo-600" />
            <span className="text-xs font-bold text-slate-500 w-8">{zoom}%</span>
          </div>
          <button onClick={exportToJPG} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg flex items-center gap-2 hover:bg-black transition-all">
            <i className="fas fa-image"></i> Export JPG
          </button>
        </div>
      </div>

      <div ref={reportRef} id="printable-report" className="bg-white shadow-2xl p-10 rounded-2xl border border-slate-100 transition-all origin-top" style={{ fontSize: `${zoom}%`, width: '100%', maxWidth: '210mm', margin: '0 auto' }}>
        <div className="border-b-4 border-slate-900 pb-6 mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-5xl text-slate-900 font-black uppercase tracking-tighter">Daily Progress Report</h1>
            <p className="text-slate-500 font-bold mt-1 uppercase tracking-widest">{report.projectTitle}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-slate-900">{report.date}</div>
            <div className="text-slate-500 italic font-medium">{getNepaliDate(report.date)}</div>
          </div>
        </div>

        <table className="w-full border-collapse border-2 border-slate-900 text-xs">
          <thead>
            <tr className="bg-slate-900 text-white uppercase tracking-wider">
              <th className="border border-slate-700 p-3 w-[15%] text-left font-black">Location</th>
              <th className="border border-slate-700 p-3 w-[18%] text-left font-black">Component</th>
              <th className="border border-slate-700 p-3 w-[15%] text-left font-black">Area / CH</th>
              <th className="border border-slate-700 p-3 w-[30%] text-left font-black">Activity Description</th>
              <th className="border border-slate-700 p-3 w-[10%] text-center font-black">Qty</th>
              <th className="border border-slate-700 p-3 w-[12%] text-left font-black">Next Plan</th>
            </tr>
          </thead>
          <tbody>
            {report.entries.length === 0 ? (
              <tr><td colSpan={6} className="p-20 text-center italic text-slate-300">No records found for this date.</td></tr>
            ) : report.entries.map((item) => (
              <tr key={item.id} onClick={() => onInspectItem(item)} className="group border-b border-slate-900 hover:bg-indigo-50/50 cursor-pointer align-top">
                <td className="border-r border-slate-900 p-2 font-bold text-slate-900">{item.location}</td>
                <td className="border-r border-slate-900 p-2 font-medium text-slate-600">{item.component}</td>
                <td className="border-r border-slate-900 p-2 font-mono text-slate-500">{item.chainageOrArea}</td>
                <td className="border-r border-slate-900 p-2">
                  <div className="font-medium text-slate-800 leading-snug">{item.activityDescription}</div>
                </td>
                <td className="border-r border-slate-900 p-2 text-center">
                  {item.quantity > 0 && (
                    <div className="flex flex-col">
                      <span className="font-black text-slate-900">{item.quantity}</span>
                      <span className="text-[10px] text-indigo-600 font-bold uppercase">{item.unit}</span>
                    </div>
                  )}
                </td>
                <td className="p-2 text-slate-400 italic leading-tight">{item.plannedNextActivity}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-12 flex justify-between items-start border-t-2 border-slate-100 pt-8">
           <div className="text-[10px] text-slate-400 font-bold uppercase max-w-md">
             Confidential Site Document. This report is generated automatically by the AI Data Pipeline. Total unique activities: {report.entries.length}
           </div>
           <div className="flex gap-20">
              <div className="text-center">
                <div className="h-10"></div>
                <div className="w-40 border-t border-slate-900 pt-1 font-bold uppercase text-[10px]">Site Engineer</div>
              </div>
              <div className="text-center">
                <div className="h-10"></div>
                <div className="w-40 border-t border-slate-900 pt-1 font-bold uppercase text-[10px]">Project Manager</div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
