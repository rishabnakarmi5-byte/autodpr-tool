
import React, { useState, useEffect } from 'react';
import { DailyReport, DPRItem, BackupEntry } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';
import { syncQuantitiesFromItems, getBackupById } from '../services/firebaseService';
import { parseQuantityDetails } from '../utils/constants';

interface ReportTableProps {
  report: DailyReport;
  onDeleteItem: (id: string) => void;
  onUpdateItem: (id: string, field: keyof DPRItem, value: string) => void;
  onUpdateRow?: (id: string, updates: Partial<DPRItem>) => void;
  onUpdateAllEntries?: (entries: DPRItem[]) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  onRedo?: () => void;
  canRedo?: boolean;
  onNormalize?: () => void;
  onSplitItem?: (item: DPRItem) => void;
  hierarchy: Record<string, string[]>;
}

type PaperSize = 'A4' | 'A3';

export const ReportTable: React.FC<ReportTableProps> = ({ report, onDeleteItem, onUpdateItem, onUpdateRow, onUpdateAllEntries, onUndo, canUndo, onRedo, canRedo, onNormalize, onSplitItem, hierarchy }) => {
  
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

  // Inspector State
  const [inspectItem, setInspectItem] = useState<DPRItem | null>(null);
  const [sourceBackup, setSourceBackup] = useState<BackupEntry | null>(null);
  const [isLoadingBackup, setIsLoadingBackup] = useState(false);
  
  useEffect(() => {
    setEntries(report.entries);
  }, [report]);

  // Update inspect item live if it changes in the report
  useEffect(() => {
      if (inspectItem) {
          const freshItem = report.entries.find(e => e.id === inspectItem.id);
          if (freshItem) setInspectItem(freshItem);
      }
  }, [report]);

  // CSS Dimensions for Screen Preview
  const paperStyles = {
    A4: { width: '210mm', minHeight: '297mm' },
    A3: { width: '297mm', minHeight: '420mm' }
  };
  
  const handlePrint = () => {
    const currentZoom = zoom;
    setZoom(1);
    setTimeout(() => {
        window.print();
        setZoom(currentZoom);
    }, 100);
  };

  const handleDownloadJPG = async () => {
      setIsExporting(true);
      const originalElement = document.getElementById('printable-report');
      
      if (originalElement && window.html2canvas) {
          try {
              const cloneContainer = document.createElement('div');
              cloneContainer.style.position = 'fixed';
              cloneContainer.style.top = '0';
              cloneContainer.style.left = '0';
              cloneContainer.style.zIndex = '-50';
              cloneContainer.style.background = '#ffffff';
              cloneContainer.style.overflow = 'hidden';
              
              const targetWidth = paperSize === 'A4' ? 800 : 1150;
              cloneContainer.style.width = `${targetWidth}px`;
              
              const clonedReport = originalElement.cloneNode(true) as HTMLElement;
              
              const noPrintEls = clonedReport.querySelectorAll('.no-print');
              noPrintEls.forEach(el => el.remove());

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

              clonedReport.style.transform = 'none';
              clonedReport.style.margin = '0';
              clonedReport.style.boxShadow = 'none';
              clonedReport.style.border = 'none';
              clonedReport.style.width = '100%';
              clonedReport.style.minHeight = 'auto'; 
              clonedReport.style.padding = '40px'; 

              cloneContainer.appendChild(clonedReport);
              document.body.appendChild(cloneContainer);

              await new Promise(resolve => setTimeout(resolve, 800));

              const canvas = await window.html2canvas(cloneContainer, {
                  scale: 2, 
                  useCORS: true,
                  backgroundColor: '#ffffff',
                  width: targetWidth,
                  windowWidth: targetWidth,
                  scrollY: 0,
                  scrollX: 0
              });

              const imgData = canvas.toDataURL('image/jpeg', 0.9);
              if (imgData.length < 1000) {
                   throw new Error("Generated image is too small.");
              }

              const link = document.createElement('a');
              link.href = imgData;
              link.download = `DPR_${report.date}_${paperSize}.jpg`;
              link.click();

              document.body.removeChild(cloneContainer);

          } catch(e) {
              console.error("JPG Export Failed:", e);
              alert("Export failed. Please try 'Print -> Save as PDF'.");
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

  const handleAreaBlur = (id: string, value: string) => {
      if (onUpdateRow) {
          onUpdateRow(id, { 
              structuralElement: value, 
              chainage: '',
              chainageOrArea: value
          });
      } else {
          onUpdateItem(id, 'structuralElement', value);
          onUpdateItem(id, 'chainage', '');
          onUpdateItem(id, 'chainageOrArea', value);
      }
  };

  const handleDeleteClick = (item: DPRItem) => {
    if (window.confirm("Delete this entry?")) {
      onDeleteItem(item.id);
    }
  };

  const handleSplit = () => {
      if(inspectItem && onSplitItem) {
          if(confirm("Split this entry? A duplicate will be created sharing the same raw source, allowing you to separate quantities.")) {
              onSplitItem(inspectItem);
              alert("Item duplicated below. You can now edit each separately.");
              setInspectItem(null); // Close to refresh view
          }
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

  const openInspector = async (item: DPRItem) => {
      setInspectItem(item);
      setSourceBackup(null);
      
      if (item.sourceBackupId) {
          setIsLoadingBackup(true);
          try {
              const backup = await getBackupById(item.sourceBackupId);
              setSourceBackup(backup);
          } catch(e) {
              console.error(e);
          }
          setIsLoadingBackup(false);
      }
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
            <button 
                onClick={handleSyncQuantities}
                disabled={isSyncing}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-bold hover:bg-emerald-100 transition-colors border border-emerald-200 text-xs sm:text-sm"
            >
                <i className={`fas fa-sync-alt ${isSyncing ? 'fa-spin' : ''} text-sm`}></i>
                {isSyncing ? 'Syncing...' : 'Sync Qty'}
            </button>

            {onNormalize && (
               <button 
                  onClick={onNormalize} 
                  className="flex items-center gap-2 px-3 py-2 bg-purple-50 text-purple-700 rounded-xl font-bold hover:bg-purple-100 transition-colors border border-purple-200 text-xs sm:text-sm"
               >
                  <i className="fas fa-magic text-sm"></i> Format
               </button>
            )}

            <div className="h-6 w-px bg-slate-200 mx-1 hidden lg:block"></div>

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

            <div className="hidden sm:flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                 <button onClick={() => setFontSize(Math.max(8, fontSize - 1))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white text-slate-500"><i className="fas fa-minus text-xs"></i></button>
                 <span className="text-sm font-bold w-6 text-center">{fontSize}</span>
                 <button onClick={() => setFontSize(Math.min(16, fontSize + 1))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white text-slate-500"><i className="fas fa-plus text-xs"></i></button>
            </div>
            
            <button 
                onClick={handleDownloadJPG}
                disabled={isExporting}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-md font-bold shadow-indigo-200 text-xs sm:text-sm"
            >
                {isExporting ? <i className="fas fa-circle-notch fa-spin text-sm"></i> : <><i className="fas fa-image text-sm"></i> JPG</>}
            </button>
        </div>
      </div>

      {/* --- DESKTOP VIEW (PAPER) --- */}
      <div className="hidden lg:flex justify-center bg-slate-200/50 p-8 rounded-2xl border border-slate-200 overflow-auto no-print-padding relative">
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

          <table className="w-full border-collapse border border-slate-900 text-xs table-fixed">
              <thead>
                  <tr className="bg-slate-100 border-b border-slate-900 text-slate-900 uppercase tracking-wide">
                      <th className="border-r border-slate-900 p-2 w-[12%] text-left font-bold">Location</th>
                      <th className="border-r border-slate-900 p-2 w-[14%] text-left font-bold">Component</th>
                      <th className="border-r border-slate-900 p-2 w-[14%] text-left font-bold">Area / CH</th>
                      <th className="border-r border-slate-900 p-2 w-[35%] text-left font-bold">Activity Description</th>
                      <th className="border-r border-slate-900 p-2 w-[25%] text-left font-bold">Next Plan</th>
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

                              <td className="border-r border-slate-900 p-1.5">
                                  <textarea 
                                      className="w-full bg-transparent resize-none outline-none font-medium overflow-hidden text-slate-900"
                                      value={item.structuralElement || item.chainage ? `${item.structuralElement || ''} ${item.chainage || ''}`.trim() : item.chainageOrArea}
                                      onChange={(e) => { 
                                          handleLocalChange(item.id, 'structuralElement', e.target.value); 
                                          handleLocalChange(item.id, 'chainage', ''); 
                                      }}
                                      onBlur={(e) => handleAreaBlur(item.id, e.target.value)}
                                      ref={el => { if(el){ el.style.height='auto'; el.style.height=el.scrollHeight+'px'; } }}
                                  />
                              </td>

                              <td className="border-r border-slate-900 p-1.5">
                                  <textarea 
                                      className="w-full bg-transparent resize-none outline-none overflow-hidden leading-relaxed text-slate-900"
                                      value={item.activityDescription}
                                      onChange={(e) => handleLocalChange(item.id, 'activityDescription', e.target.value)}
                                      onBlur={(e) => handleBlur(item.id, 'activityDescription', e.target.value)}
                                      ref={el => { if(el){ el.style.height='auto'; el.style.height=el.scrollHeight+'px'; } }}
                                  />
                              </td>

                              <td className="border-r border-slate-900 p-1.5">
                                  <textarea 
                                      className="w-full bg-transparent resize-none outline-none overflow-hidden text-slate-900"
                                      value={item.plannedNextActivity}
                                      onChange={(e) => handleLocalChange(item.id, 'plannedNextActivity', e.target.value)}
                                      onBlur={(e) => handleBlur(item.id, 'plannedNextActivity', e.target.value)}
                                      ref={el => { if(el){ el.style.height='auto'; el.style.height=el.scrollHeight+'px'; } }}
                                  />
                              </td>

                              <td className="p-1 align-middle text-center no-print flex flex-col items-center justify-center gap-1 h-full">
                                  <button 
                                    onClick={() => openInspector(item)}
                                    className="text-slate-300 hover:text-indigo-600 transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-indigo-50"
                                    title="Master Record Inspector"
                                  >
                                      <i className="fas fa-database text-xs"></i>
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteClick(item)}
                                    className="text-slate-300 hover:text-red-500 transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-red-50"
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
          <div className="mt-4 text-right opacity-0 pointer-events-none select-none text-[0.1px]">
             Generated via Construction DPR Maker.
          </div>
        </div>
      </div>

      {/* MASTER RECORD INSPECTOR MODAL */}
      {inspectItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm animate-fade-in no-print">
              <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden relative">
                  
                  {/* Header */}
                  <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
                      <div>
                          <div className="flex items-center gap-3">
                              <h3 className="text-2xl font-bold text-slate-800">Master Record</h3>
                              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-mono font-bold">
                                  ID: {inspectItem.id.substring(0,8)}...
                              </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex gap-3">
                              <span><i className="fas fa-user-circle mr-1"></i> Created by: <strong>{inspectItem.createdBy || 'Unknown'}</strong></span>
                              {inspectItem.lastModifiedAt && (
                                  <span><i className="fas fa-clock mr-1"></i> Updated: {new Date(inspectItem.lastModifiedAt).toLocaleString()}</span>
                              )}
                          </div>
                      </div>
                      <div className="flex gap-2">
                          <button onClick={handleSplit} className="bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-300 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm">
                              <i className="fas fa-columns mr-2"></i> Split Entry
                          </button>
                          <button onClick={() => setInspectItem(null)} className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors">
                              <i className="fas fa-times text-slate-600 text-lg"></i>
                          </button>
                      </div>
                  </div>

                  <div className="flex-1 flex overflow-hidden">
                      {/* Left Column: Editable Fields */}
                      <div className="w-2/5 p-6 overflow-y-auto border-r border-slate-100 bg-white">
                          <h4 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-wider">Current Data Fields</h4>
                          
                          <div className="space-y-5">
                              <div>
                                  <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1">Main Location</label>
                                  <input 
                                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    value={inspectItem.location}
                                    onChange={(e) => handleLocalChange(inspectItem.id, 'location', e.target.value)}
                                    onBlur={(e) => onUpdateItem(inspectItem.id, 'location', e.target.value)}
                                  />
                              </div>
                              <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Component</label>
                                  <input 
                                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    value={inspectItem.component}
                                    onChange={(e) => handleLocalChange(inspectItem.id, 'component', e.target.value)}
                                    onBlur={(e) => onUpdateItem(inspectItem.id, 'component', e.target.value)}
                                  />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Structure / Element</label>
                                      <input 
                                        className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                        value={inspectItem.structuralElement}
                                        onChange={(e) => handleLocalChange(inspectItem.id, 'structuralElement', e.target.value)}
                                        onBlur={(e) => onUpdateItem(inspectItem.id, 'structuralElement', e.target.value)}
                                      />
                                  </div>
                                  <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Chainage / Elevation</label>
                                      <input 
                                        className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                        value={inspectItem.chainage}
                                        onChange={(e) => handleLocalChange(inspectItem.id, 'chainage', e.target.value)}
                                        onBlur={(e) => onUpdateItem(inspectItem.id, 'chainage', e.target.value)}
                                      />
                                  </div>
                              </div>
                              <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Activity Description</label>
                                  <textarea 
                                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 min-h-[120px] focus:ring-2 focus:ring-indigo-500 outline-none text-sm leading-relaxed"
                                    value={inspectItem.activityDescription}
                                    onChange={(e) => handleLocalChange(inspectItem.id, 'activityDescription', e.target.value)}
                                    onBlur={(e) => onUpdateItem(inspectItem.id, 'activityDescription', e.target.value)}
                                  />
                              </div>
                              <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Planned Next</label>
                                  <input 
                                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    value={inspectItem.plannedNextActivity}
                                    onChange={(e) => handleLocalChange(inspectItem.id, 'plannedNextActivity', e.target.value)}
                                    onBlur={(e) => onUpdateItem(inspectItem.id, 'plannedNextActivity', e.target.value)}
                                  />
                              </div>
                          </div>
                      </div>

                      {/* Right Column: Context & History */}
                      <div className="w-3/5 flex flex-col bg-slate-50/50">
                          
                          {/* Raw Source View */}
                          <div className="p-6 border-b border-slate-200 h-1/2 overflow-y-auto">
                              <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                                  <i className="fas fa-fingerprint"></i> Original Source Context
                              </h4>
                              
                              {isLoadingBackup ? (
                                  <div className="text-center p-8 text-slate-400">
                                      <i className="fas fa-circle-notch fa-spin text-xl mb-2"></i><br/>Retrieving Backup...
                                  </div>
                              ) : sourceBackup ? (
                                  <div className="space-y-3">
                                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative group">
                                          <div className="absolute top-2 right-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                              <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500 font-mono">
                                                  {new Date(sourceBackup.timestamp).toLocaleTimeString()}
                                              </span>
                                          </div>
                                          <div className="text-[10px] text-slate-400 mb-2 uppercase font-bold">
                                              Batch Upload by {sourceBackup.user}
                                          </div>
                                          <div className="font-mono text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                                              {sourceBackup.rawInput}
                                          </div>
                                      </div>
                                      <p className="text-[10px] text-slate-400 italic text-center px-4">
                                          This entry was AI-parsed from the text block above. Splitting this entry will create a new record linked to this same source.
                                      </p>
                                  </div>
                              ) : (
                                  <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl p-4">
                                      <i className="fas fa-keyboard text-3xl mb-2 opacity-20"></i>
                                      <p className="text-sm font-medium">Manual Entry</p>
                                      <p className="text-xs">No raw source backup found.</p>
                                  </div>
                              )}
                          </div>

                          {/* Edit History View */}
                          <div className="p-6 h-1/2 overflow-y-auto bg-slate-100/50">
                              <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                                  <i className="fas fa-history"></i> Edit History
                              </h4>
                              
                              {!inspectItem.editHistory || inspectItem.editHistory.length === 0 ? (
                                  <div className="text-center p-8 text-slate-400 text-xs italic">
                                      No edits recorded yet.
                                  </div>
                              ) : (
                                  <div className="space-y-4">
                                      {[...inspectItem.editHistory].reverse().map((log, idx) => (
                                          <div key={idx} className="flex gap-3 relative">
                                              <div className="flex flex-col items-center">
                                                  <div className="w-2 h-2 rounded-full bg-indigo-400 ring-4 ring-slate-100"></div>
                                                  {idx !== (inspectItem.editHistory?.length || 0) - 1 && <div className="w-px h-full bg-slate-200 my-1"></div>}
                                              </div>
                                              <div className="flex-1 pb-2">
                                                  <div className="text-[10px] text-slate-400 mb-0.5">
                                                      {new Date(log.timestamp).toLocaleString()} by <span className="font-bold text-slate-600">{log.user}</span>
                                                  </div>
                                                  <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm text-xs">
                                                      <span className="font-bold text-indigo-600 uppercase text-[10px] mr-2">{log.field}</span>
                                                      <span className="text-red-400 line-through mr-2 opacity-70">{log.oldValue || 'Empty'}</span>
                                                      <i className="fas fa-arrow-right text-slate-300 text-[10px] mr-2"></i>
                                                      <span className="text-green-600 font-medium">{log.newValue}</span>
                                                  </div>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
