import React, { useState, useEffect, useRef } from 'react';
import { DailyReport, DPRItem, QuantityEntry } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';
import { LOCATION_HIERARCHY, ITEM_PATTERNS, EXTRACTION_PATTERNS, CHAINAGE_REGEX } from '../utils/constants';
import { addQuantity } from '../services/firebaseService';

interface ReportTableProps {
  report: DailyReport;
  onDeleteItem: (id: string) => void;
  onUpdateItem: (id: string, field: keyof DPRItem, value: string) => void;
}

export const ReportTable: React.FC<ReportTableProps> = ({ report, onDeleteItem, onUpdateItem }) => {
  
  const [entries, setEntries] = useState<DPRItem[]>(report.entries);
  const [fontSize, setFontSize] = useState<number>(12);
  const [isExporting, setIsExporting] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);
  
  // Drag and Drop State
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Location Editor State
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [selectedMainLocation, setSelectedMainLocation] = useState<string>('');
  
  useEffect(() => {
    setEntries(report.entries);
  }, [report]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportJpeg = async () => {
    setIsExporting(true);
    try {
      const pages = document.querySelectorAll('.report-page');
      
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i] as HTMLElement;
        const canvas = await window.html2canvas(page, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          onclone: (clonedDoc) => {
             const textareas = clonedDoc.querySelectorAll('textarea');
             textareas.forEach((textarea) => {
               const div = clonedDoc.createElement('div');
               div.style.cssText = window.getComputedStyle(textarea).cssText;
               div.style.height = 'auto'; 
               div.style.minHeight = textarea.style.height;
               div.style.whiteSpace = 'pre-wrap';
               div.style.overflow = 'visible';
               div.style.border = 'none';
               div.innerText = textarea.value;
               if(textarea.parentNode) textarea.parentNode.replaceChild(div, textarea);
             });
             const noPrints = clonedDoc.querySelectorAll('.no-print');
             noPrints.forEach(el => (el as HTMLElement).style.display = 'none');
          }
        });

        const image = canvas.toDataURL("image/jpeg", 0.90);
        const link = document.createElement('a');
        link.href = image;
        link.download = `DPR_${report.date}_Page_${i+1}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        await new Promise(r => setTimeout(r, 500));
      }

    } catch (error) {
      console.error("Export failed", error);
      alert("Export failed.");
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

  const handleDeleteClick = (item: DPRItem) => {
    const confirmMsg = `Are you sure you want to delete this entry?\n\n${item.location}: ${item.activityDescription.substring(0, 50)}...`;
    if (window.confirm(confirmMsg)) {
      onDeleteItem(item.id);
    }
  };

  const identifyItemType = (text: string) => {
    for (const p of ITEM_PATTERNS) {
      if (p.pattern.test(text)) return p.name;
    }
    return 'Other';
  };
  
  const extractSpecificLocation = (text: string): string => {
    const found: string[] = [];
    const chMatch = text.match(CHAINAGE_REGEX);
    if (chMatch) found.push(chMatch[0]);
    EXTRACTION_PATTERNS.forEach(p => {
      if (p.regex.test(text)) {
        if (!found.includes(p.label)) found.push(p.label);
      }
    });
    return found.join(', ');
  };

  const handleSendToQuantity = async (item: DPRItem) => {
     const regex = /(\d+(\.\d+)?)\s*(m3|cum|sqm|sq\.m|m|mtr|nos|t|ton)/i;
     const match = item.activityDescription.match(regex);
     
     if(match) {
         if(window.confirm(`Add this quantity to collection?\n\n${match[0]}`)) {
             const newQty: QuantityEntry = {
                id: crypto.randomUUID(),
                date: report.date,
                location: item.location,
                structure: item.chainageOrArea,
                specificLocation: extractSpecificLocation(item.activityDescription),
                itemType: identifyItemType(item.activityDescription),
                description: item.activityDescription,
                quantityValue: parseFloat(match[1]),
                quantityUnit: match[3],
                originalRawString: match[0],
                originalReportItemId: item.id,
                reportId: report.id,
                lastUpdated: new Date().toISOString(),
                updatedBy: item.createdBy || 'Manual Send'
              };
              await addQuantity(newQty);
         }
     } else {
         alert("No explicit quantity (e.g., 50 m3) found in description.");
     }
  };

  // --- Drag and Drop Handlers ---
  const onDragStart = (e: React.DragEvent, index: number) => {
    if (!isDragMode) {
      e.preventDefault();
      return;
    }
    dragItem.current = index;
    // Set transparency or effect
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragEnter = (e: React.DragEvent, index: number) => {
    if (!isDragMode) return;
    dragOverItem.current = index;
  };

  const onDragEnd = () => {
    if (!isDragMode) return;
    const dragIndex = dragItem.current;
    const dragOverIndex = dragOverItem.current;

    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const _entries = [...entries];
      const draggedItemContent = _entries[dragIndex];
      _entries.splice(dragIndex, 1);
      _entries.splice(dragOverIndex, 0, draggedItemContent);
      setEntries(_entries);
      // Note: Backend re-ordering requires schema change or full array update.
      // For now, this is visual for the current session/print.
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  // --- Location Selector Logic ---
  const openLocationEditor = (id: string, currentLocation: string) => {
    setEditingLocationId(id);
    // Try to split "Main - Sub" to pre-select
    const parts = currentLocation.split(' - ');
    if (parts.length > 0 && LOCATION_HIERARCHY[parts[0]]) {
      setSelectedMainLocation(parts[0]);
    } else {
      setSelectedMainLocation(Object.keys(LOCATION_HIERARCHY)[0]);
    }
  };

  const applyLocation = (main: string, sub: string) => {
    if (editingLocationId) {
       const newVal = sub ? `${main} - ${sub}` : main;
       handleLocalChange(editingLocationId, 'location', newVal);
       onUpdateItem(editingLocationId, 'location', newVal);
       setEditingLocationId(null);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in relative">
      
      {/* Action Bar */}
      <div className="flex flex-col xl:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 gap-6">
        <div>
           <h2 className="text-xl font-bold text-slate-800">Final Report</h2>
           <p className="text-sm text-slate-500 mt-1">
             Drag rows to reorder. Click Location to select structure.
           </p>
        </div>

        {/* Controls */}
        <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto">
          
          <button
             onClick={() => setIsDragMode(!isDragMode)}
             className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 border w-full md:w-auto justify-center transition-colors ${
               isDragMode 
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
             }`}
          >
             {isDragMode ? <i className="fas fa-check"></i> : <i className="fas fa-arrows-up-down"></i>}
             {isDragMode ? 'Done Reordering' : 'Enable Drag Mode'}
          </button>

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
              Save JPGs
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
      <div className="overflow-auto bg-slate-200/50 p-4 md:p-8 rounded-2xl border border-slate-200 text-center">
        
        {/* --- PAGE 1: REPORT TABLE --- */}
        <div 
          className="report-page bg-white p-[20mm] shadow-2xl mx-auto w-[210mm] min-h-[297mm] text-left relative mb-8"
          style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
        >
          {/* Header */}
          <div className="mb-8 border-b-2 border-black pb-4">
            <h1 className="text-3xl font-bold uppercase text-center tracking-wider mb-2">Daily Progress Report</h1>
            <div className="flex justify-between items-end mt-6 text-sm">
              <div className="w-2/3">
                <p className="mb-1"><span className="font-bold">Project:</span> {report.projectTitle}</p>
                <p><span className="font-bold">Contractor:</span> Bhugol Infrastructure Company Pvt. Ltd.</p>
              </div>
              <div className="text-right">
                <p className="text-lg"><span className="font-bold">Date:</span> {report.date}</p>
                <p className="text-sm text-gray-600">{getNepaliDate(report.date)}</p>
              </div>
            </div>
          </div>

          <div className="mb-2 font-bold underline text-sm">
            Workfront Status:
          </div>

          {/* Table */}
          <div className="border-2 border-black">
            <div className="grid grid-cols-12 border-b-2 border-black bg-gray-200 divide-x-2 divide-black font-bold text-center text-xs uppercase tracking-wide">
              <div className="col-span-2 p-3 flex items-center justify-center">Location</div>
              <div className="col-span-2 p-3 flex items-center justify-center">Chainage / Area</div>
              <div className="col-span-5 p-3 flex items-center justify-center">Activity Description</div>
              <div className="col-span-3 p-3 flex items-center justify-center">Planned Next Activity</div>
            </div>

            {entries.length === 0 ? (
               <div className="p-12 text-center text-gray-400 italic">-- No Data --</div>
            ) : (
              entries.map((item, index) => (
                <div 
                  key={item.id} 
                  draggable={isDragMode}
                  onDragStart={(e) => onDragStart(e, index)}
                  onDragEnter={(e) => onDragEnter(e, index)}
                  onDragEnd={onDragEnd}
                  className={`grid grid-cols-12 divide-x divide-black text-xs leading-relaxed group hover:bg-blue-50/10 transition-colors 
                    ${index !== entries.length - 1 ? 'border-b border-black' : ''}
                    ${isDragMode ? 'cursor-move' : ''}
                  `}
                >
                  {/* Location (Custom Editor) */}
                  <div className="col-span-2 p-2 relative flex items-start">
                    {/* Drag Handle (Visual Only) */}
                    {isDragMode && (
                        <div className="no-print mr-2 mt-1 text-slate-400 cursor-move">
                            <i className="fas fa-grip-vertical"></i>
                        </div>
                    )}

                    {editingLocationId === item.id ? (
                      <div className="absolute top-0 left-0 z-10 bg-white shadow-xl border border-indigo-200 p-2 rounded-lg w-64">
                         <div className="space-y-2">
                           <select 
                             className="w-full p-1 border rounded text-xs"
                             value={selectedMainLocation}
                             onChange={(e) => setSelectedMainLocation(e.target.value)}
                           >
                              {Object.keys(LOCATION_HIERARCHY).map(loc => (
                                <option key={loc} value={loc}>{loc}</option>
                              ))}
                           </select>
                           <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                              {LOCATION_HIERARCHY[selectedMainLocation]?.map(sub => (
                                <button 
                                  key={sub}
                                  onClick={() => applyLocation(selectedMainLocation, sub)}
                                  className="text-left text-xs p-1 hover:bg-indigo-50 rounded"
                                >
                                  {sub}
                                </button>
                              ))}
                           </div>
                           <button onClick={() => setEditingLocationId(null)} className="text-[10px] text-red-500 underline w-full text-right">Cancel</button>
                         </div>
                      </div>
                    ) : (
                      <div className="relative w-full h-full" onClick={() => openLocationEditor(item.id, item.location)}>
                        <textarea
                          value={item.location}
                          readOnly
                          className="w-full h-full bg-transparent resize-none outline-none cursor-pointer"
                          style={{ fontSize: `${fontSize}px` }}
                          rows={Math.max(2, Math.ceil(item.location.length / 15))}
                        />
                        <div className="no-print absolute top-0 right-0 text-gray-300 text-[10px]"><i className="fas fa-pen"></i></div>
                      </div>
                    )}
                  </div>

                  {/* Chainage */}
                  <div className="col-span-2 p-2 relative">
                     <textarea
                      value={item.chainageOrArea}
                      onChange={(e) => handleLocalChange(item.id, 'chainageOrArea', e.target.value)}
                      onBlur={(e) => handleBlur(item.id, 'chainageOrArea', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none"
                      style={{ fontSize: `${fontSize}px` }}
                      rows={Math.max(2, Math.ceil(item.chainageOrArea.length / 15))}
                    />
                  </div>

                  {/* Desc */}
                  <div className="col-span-5 p-2 relative">
                     <textarea
                      value={item.activityDescription}
                      onChange={(e) => handleLocalChange(item.id, 'activityDescription', e.target.value)}
                      onBlur={(e) => handleBlur(item.id, 'activityDescription', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none whitespace-pre-wrap"
                      style={{ fontSize: `${fontSize}px` }}
                      rows={Math.max(3, Math.ceil(item.activityDescription.length / 40))}
                    />
                  </div>

                  {/* Next + Actions */}
                  <div className="col-span-3 p-2 relative group-hover:bg-blue-50/10">
                     <textarea
                      value={item.plannedNextActivity}
                      onChange={(e) => handleLocalChange(item.id, 'plannedNextActivity', e.target.value)}
                      onBlur={(e) => handleBlur(item.id, 'plannedNextActivity', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none"
                      style={{ fontSize: `${fontSize}px` }}
                      rows={Math.max(2, Math.ceil(item.plannedNextActivity.length / 20))}
                    />
                    
                    {/* Floating Actions */}
                    <div className="no-print absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 bg-white/90 p-1 rounded shadow-sm">
                      <button 
                        onClick={() => handleSendToQuantity(item)}
                        className="bg-white hover:bg-green-50 text-green-600 border border-green-200 rounded w-6 h-6 flex items-center justify-center shadow-sm"
                        title="Add to Quantities"
                      >
                         <i className="fas fa-calculator text-[10px]"></i>
                      </button>
                      <button 
                        onClick={() => handleDeleteClick(item)}
                        className="bg-white hover:bg-red-50 text-red-500 border border-slate-200 rounded w-6 h-6 flex items-center justify-center shadow-sm"
                        title="Delete"
                      >
                        <i className="fas fa-trash-alt text-[10px]"></i>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="absolute bottom-1 right-1 print:block">
             <span className="text-white text-[1px] opacity-[0.01] select-none">built by Rishab Nakarmi</span>
          </div>
        </div>

      </div>

    </div>
  );
};