import React from 'react';
import { DailyReport, DPRItem } from '../types';

interface ReportTableProps {
  report: DailyReport;
  onDeleteItem: (id: string) => void;
  onUpdateItem: (id: string, field: keyof DPRItem, value: string) => void;
}

export const ReportTable: React.FC<ReportTableProps> = ({ report, onDeleteItem, onUpdateItem }) => {
  
  const handlePrint = () => {
    window.print();
  };

  const sortedEntries = [...report.entries].sort((a, b) => a.location.localeCompare(b.location));

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in">
      
      {/* Action Bar */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 gap-4">
        <div>
           <h2 className="text-xl font-bold text-slate-800">Final Report</h2>
           <p className="text-sm text-slate-500 mt-1">
             <i className="fas fa-info-circle mr-1 text-indigo-500"></i>
             Click on any text below to edit before printing.
           </p>
        </div>
        <button 
          onClick={handlePrint}
          className="w-full md:w-auto flex items-center justify-center px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-black transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
        >
          <i className="fas fa-print mr-2"></i> Print / Save as PDF
        </button>
      </div>

      {/* Printable Area Wrapper */}
      <div className="overflow-auto bg-slate-200/50 p-4 md:p-8 rounded-2xl border border-slate-200">
        
        {/* Actual Paper Sheet */}
        <div 
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
                      onChange={(e) => onUpdateItem(item.id, 'location', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none border border-transparent focus:border-indigo-300 focus:bg-indigo-50/20 rounded px-1 transition-all"
                      rows={Math.max(2, Math.ceil(item.location.length / 15))}
                    />
                  </div>

                  <div className="col-span-2 p-2 relative">
                     <textarea
                      value={item.chainageOrArea}
                      onChange={(e) => onUpdateItem(item.id, 'chainageOrArea', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none border border-transparent focus:border-indigo-300 focus:bg-indigo-50/20 rounded px-1 transition-all"
                      rows={Math.max(2, Math.ceil(item.chainageOrArea.length / 15))}
                    />
                  </div>

                  <div className="col-span-5 p-2 relative">
                     <textarea
                      value={item.activityDescription}
                      onChange={(e) => onUpdateItem(item.id, 'activityDescription', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none border border-transparent focus:border-indigo-300 focus:bg-indigo-50/20 rounded px-1 whitespace-pre-wrap transition-all"
                      rows={Math.max(3, Math.ceil(item.activityDescription.length / 40))}
                    />
                  </div>

                  <div className="col-span-3 p-2 relative group-hover:bg-blue-50/10">
                     <textarea
                      value={item.plannedNextActivity}
                      onChange={(e) => onUpdateItem(item.id, 'plannedNextActivity', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none border border-transparent focus:border-indigo-300 focus:bg-indigo-50/20 rounded px-1 transition-all"
                      rows={Math.max(2, Math.ceil(item.plannedNextActivity.length / 20))}
                    />
                    
                    <button 
                      onClick={() => onDeleteItem(item.id)}
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