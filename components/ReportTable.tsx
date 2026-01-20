
import React, { useState, useEffect } from 'react';
import { DailyReport, DPRItem } from '../types';

interface ReportTableProps {
  report: DailyReport;
  onDeleteItem: (id: string) => void;
  onUpdateItem: (id: string, field: keyof DPRItem, value: string) => void;
  onUndo?: () => void;
  canUndo?: boolean;
}

export const ReportTable: React.FC<ReportTableProps> = ({ report, onDeleteItem, onUpdateItem, onUndo, canUndo }) => {
  const [isLandscape, setIsLandscape] = useState(false);
  const [fontSize, setFontSize] = useState(12);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 flex flex-wrap justify-between items-center gap-4 no-print">
         <div><h2 className="text-xl font-bold">Report Preview</h2></div>
         <div className="flex items-center gap-4">
            <button onClick={() => setIsLandscape(!isLandscape)} className="text-xs font-bold px-4 py-2 bg-slate-100 rounded-lg hover:bg-slate-200 flex items-center gap-2">
               <i className={`fas ${isLandscape ? 'fa-image-portrait' : 'fa-image'}`}></i>
               Switch to {isLandscape ? 'Portrait' : 'Landscape'}
            </button>
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border">
               <span className="text-xs text-slate-400 uppercase font-bold">Zoom</span>
               <input type="range" min="8" max="18" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className="w-20" />
            </div>
            <button onClick={() => window.print()} className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all">
               Print / PDF
            </button>
         </div>
      </div>

      <div className={`report-container overflow-auto p-4 md:p-8 flex justify-center`}>
        <div 
          className={`bg-white shadow-2xl p-[15mm] border border-slate-200 ${isLandscape ? 'w-[297mm]' : 'w-[210mm]'}`}
          style={{ fontSize: `${fontSize}px` }}
        >
          <div className="border-b-4 border-black pb-4 mb-6 text-center">
             <h1 className="text-4xl font-black uppercase tracking-widest">{report.projectTitle}</h1>
             <p className="text-sm font-bold mt-2">BHUGOL INFRASTRUCTURE COMPANY PVT. LTD.</p>
             <div className="flex justify-between mt-6 text-sm">
                <span className="font-bold">DAILY PROGRESS REPORT</span>
                <span className="font-bold">DATE: {report.date}</span>
             </div>
          </div>

          <table className="w-full border-collapse border-2 border-black">
             <thead>
                <tr className="bg-slate-100 divide-x-2 divide-black border-b-2 border-black font-bold uppercase text-[10px] text-center">
                   <th className="p-2 w-1/12 border-black">S.N.</th>
                   <th className="p-2 w-2/12 border-black">Location</th>
                   <th className="p-2 w-2/12 border-black">Component</th>
                   <th className="p-2 w-2/12 border-black">Chainage/EL</th>
                   <th className="p-2 w-4/12 border-black">Activity Description</th>
                   <th className="p-2 w-2/12 border-black">Next Plan</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-black">
                {report.entries.map((item, idx) => (
                   <tr key={item.id} className="divide-x divide-black align-top group">
                      <td className="p-2 text-center font-mono">{idx + 1}</td>
                      <td className="p-2 font-bold">{item.location}</td>
                      <td className="p-2">{item.component}</td>
                      <td className="p-2">{item.chainageOrArea}</td>
                      <td className="p-2 whitespace-pre-wrap">{item.activityDescription}</td>
                      <td className="p-2 relative">
                         {item.plannedNextActivity}
                         <div className="no-print absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => onDeleteItem(item.id)} className="bg-red-500 text-white w-6 h-6 rounded flex items-center justify-center text-[10px]"><i className="fas fa-trash"></i></button>
                         </div>
                      </td>
                   </tr>
                ))}
             </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
