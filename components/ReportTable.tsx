
import React, { useState, useEffect } from 'react';
import { DailyReport, DPRItem } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';
import { syncQuantitiesFromItems } from '../services/firebaseService';

interface ReportTableProps {
  report: DailyReport;
  onDeleteItem: (id: string) => void;
  onUpdateItem: (id: string, field: keyof DPRItem, value: string) => void;
  onUpdateAllEntries?: (entries: DPRItem[]) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  onRedo?: () => void;
  canRedo?: boolean;
  onNormalize?: () => void;
  hierarchy: Record<string, string[]>;
}

type PaperSize = 'A4' | 'A3';

export const ReportTable: React.FC<ReportTableProps> = ({ report, onDeleteItem, onUpdateItem, onUpdateAllEntries, onUndo, canUndo, onRedo, canRedo, onNormalize, hierarchy }) => {
  
  const [entries, setEntries] = useState<DPRItem[]>(report.entries);
  
  // Layout Controls
  const [fontSize, setFontSize] = useState<number>(11);
  const [isExporting, setIsExporting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isSyncing, setIsSyncing] = useState(false);
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');

  // Editors State
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  
  useEffect(() => {
    setEntries(report.entries);
  }, [report]);

  // CSS Dimensions for Screen Preview
  const paperStyles = {
    A4: { width: '210mm', minHeight: '297mm' },
    A3: { width: '297mm', minHeight: '420mm' }
  };
  
  const handlePrint = () => {
    // Reset zoom before print to ensure accurate CSS measurements
    const currentZoom = zoom;
    setZoom(1);
    setTimeout(() => {
        window.print();
        // Restore zoom after print dialog opens (browsers block execution, so this runs after close usually)
        setZoom(currentZoom);
    }, 100);
  };

  const handleDownloadJPG = async () => {
      setIsExporting(true);
      const originalElement = document.getElementById('printable-report');
      
      if (originalElement && window.html2canvas) {
          try {
              // 1. Create a clone container fixed in viewport but behind everything (z-index -50)
              // This is the FIX for 0-byte images. Browsers render this because it's in the viewport.
              const cloneContainer = document.createElement('div');
              cloneContainer.style.position = 'fixed';
              cloneContainer.style.top = '0';
              cloneContainer.style.left = '0';
              cloneContainer.style.zIndex = '-50'; // Behind current UI
              cloneContainer.style.background = '#ffffff';
              cloneContainer.style.overflow = 'hidden'; // Prevent scrollbars affecting capture
              
              // Set explicit width based on Paper Size
              const targetWidth = paperSize === 'A4' ? 800 : 1150;
              cloneContainer.style.width = `${targetWidth}px`;
              
              // 2. Clone the report content
              const clonedReport = originalElement.cloneNode(true) as HTMLElement;
              
              // 3. Clean up the clone
              const noPrintEls = clonedReport.querySelectorAll('.no-print');
              noPrintEls.forEach(el => el.remove());

              // Replace Textareas with Divs
              const textareas = clonedReport.querySelectorAll('textarea');
              textareas.forEach(ta => {
                  const div = document.createElement('div');
                  div.innerText = ta.value;
                  div.style.whiteSpace = 'pre-wrap';
                  div.style.wordBreak = 'break-word';
                  div.style.fontSize = ta.style.fontSize || `${fontSize}px`;
                  div.style.fontFamily = 'inherit';
                  div.style.width = '100%';
                  if (ta.parentNode) ta.parentNode.replaceChild(div, ta);
              });

              // Reset Transforms
              clonedReport.style.transform = 'none';
              clonedReport.style.margin = '0';
              clonedReport.style.boxShadow = 'none';
              clonedReport.style.border = 'none';
              clonedReport.style.width = '100%';
              clonedReport.style.minHeight = 'auto'; 
              clonedReport.style.padding = '40px'; 

              cloneContainer.appendChild(clonedReport);
              document.body.appendChild(cloneContainer);

              // 4. WAIT for render. Critical for images/fonts.
              await new Promise(resolve => setTimeout(resolve, 800));

              // 5. Capture
              const canvas = await window.html2canvas(cloneContainer, {
                  scale: 2, 
                  useCORS: true,
                  backgroundColor: '#ffffff',
                  width: targetWidth,
                  windowWidth: targetWidth,
                  scrollY: 0, // Critical to prevent capturing scrolled-away empty space
                  scrollX: 0
              });

              // 6. Download
              const imgData = canvas.toDataURL('image/jpeg', 0.9);
              if (imgData.length < 1000) {
                   throw new Error("Generated image is too small (0 byte issue).");
              }

              const link = document.createElement('a');
              link.href = imgData;
              link.download = `DPR_${report.date}_${paperSize}.jpg`;
              link.click();

              // 7. Cleanup
              document.body.removeChild(cloneContainer);

          } catch(e) {
              console.error("JPG Export Failed:", e);
              alert("Export failed. Please try 'Print -> Save as PDF' or check console for details.");
          }
      }
      setIsExporting(false);
  };

  const handleSyncQuantities = async () => {
      setIsSyncing(true);
      await syncQuantitiesFromItems(entries, report, 'Manual Sync');
      setTimeout(() => {
          setIsSyncing(false);
          alert("Quantities Synced Successfully!");
      }, 1000);
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

  const handleDeleteClick = (item: DPRItem) => {
    if (window.confirm("Delete this entry?")) {
      onDeleteItem(item.id);
    }
  };

  const applyLocation = (id: string, value: string) => {
      handleLocalChange(id, 'location', value);
      onUpdateItem(id, 'location', value);
      setEditingLocationId(null);
  };

  const applyComponent = (id: string, value: string) => {
       handleLocalChange(id, 'component', value);
       onUpdateItem(id, 'component', value);
       setEditingComponentId(null);
  };

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in relative toolbar-container">
      
      {/* --- TOOLBAR --- */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white p-4 lg:p-5 rounded-2xl shadow-sm border border-slate-100 gap-4 sticky top-0 z-40 backdrop-blur-xl bg-white/90 no-print">
        <div className="flex items-center gap-4">
           <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
               <i className="fas fa-file-contract text-xl"></i>
           </div>
           <div>
              <h2 className="text-2xl font-bold text-slate-800 leading-none">Final Report</h2>
              <div className="flex gap-3 text-xs text-slate-500 font-medium mt-1">
                 {canUndo && (
                   <button onClick={onUndo} className="hover:text-indigo-600 flex items-center gap-1 font-bold"><i className="fas fa-undo"></i> Undo</button>
                 )}
                 {canRedo && (
                   <button onClick={onRedo} className="hover:text-indigo-600 flex items-center gap-1 font-bold"><i className="fas fa-redo"></i> Redo</button>
                 )}
              </div>
           </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-end">
            
             {/* Sync Button */}
            <button 
                onClick={handleSyncQuantities}
                disabled={isSyncing}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-bold hover:bg-emerald-100 transition-colors border border-emerald-200 text-xs sm:text-sm"
            >
                <i className={`fas fa-sync-alt ${isSyncing ? 'fa-spin' : ''} text-sm`}></i>
                {isSyncing ? 'Syncing...' : 'Sync Qty'}
            </button>

             {/* Normalize Button */}
            {onNormalize && (
               <button 
                  onClick={onNormalize} 
                  className="flex items-center gap-2 px-3 py-2 bg-purple-50 text-purple-700 rounded-xl font-bold hover:bg-purple-100 transition-colors border border-purple-200 text-xs sm:text-sm"
               >
                  <i className="fas fa-magic text-sm"></i> Format
               </button>
            )}

            <div className="h-6 w-px bg-slate-200 mx-1 hidden lg:block"></div>

            {/* Paper Size Toggle */}
            <div className="flex items-center bg-slate-100 rounded-xl p-1">
                <button 
                    onClick={() => setPaperSize('A4')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${paperSize === 'A4' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    A4
                </button>
                <button 
                    onClick={() => setPaperSize('A3')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${paperSize === 'A3' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    A3
                </button>
            </div>

            {/* Font Size */}
            <div className="hidden sm:flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                 <button onClick={() => setFontSize(Math.max(8, fontSize - 1))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white text-slate-500"><i className="fas fa-minus text-xs"></i></button>
                 <span className="text-sm font-bold w-6 text-center">{fontSize}</span>
                 <button onClick={() => setFontSize(Math.min(16, fontSize + 1))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white text-slate-500"><i className="fas fa-plus text-xs"></i></button>
            </div>

            {/* Actions */}
            
            <button 
                onClick={handleDownloadJPG}
                disabled={isExporting}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-md font-bold shadow-indigo-200 text-xs sm:text-sm"
            >
                {isExporting ? <i className="fas fa-circle-notch fa-spin text-sm"></i> : <><i className="fas fa-image text-sm"></i> JPG</>}
            </button>
        </div>
      </div>

      {/* --- MOBILE VIEW (CARDS) --- */}
      <div className="lg:hidden no-print">
         {entries.length === 0 ? (
             <div className="text-center p-8 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                 <i className="fas fa-ghost text-4xl mb-3 opacity-20"></i>
                 <p>No entries yet.</p>
             </div>
         ) : (
            entries.map(item => (
                <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 mb-4 animate-fade-in relative group">
                    <div className="flex justify-between items-start mb-3 border-b border-slate-50 pb-2">
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Location</div>
                            <div className="text-lg text-indigo-700 font-bold leading-tight">{item.location}</div>
                            {item.component && <div className="text-sm text-slate-500 font-medium">{item.component}</div>}
                        </div>
                        <div className="text-right">
                            <button 
                                    onClick={() => handleDeleteClick(item)} 
                                    className="bg-red-50 text-red-500 p-2 rounded-lg hover:bg-red-100 transition-colors"
                            >
                                    <i className="fas fa-trash-alt text-sm"></i>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                        <div className="bg-slate-50 p-2 rounded-lg">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Area / Element</div>
                            <input 
                                className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none"
                                value={item.structuralElement || ''}
                                placeholder="N/A"
                                onChange={(e) => handleLocalChange(item.id, 'structuralElement', e.target.value)}
                                onBlur={(e) => handleBlur(item.id, 'structuralElement', e.target.value)}
                            />
                        </div>
                        <div className="bg-slate-50 p-2 rounded-lg">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Chainage / EL</div>
                            <input 
                                className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none"
                                value={item.chainage || ''}
                                placeholder="N/A"
                                onChange={(e) => handleLocalChange(item.id, 'chainage', e.target.value)}
                                onBlur={(e) => handleBlur(item.id, 'chainage', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="mb-3">
                        <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Activity Description</div>
                        <textarea
                                className="w-full text-sm text-slate-800 outline-none resize-none bg-transparent"
                                rows={3}
                                value={item.activityDescription}
                                onChange={(e) => handleLocalChange(item.id, 'activityDescription', e.target.value)}
                                onBlur={(e) => handleBlur(item.id, 'activityDescription', e.target.value)}
                            />
                    </div>

                    <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Next Plan</div>
                        <input
                                className="w-full text-sm text-slate-600 outline-none bg-transparent border-b border-dashed border-slate-200 focus:border-indigo-300 pb-1"
                                value={item.plannedNextActivity}
                                onChange={(e) => handleLocalChange(item.id, 'plannedNextActivity', e.target.value)}
                                onBlur={(e) => handleBlur(item.id, 'plannedNextActivity', e.target.value)}
                            />
                    </div>
                </div>
            ))
         )}
         <div className="h-20"></div> {/* Spacer for bottom nav */}
      </div>

      {/* --- DESKTOP VIEW (PAPER) --- */}
      <div className="hidden lg:flex justify-center bg-slate-200/50 p-8 rounded-2xl border border-slate-200 overflow-auto no-print-padding relative">
        
        {/* Zoom Controls (Screen Only) */}
        <div className="fixed bottom-8 right-8 z-50 bg-white shadow-xl rounded-full border border-slate-200 p-1.5 flex flex-col gap-1 no-print">
            <button onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600"><i className="fas fa-plus text-xs"></i></button>
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600"><i className="fas fa-minus text-xs"></i></button>
        </div>

        <div 
          id="printable-report"
          className="bg-white shadow-2xl origin-top transition-transform duration-200"
          style={{ 
              ...paperStyles[paperSize],
              padding: '15mm',
              transform: `scale(${zoom})`,
              marginBottom: `${(zoom - 1) * 300}px`
          }}
        >
          {/* Paper Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <h1 className="text-4xl text-center uppercase tracking-widest text-slate-900 mb-2 font-bold">Daily Progress Report</h1>
            <div className="flex justify-between items-end mt-6 text-sm">
              <div className="space-y-1">
                <p><span className="font-bold text-slate-900 uppercase">Project:</span> {report.projectTitle}</p>
                <p><span className="font-bold text-slate-900 uppercase">Contractor:</span> Bhugol Infrastructure Company Pvt. Ltd.</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-xl font-bold">{report.date}</p>
                <p className="text-slate-600 italic">{getNepaliDate(report.date)}</p>
                <p className="text-xs text-slate-400 no-print">Paper Size: {paperSize}</p>
              </div>
            </div>
          </div>

          {/* Paper Table */}
          <table className="w-full border-collapse border border-slate-900 text-xs table-fixed">
              <thead>
                  <tr className="bg-slate-100 border-b border-slate-900 text-slate-900 uppercase tracking-wide">
                      <th className="border-r border-slate-900 p-2 w-[12%] text-left font-bold">Location</th>
                      <th className="border-r border-slate-900 p-2 w-[14%] text-left font-bold">Component</th>
                      <th className="border-r border-slate-900 p-2 w-[14%] text-left font-bold">Area / CH</th>
                      <th className="border-r border-slate-900 p-2 w-[45%] text-left font-bold">Activity Description</th>
                      <th className="border-r border-slate-900 p-2 w-[15%] text-left font-bold">Next Plan</th>
                      <th 
                          className="p-1 w-[25px] no-print text-center font-normal" 
                      >
                         <i className="fas fa-cog text-xs opacity-30"></i>
                      </th>
                  </tr>
              </thead>
              <tbody style={{ fontSize: `${fontSize}px` }}>
                  {entries.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center italic text-slate-400 text-xl">No Data Available</td></tr>
                  ) : (
                      entries.map((item) => (
                          <tr key={item.id} className="group border-b border-slate-900 hover:bg-blue-50/20 align-top">
                              {/* Location */}
                              <td className="border-r border-slate-900 p-1.5 relative font-bold text-slate-800">
                                {editingLocationId === item.id ? (
                                    <div className="absolute top-0 left-0 z-50 bg-white shadow-xl border border-indigo-200 p-2 rounded-lg w-48 no-print">
                                        {Object.keys(hierarchy).map(loc => (
                                            <button key={loc} onClick={() => applyLocation(item.id, loc)} className="block w-full text-left text-xs p-1 hover:bg-indigo-50 rounded">{loc}</button>
                                        ))}
                                    </div>
                                ) : (
                                    <div 
                                        onClick={() => setEditingLocationId(item.id)}
                                        className={`cursor-pointer whitespace-pre-wrap ${item.location.includes('Needs Fix') ? 'text-red-600' : ''}`}
                                    >
                                        {item.location}
                                    </div>
                                )}
                              </td>

                              {/* Component */}
                              <td className="border-r border-slate-900 p-1.5 relative">
                                 {editingComponentId === item.id ? (
                                    <div className="absolute top-0 left-0 z-50 bg-white shadow-xl border border-indigo-200 p-2 rounded-lg w-48 no-print">
                                        {(hierarchy[item.location] || []).map(sub => (
                                            <button key={sub} onClick={() => applyComponent(item.id, sub)} className="block w-full text-left text-xs p-1 hover:bg-indigo-50 rounded">{sub}</button>
                                        ))}
                                    </div>
                                ) : (
                                    <div onClick={() => setEditingComponentId(item.id)} className="cursor-pointer whitespace-pre-wrap font-medium text-slate-700">
                                        {item.component}
                                    </div>
                                )}
                              </td>

                              {/* Area / CH */}
                              <td className="border-r border-slate-900 p-1.5">
                                  <textarea 
                                      className="w-full bg-transparent resize-none outline-none font-medium overflow-hidden text-slate-900"
                                      value={item.structuralElement || item.chainage ? `${item.structuralElement || ''} ${item.chainage || ''}`.trim() : item.chainageOrArea}
                                      onChange={(e) => { handleLocalChange(item.id, 'structuralElement', e.target.value); handleLocalChange(item.id, 'chainage', ''); }}
                                      onBlur={(e) => handleBlur(item.id, 'structuralElement', e.target.value)}
                                      ref={el => { if(el){ el.style.height='auto'; el.style.height=el.scrollHeight+'px'; } }}
                                  />
                              </td>

                              {/* Description */}
                              <td className="border-r border-slate-900 p-1.5">
                                  <textarea 
                                      className="w-full bg-transparent resize-none outline-none overflow-hidden leading-relaxed text-slate-900"
                                      value={item.activityDescription}
                                      onChange={(e) => handleLocalChange(item.id, 'activityDescription', e.target.value)}
                                      onBlur={(e) => handleBlur(item.id, 'activityDescription', e.target.value)}
                                      ref={el => { if(el){ el.style.height='auto'; el.style.height=el.scrollHeight+'px'; } }}
                                  />
                              </td>

                              {/* Next Plan */}
                              <td className="border-r border-slate-900 p-1.5">
                                  <textarea 
                                      className="w-full bg-transparent resize-none outline-none overflow-hidden text-slate-900"
                                      value={item.plannedNextActivity}
                                      onChange={(e) => handleLocalChange(item.id, 'plannedNextActivity', e.target.value)}
                                      onBlur={(e) => handleBlur(item.id, 'plannedNextActivity', e.target.value)}
                                      ref={el => { if(el){ el.style.height='auto'; el.style.height=el.scrollHeight+'px'; } }}
                                  />
                              </td>

                              {/* Action (Delete) - CLASS 'no-print' ADDED */}
                              <td className="p-1 align-middle text-center no-print">
                                  <button 
                                    onClick={() => handleDeleteClick(item)}
                                    className="text-slate-300 hover:text-red-500 transition-colors w-full h-full flex items-center justify-center"
                                    title="Delete Row"
                                  >
                                      <i className="fas fa-times text-xs"></i>
                                  </button>
                              </td>
                          </tr>
                      ))
                  )}
              </tbody>
          </table>
          
          {/* INVISIBLE FOOTER BUT DETECTABLE IN DOM */}
          <div className="mt-4 text-right opacity-0 pointer-events-none select-none text-[0.1px]">
             Generated via Construction DPR Maker. Developed by Rishab Nakarmi.
          </div>
        </div>
      </div>
    </div>
  );
};
