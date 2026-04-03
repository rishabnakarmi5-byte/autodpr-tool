
import React, { useState, useRef } from 'react';
import { Reorder } from 'motion/react';
import { DailyReport, DPRItem } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';
import { RawInputsModal } from './RawInputsModal';

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
  onUpdateNote: (note: string) => void;
  onAddManualItem: () => void;
  onReorderEntries: (newEntries: DPRItem[]) => void;
}

export const ReportTable: React.FC<ReportTableProps> = ({ report, onUndo, canUndo, onRedo, canRedo, onInspectItem, onUpdateNote, onAddManualItem, onReorderEntries }) => {
  const [fontSize, setFontSize] = useState(12);
  const [showRawInputs, setShowRawInputs] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isRearranging, setIsRearranging] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const exportToJPG = async () => {
    if (!reportRef.current) return;
    try {
      const canvas = await (window as any).html2canvas(reportRef.current, { 
        scale: 3, // Higher scale for better quality
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#f8fafc', // Match slate-50 background
        logging: false,
        scrollX: 0,
        scrollY: -window.scrollY, // Fix for cropping when scrolled
        onclone: (clonedDoc: Document) => {
          // Ensure no-print elements are hidden in the clone
          const noPrintElements = clonedDoc.querySelectorAll('.no-print');
          noPrintElements.forEach((el: any) => el.style.display = 'none');
          
          // Remove rearrange padding from the cloned element
          const reportContainer = clonedDoc.querySelector('.mx-auto.w-full.max-w-\\[210mm\\]');
          if (reportContainer) {
            (reportContainer as HTMLElement).style.paddingLeft = '0';
          }
        }
      });
      const link = document.createElement('a');
      link.download = `DPR_${report.date}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch (e) {
      console.error("Export error:", e);
      alert("Export failed. Please try again.");
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in relative pb-20">
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 no-print">
        <div className="flex gap-2 w-full md:w-auto justify-between md:justify-start">
          <div className="flex gap-2">
            <button onClick={onUndo} disabled={!canUndo} className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-30 transition-all"><i className="fas fa-undo"></i></button>
            <button onClick={onRedo} disabled={!canRedo} className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-30 transition-all"><i className="fas fa-redo"></i></button>
          </div>
          <button onClick={() => setShowRawInputs(true)} className="md:hidden text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-2">
             <i className="fas fa-terminal"></i> Raw Inputs
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center md:justify-end gap-3 md:gap-6 w-full md:w-auto">
          <button onClick={() => setShowRawInputs(true)} className="hidden md:flex text-sm font-bold text-indigo-600 hover:text-indigo-800 items-center gap-2">
             <i className="fas fa-terminal"></i> Check Raw Inputs
          </button>
          <div className="hidden sm:flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-xl">
            <i className="fas fa-text-height text-slate-400"></i>
            <input type="range" min="8" max="18" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className="w-24 accent-indigo-600" />
            <span className="text-xs font-bold text-slate-500 w-8">{fontSize}px</span>
          </div>
          <button onClick={() => setIsRearranging(!isRearranging)} className={`p-2.5 rounded-xl transition-all flex items-center gap-2 font-bold text-xs ${isRearranging ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            <i className={`fas ${isRearranging ? 'fa-check' : 'fa-up-down-left-right'}`}></i> 
            {isRearranging ? 'Done Rearranging' : 'Drag to Reorder'}
          </button>
          <button onClick={onAddManualItem} className="flex-1 md:flex-none bg-indigo-50 text-indigo-600 px-4 py-2.5 rounded-xl font-bold border border-indigo-100 flex items-center justify-center gap-2 hover:bg-indigo-100 transition-all text-sm">
            <i className="fas fa-plus"></i> Manual Entry
          </button>
          <button onClick={exportToJPG} className="flex-1 md:flex-none bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-black transition-all text-sm">
            <i className="fas fa-image"></i> Export JPG
          </button>
        </div>
      </div>

      <div ref={reportRef} className={`mx-auto w-full max-w-[210mm] space-y-6 ${isRearranging ? 'pl-12' : ''}`}>
        <div id="printable-report" className="bg-white shadow-2xl p-10 rounded-2xl border border-slate-100 transition-all origin-top" style={{ width: '100%' }}>
        <div className="border-b-4 border-slate-900 pb-6 mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-4xl text-slate-900 font-black uppercase tracking-tighter">Daily Progress Report</h1>
            <div className="mt-2">
                <p className="text-indigo-600 font-black text-sm uppercase tracking-widest">{report.projectTitle}</p>
                <p className="text-black font-bold text-xs uppercase tracking-[0.2em]">{report.companyName || "Construction Management"}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-slate-900">{report.date}</div>
            <div className="text-black font-medium">{getNepaliDate(report.date)}</div>
          </div>
        </div>

        <table className="w-full border-collapse border-2 border-slate-900" style={{ fontSize: `${fontSize}px` }}>
          <thead>
            <tr className="bg-white text-slate-900 uppercase tracking-wider border-b-2 border-slate-900">
              <th className="border-r border-slate-900 p-3 w-[15%] text-left font-black">Location</th>
              <th className="border-r border-slate-900 p-3 w-[18%] text-left font-black">Component</th>
              <th className="border-r border-slate-900 p-3 w-[15%] text-left font-black">Area / CH</th>
              <th className="border-r border-slate-900 p-3 w-[40%] text-left font-black">Activity Description</th>
              <th className="p-3 w-[12%] text-left font-black">Next Plan</th>
            </tr>
          </thead>
          <Reorder.Group 
            as="tbody" 
            axis="y" 
            values={report.entries} 
            onReorder={onReorderEntries}
          >
            {report.entries.length === 0 ? (
              <tr><td colSpan={5} className="p-20 text-center italic text-slate-300">No records found for this date.</td></tr>
            ) : report.entries.map((item) => (
              <Reorder.Item 
                as="tr" 
                key={item.id} 
                value={item}
                dragListener={isRearranging}
                onClick={() => !isRearranging && onInspectItem({ ...item, date: report.date })} 
                className={`group border-b border-slate-900 hover:bg-indigo-50/50 cursor-pointer align-top text-black ${isRearranging ? 'bg-indigo-50/20 select-none' : ''}`}
              >
                <td className="border-r border-slate-900 p-2 font-bold relative">
                  {isRearranging && (
                    <div className="absolute -left-10 top-1/2 -translate-y-1/2 flex items-center justify-center no-print z-10">
                      <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing">
                        <i className="fas fa-grip-vertical"></i>
                      </div>
                    </div>
                  )}
                  <span className={isRearranging ? 'ml-2' : ''}>{item.location}</span>
                </td>
                <td className="border-r border-slate-900 p-2 font-medium">{item.component}</td>
                <td className="border-r border-slate-900 p-2 font-mono">{item.chainageOrArea}</td>
                <td className="border-r border-slate-900 p-2">
                  <div className="font-medium leading-snug">
                    {item.activityDescription}
                  </div>
                </td>
                <td className="p-2 leading-tight">{item.plannedNextActivity}</td>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </table>
        
        <div className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm w-full mt-6 ${!report.note ? 'no-print' : ''}`}>
          <div className="flex justify-between items-center mb-3">
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Daily Report Note</label>
            <button 
              onClick={() => setIsEditingNote(!isEditingNote)}
              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-widest no-print"
              data-html2canvas-ignore="true"
            >
              {isEditingNote ? 'Save Note' : 'Edit Note'}
            </button>
          </div>
          {isEditingNote ? (
            <textarea 
                value={report.note || ""}
                onChange={e => onUpdateNote(e.target.value)}
                placeholder="Enter 2-3 lines of note for this DPR..."
                className="w-full min-h-24 p-5 bg-slate-50 rounded-xl border border-slate-200 outline-none text-sm font-medium transition-all placeholder:text-slate-300 resize-none"
            />
          ) : (
            <div className="w-full p-5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 whitespace-pre-wrap">
              {report.note || "No notes for this report."}
            </div>
          )}
        </div>
      </div>
      </div>

      <RawInputsModal 
        date={report.date} 
        isOpen={showRawInputs} 
        onClose={() => setShowRawInputs(false)} 
      />
    </div>
  );
};
