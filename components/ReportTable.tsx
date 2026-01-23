
import React, { useState, useRef } from 'react';
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

export const ReportTable: React.FC<ReportTableProps> = ({ report, onUndo, canUndo, onRedo, canRedo, onInspectItem }) => {
  const [zoom, setZoom] = useState(100);
  const reportRef = useRef<HTMLDivElement>(null);

  const exportToJPG = async () => {
    if (!reportRef.current) return;
    try {
      const canvas = await (window as any).html2canvas(reportRef.current, { scale: 2 });
      const link = document.createElement('a');
      link.download = `DPR_${report.date}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
    } catch (e) {
      alert("Export failed.");
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
            <input type="range" min="50" max="200" value={zoom} onChange={e => setZoom(parseInt(e.target.value))} className="w-24 accent-indigo-600" />
            <span className="text-xs font-bold text-slate-500 w-8">{zoom}%</span>
          </div>
          <button onClick={exportToJPG} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg flex items-center gap-2 hover:bg-black transition-all">
            <i className="fas fa-image"></i> Export JPG
          </button>
        </div>
      </div>

      <div ref={reportRef} id="printable-report" className="bg-white shadow-2xl p-10 rounded-2xl border border-slate-100 transition-all origin-top mx-auto" style={{ transform: `scale(${zoom / 100})`, width: '100%', maxWidth: '210mm', marginBottom: `${(zoom - 100) * 5}px` }}>
        <div className="border-b-4 border-slate-900 pb-6 mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-4xl text-slate-900 font-black uppercase tracking-tighter">Daily Progress Report</h1>
            <div className="mt-2">
                <p className="text-indigo-600 font-black text-sm uppercase tracking-widest">{report.projectTitle}</p>
                <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.2em]">{report.companyName || "Construction Management"}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-slate-900">{report.date}</div>
            <div className="text-slate-500 italic font-medium">{getNepaliDate(report.date)}</div>
          </div>
        </div>

        <table className="w-full border-collapse border-2 border-slate-900 text-xs">
          <thead>
            <tr className="bg-white text-slate-900 uppercase tracking-wider border-b-2 border-slate-900">
              <th className="border-r border-slate-900 p-3 w-[15%] text-left font-black">Location</th>
              <th className="border-r border-slate-900 p-3 w-[18%] text-left font-black">Component</th>
              <th className="border-r border-slate-900 p-3 w-[15%] text-left font-black">Area / CH</th>
              <th className="border-r border-slate-900 p-3 w-[40%] text-left font-black">Activity Description</th>
              <th className="p-3 w-[12%] text-left font-black">Next Plan</th>
            </tr>
          </thead>
          <tbody>
            {report.entries.length === 0 ? (
              <tr><td colSpan={5} className="p-20 text-center italic text-slate-300">No records found for this date.</td></tr>
            ) : report.entries.map((item) => (
              <tr key={item.id} onClick={() => onInspectItem(item)} className="group border-b border-slate-900 hover:bg-indigo-50/50 cursor-pointer align-top">
                <td className="border-r border-slate-900 p-2 font-bold text-slate-900">{item.location}</td>
                <td className="border-r border-slate-900 p-2 font-medium text-slate-600">{item.component}</td>
                <td className="border-r border-slate-900 p-2 font-mono text-slate-500">{item.chainageOrArea}</td>
                <td className="border-r border-slate-900 p-2">
                  <div className="font-medium text-slate-800 leading-snug">
                    {item.activityDescription}
                    {item.quantity > 0 && <span className="ml-2 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 font-black rounded border border-indigo-100">{item.quantity} {item.unit}</span>}
                  </div>
                </td>
                <td className="p-2 text-slate-400 italic leading-tight">{item.plannedNextActivity}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-8 flex justify-between items-center text-[9px] text-slate-400 font-bold uppercase tracking-wider">
           <div>Total unique activities: {report.entries.length}</div>
           <div className="flex items-center gap-2">
              <i className="fas fa-sync-alt"></i> Auto-synced with Master Records
           </div>
        </div>
      </div>
    </div>
  );
};
