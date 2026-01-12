import React from 'react';
import { DailyReport } from '../types';

interface HistoryListProps {
  reports: DailyReport[];
  currentReportId: string;
  onSelectReport: (id: string) => void;
  onDeleteReport: (id: string) => void;
  onCreateNew: () => void;
}

export const HistoryList: React.FC<HistoryListProps> = ({ 
  reports, 
  currentReportId, 
  onSelectReport, 
  onDeleteReport,
  onCreateNew
}) => {
  const sortedReports = [...reports].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-end md:items-center pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Report Archive</h2>
          <p className="text-slate-500 mt-1">Manage and access all previous daily progress reports.</p>
        </div>
        <button 
          onClick={onCreateNew}
          className="mt-4 md:mt-0 bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-xl shadow-lg shadow-slate-400/20 flex items-center font-medium transition-transform hover:-translate-y-0.5"
        >
          <i className="fas fa-plus mr-2"></i> Create New
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedReports.map(report => {
           const date = new Date(report.date);
           const day = date.getDate();
           const month = date.toLocaleDateString('en-US', { month: 'short' });
           const year = date.getFullYear();

           // Calculate unique users
           const uniqueUsers = new Set(report.entries.map(e => e.createdBy || 'Unknown'));

           return (
            <div 
              key={report.id}
              onClick={() => onSelectReport(report.id)}
              className={`group cursor-pointer p-0 rounded-2xl border transition-all duration-300 relative overflow-hidden flex flex-col
                ${report.id === currentReportId 
                  ? 'bg-white border-indigo-500 ring-2 ring-indigo-100 shadow-xl shadow-indigo-100' 
                  : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-xl hover:shadow-slate-200/50'
                }`}
            >
              {/* Card Header Color Bar */}
              <div className={`h-2 w-full ${report.id === currentReportId ? 'bg-indigo-500' : 'bg-slate-200 group-hover:bg-indigo-300'}`}></div>
              
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start mb-4">
                   <div className="flex items-center gap-3">
                      <div className="bg-slate-100 rounded-lg p-2 text-center min-w-[3.5rem]">
                        <span className="block text-xs font-bold text-slate-500 uppercase">{month}</span>
                        <span className="block text-xl font-bold text-slate-800 leading-none">{day}</span>
                        <span className="block text-[10px] text-slate-400">{year}</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">Daily Report</h3>
                        <p className="text-xs text-slate-400">{new Date(report.lastUpdated).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      </div>
                   </div>
                   
                   {report.id === currentReportId && (
                     <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-full">ACTIVE</span>
                   )}
                </div>

                <div className="space-y-3">
                   <div className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 p-2 rounded">
                     <span>Entries</span>
                     <span className="font-bold">{report.entries.length}</span>
                   </div>
                   <div className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 p-2 rounded">
                     <span>Contributors</span>
                     <span className="font-bold text-indigo-600">{uniqueUsers.size}</span>
                   </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if(window.confirm('Are you sure you want to delete this report permanently?')) {
                      onDeleteReport(report.id);
                    }
                  }}
                  className="flex items-center px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete Report"
                >
                  <i className="fas fa-trash-alt mr-2"></i> Delete
                </button>
                 <button
                  className="flex items-center px-3 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Edit Report"
                >
                  Edit <i className="fas fa-arrow-right ml-2"></i>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};