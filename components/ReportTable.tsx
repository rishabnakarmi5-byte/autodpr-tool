import React, { useState, useEffect, useRef } from 'react';
import { DailyReport, DPRItem } from '../types';

interface ReportTableProps {
  report: DailyReport;
  onDeleteItem: (id: string) => void;
  onUpdateItem: (id: string, field: keyof DPRItem, value: string) => void;
}

export const ReportTable: React.FC<ReportTableProps> = ({ report, onDeleteItem, onUpdateItem }) => {
  
  const [entries, setEntries] = useState<DPRItem[]>(report.entries);
  const [fontSize, setFontSize] = useState<number>(12); // Default font size 12px
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setEntries(report.entries);
  }, [report.entries]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportJpeg = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);

    try {
      // @ts-ignore - html2canvas is loaded via CDN in index.html
      const canvas = await window.html2canvas(reportRef.current, {
        scale: 3, // High resolution (3x scale)
        useCORS: true, // Allow loading images if any
        backgroundColor: '#ffffff',
        logging: false
      });

      const image = canvas.toDataURL("image/jpeg", 0.95);
      const link = document.createElement('a');
      link.href = image;
      link.download = `DPR_${report.date}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Export failed", error);
      alert("Failed to export image. Please try using the Print > Save as PDF option instead.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleLocalChange = (id: string, field: keyof DPRItem, value: string) => {
    setEntries(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleBlur = (id: string, field: keyof DPRItem, value: string) => {
    const originalItem = report.entries.find(e => e.id === id);
    if (originalItem && originalItem[field] !== value) {
        onUpdateItem(id, field, value);
    }
  };

  const sortedEntries = [...entries].sort((a, b) => a.location.localeCompare(b.location));

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in">
      
      {/* Action Bar */}
      <div className="flex flex-col xl:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 gap-6">
        <div>
           <h2 className="text-xl font-bold text-slate-800">Final Report</h2>
           <p className="text-sm text-slate-500 mt-1">
             Edits are saved automatically when you click outside the box.
           </p>
        </div>

        {/* Controls */}
        <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto">
          
          {/* Font Size Control */}
          <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 w-full md:w-auto">
             <i className="fas fa-font text-slate-400 text-xs"></i>
             <input 
               type="range" 
               min="10" 
               max="18" 
               step="1"
               value={fontSize}
               onChange={(e) => setFontSize(parseInt(e.target.value))}
               className="w-24 md:w-32 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
             />
             <span className="text-sm font-mono font-bold text-slate-600 w-6">{fontSize}</span>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <button 
              onClick={handleExportJpeg}
              disabled={isExporting}
              className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-indigo-100 text-indigo-700 font-bold rounded-xl hover:bg-indigo-200 transition-all border border-indigo-200"
            >
              {isExporting ? <i className="fas fa-circle-notch fa-spin mr-2"></i> : <i className="fas fa-image mr-2"></i>}
              Save JPEG
            </button>

            <button 
              onClick={handlePrint}
              className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-black transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              <i className="fas fa-print mr-2"></i> Print / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Printable Area Wrapper */}
      <div className="overflow-auto bg-slate-200/50 p-4 md:p-8 rounded-2xl border border-slate-200">
        
        {/* Actual Paper Sheet */}
        <div 
          ref={reportRef}
          id="printable-report" 
          className="bg-white p-[20mm] shadow-2xl mx-auto w-[210mm] min-h-[297mm] text-black origin-top transform scale-100 transition-transform"
          style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
        >
          
          {/* Document Header */}
          <div className="mb-8 border-b-2 border-black pb-4">
            <h1 className="text-3xl font-bold uppercase text-center tracking-wider mb-2">Daily Progress Report</h1>
            <div className="flex justify-between items-end mt-6 text-sm">
              <div className="w-2/3">
                <p className="mb-1"><span className="font-bold">Project:</span> {report.projectTitle}</p>
                <p><span className="font-bold">Contractor:</span> Bhugol Infrastructure Company Pvt. Ltd.</p>
              </div>
              <div className="text-right">
                <p className="text-lg"><span className="font-bold">Date:</span> {report.date}</p>
              </div>
            </div>
          </div>

          <div className="mb-2 font-bold underline text-sm">
            Workfront Status:
          </div>

          {/* Strict Table Structure */}
          <div className="border-2 border-black">
            <div className="grid grid-cols-12 border-b-2 border-black bg-gray-200 divide-x-2 divide-black font-bold text-center text-xs uppercase tracking-wide">
              <div className="col-span-2 p-3 flex items-center justify-center">Location</div>
              <div className="col-span-2 p-3 flex items-center justify-center">Chainage / Area</div>
              <div className="col-span-5 p-3 flex items-center justify-center">Activity Description</div>
              <div className="col-span-3 p-3 flex items-center justify-center">Planned Next Activity</div>
            </div>

            {sortedEntries.length === 0 ? (
               <div className="p-12 text-center text-gray-400 italic">
                 -- No Data Available --
               </div>
            ) : (
              sortedEntries.map((item, index) => (
                <div 
                  key={item.id} 
                  className={`grid grid-cols-12 divide-x divide-black text-xs leading-relaxed group hover:bg-blue-50/10 transition-colors ${index !== sortedEntries.length - 1 ? 'border-b border-black' : ''}`}
                >
                  <div className="col-span-2 p-2 relative">
                    <textarea
                      value={item.location}
                      onChange={(e) => handleLocalChange(item.id, 'location', e.target.value)}
                      onBlur={(e) => handleBlur(item.id, 'location', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none border border-transparent focus:border-indigo-300 focus:bg-indigo-50/20 rounded px-1 transition-all"
                      style={{ fontSize: `${fontSize}px` }}
                      rows={Math.max(2, Math.ceil(item.location.length / 15))}
                    />
                  </div>

                  <div className="col-span-2 p-2 relative">
                     <textarea
                      value={item.chainageOrArea}
                      onChange={(e) => handleLocalChange(item.id, 'chainageOrArea', e.target.value)}
                      onBlur={(e) => handleBlur(item.id, 'chainageOrArea', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none border border-transparent focus:border-indigo-300 focus:bg-indigo-50/20 rounded px-1 transition-all"
                      style={{ fontSize: `${fontSize}px` }}
                      rows={Math.max(2, Math.ceil(item.chainageOrArea.length / 15))}
                    />
                  </div>

                  <div className="col-span-5 p-2 relative">
                     <textarea
                      value={item.activityDescription}
                      onChange={(e) => handleLocalChange(item.id, 'activityDescription', e.target.value)}
                      onBlur={(e) => handleBlur(item.id, 'activityDescription', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none border border-transparent focus:border-indigo-300 focus:bg-indigo-50/20 rounded px-1 whitespace-pre-wrap transition-all"
                      style={{ fontSize: `${fontSize}px` }}
                      rows={Math.max(3, Math.ceil(item.activityDescription.length / 40))}
                    />
                  </div>

                  <div className="col-span-3 p-2 relative group-hover:bg-blue-50/10">
                     <textarea
                      value={item.plannedNextActivity}
                      onChange={(e) => handleLocalChange(item.id, 'plannedNextActivity', e.target.value)}
                      onBlur={(e) => handleBlur(item.id, 'plannedNextActivity', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none border border-transparent focus:border-indigo-300 focus:bg-indigo-50/20 rounded px-1 transition-all"
                      style={{ fontSize: `${fontSize}px` }}
                      rows={Math.max(2, Math.ceil(item.plannedNextActivity.length / 20))}
                    />
                    
                    <button 
                      onClick={() => onDeleteItem(item.id)}
                      data-html2canvas-ignore="true" 
                      className="no-print absolute top-1 right-1 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all bg-white rounded-full w-5 h-5 flex items-center justify-center shadow-sm border border-slate-100"
                      title="Delete Row"
                    >
                      <i className="fas fa-times text-[10px]"></i>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
};