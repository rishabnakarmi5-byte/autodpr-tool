
import React, { useState, useEffect, useRef } from 'react';
import { DailyReport, DPRItem } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';

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

export const ReportTable: React.FC<ReportTableProps> = ({ report, onDeleteItem, onUpdateItem, onUpdateAllEntries, onUndo, canUndo, onRedo, canRedo, onNormalize, hierarchy }) => {
  
  const [entries, setEntries] = useState<DPRItem[]>(report.entries);
  
  // Layout Controls
  const [fontSize, setFontSize] = useState<number>(11);
  const [descWidthPercent, setDescWidthPercent] = useState<number>(45); // Default 45%
  const [rowMinHeight, setRowMinHeight] = useState<number>(0); // 0 = auto

  const [isExporting, setIsExporting] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);
  
  // Paper Settings
  const [zoom, setZoom] = useState(1);

  // Drag and Drop State
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Editors State
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  
  useEffect(() => {
    setEntries(report.entries);
  }, [report]);
  
  // Dynamic Grid Template Calculation
  // We fix Location/Component/Area/Next to specific ratios around the adjustable Description width
  // Base ratios (approx): Loc 12, Comp 14, Area 14, Next 15 => Total 55% fixed-ish logic
  // To make it fully dynamic while keeping headers aligned, we use percentages.
  // We'll give fixed min-widths in % to others and let Description take the rest, or adjust properly.
  
  // Let's use a simpler approach: 
  // Description is user controlled [descWidthPercent]%.
  // The remaining [100 - descWidthPercent]% is distributed among the other 4 columns.
  // Dist ratios: Loc(0.22), Comp(0.25), Area(0.25), Next(0.28) of the remainder.
  const remainder = 100 - descWidthPercent;
  const colLoc = Math.floor(remainder * 0.22);
  const colComp = Math.floor(remainder * 0.25);
  const colArea = Math.floor(remainder * 0.25);
  const colNext = remainder - colLoc - colComp - colArea; // Remainder to Next

  const gridTemplate = `${colLoc}% ${colComp}% ${colArea}% ${descWidthPercent}% ${colNext}%`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJPG = async () => {
      setIsExporting(true);
      const input = document.getElementById('printable-report');
      if (input && window.html2canvas) {
          try {
              // Temporarily reset transform for clean capture
              const originalTransform = input.style.transform;
              input.style.transform = 'none';
              
              const canvas = await window.html2canvas(input, { scale: 2, backgroundColor: '#ffffff' });
              const imgData = canvas.toDataURL('image/jpeg', 0.9);
              const link = document.createElement('a');
              link.href = imgData;
              link.download = `DPR_${report.date}.jpg`;
              link.click();
              
              input.style.transform = originalTransform;
          } catch(e) {
              console.error(e);
              alert("Failed to capture image.");
          }
      }
      setIsExporting(false);
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

  // --- Drag and Drop Handlers ---
  const onDragStart = (e: React.DragEvent, index: number) => {
    if (!isDragMode) {
      e.preventDefault();
      return;
    }
    dragItem.current = index;
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
      if(onUpdateAllEntries) onUpdateAllEntries(_entries);
    }
    dragItem.current = null;
    dragOverItem.current = null;
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
    <div className="flex flex-col h-full space-y-6 animate-fade-in relative">
      
      {/* Action Bar */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white p-4 rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 gap-4">
        <div className="flex gap-4 items-center">
           <div>
              <h2 className="text-xl font-bold text-slate-800">Final Report</h2>
              <div className="flex gap-2 text-xs">
                 {canUndo && (
                   <button onClick={onUndo} className="hover:text-indigo-600 font-bold" title="Undo"><i className="fas fa-undo"></i> Undo</button>
                 )}
                 {canRedo && (
                   <button onClick={onRedo} className="hover:text-indigo-600 font-bold" title="Redo"><i className="fas fa-redo"></i> Redo</button>
                 )}
              </div>
           </div>

           {onNormalize && (
               <button 
                  onClick={onNormalize} 
                  className="bg-purple-50 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border border-purple-200"
                  title="Re-parse Chainage & Area fields based on text"
               >
                  <i className="fas fa-sync-alt"></i> Sync
               </button>
           )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-end">
          
          {/* Layout Controls */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
             
             {/* Text Size */}
             <div className="flex items-center gap-1 px-2 border-r border-slate-200">
                <i className="fas fa-text-height text-slate-400 text-xs"></i>
                <input 
                    type="range" min="8" max="14" step="1" value={fontSize} 
                    onChange={e => setFontSize(parseInt(e.target.value))}
                    className="w-16"
                    title="Font Size"
                />
             </div>

             {/* Description Width */}
             <div className="flex items-center gap-1 px-2 border-r border-slate-200">
                <i className="fas fa-arrows-left-right text-slate-400 text-xs" title="Description Column Width"></i>
                <input 
                    type="range" min="30" max="70" step="1" value={descWidthPercent} 
                    onChange={e => setDescWidthPercent(parseInt(e.target.value))}
                    className="w-16 accent-indigo-500"
                    title="Adjust Description Width"
                />
             </div>

             {/* Row Height */}
             <div className="flex items-center gap-1 px-2">
                <i className="fas fa-arrows-up-down text-slate-400 text-xs" title="Row Height"></i>
                <input 
                    type="range" min="0" max="50" step="5" value={rowMinHeight} 
                    onChange={e => setRowMinHeight(parseInt(e.target.value))}
                    className="w-16 accent-indigo-500"
                    title="Increase Row Spacing"
                />
                <button 
                    onClick={() => setRowMinHeight(0)} 
                    className="ml-1 text-[10px] font-bold bg-white border border-slate-300 px-1.5 rounded hover:bg-slate-100"
                    title="Auto Fit Height to Text"
                >
                    Auto
                </button>
             </div>
          </div>

          <button
             onClick={() => setIsDragMode(!isDragMode)}
             className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border transition-colors ${
               isDragMode 
                ? 'bg-indigo-600 text-white border-indigo-600' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
             }`}
             title="Reorder Rows"
          >
             <i className="fas fa-arrows-up-down"></i>
          </button>

          <button 
              onClick={handlePrint}
              className="flex items-center justify-center px-4 py-1.5 bg-slate-900 text-white font-bold rounded-lg hover:bg-black transition-all shadow-md text-sm"
            >
              <i className="fas fa-print mr-2"></i>
          </button>
          
          <button 
              onClick={handleDownloadJPG}
              disabled={isExporting}
              className="flex items-center justify-center px-3 py-1.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-md text-sm"
            >
              {isExporting ? <i className="fas fa-circle-notch fa-spin"></i> : 'JPG'}
          </button>
        </div>
      </div>

      {/* Floating Zoom Control */}
      <div className="fixed bottom-6 right-6 z-50 bg-white shadow-xl rounded-full border border-slate-200 p-2 flex items-center gap-2 animate-fade-in no-print">
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600">
              <i className="fas fa-minus"></i>
          </button>
          <span className="text-xs font-bold w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600">
              <i className="fas fa-plus"></i>
          </button>
      </div>

      {/* Printable Area Wrapper */}
      <div className="overflow-auto bg-slate-200/50 p-4 md:p-8 rounded-2xl border border-slate-200 text-center flex justify-center no-print-padding">
        
        <div 
          id="printable-report"
          className="report-page bg-white p-[15mm] shadow-2xl text-left relative mb-8 transition-all duration-300 origin-top mx-auto"
          style={{ 
              width: '210mm', // Force A4 width for preview
              minHeight: '297mm',
              transform: `scale(${zoom})`,
              transformOrigin: 'top center'
          }}
        >
          {/* Header */}
          <div className="mb-4 border-b-2 border-black pb-4">
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

          {/* Table Container - Standard CSS Grid */}
          <div className="border-2 border-black text-xs">
            
            {/* Header Row */}
            <div 
                className="grid border-b-2 border-black bg-gray-200 divide-x-2 divide-black font-bold text-center uppercase tracking-wide"
                style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="p-2 flex items-center justify-center">Location</div>
              <div className="p-2 flex items-center justify-center">Component</div>
              <div className="p-2 flex items-center justify-center">Area / CH</div>
              <div className="p-2 flex items-center justify-center">Activity Description</div>
              <div className="p-2 flex items-center justify-center">Next Plan</div>
            </div>

            {/* Data Rows */}
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
                  className={`grid divide-x divide-black leading-relaxed group hover:bg-blue-50/10 transition-colors relative
                    ${index !== entries.length - 1 ? 'border-b border-black' : ''}
                    ${isDragMode ? 'cursor-move' : ''}
                  `}
                  style={{ 
                      gridTemplateColumns: gridTemplate,
                      fontSize: `${fontSize}px`,
                      minHeight: rowMinHeight > 0 ? `${rowMinHeight}px` : 'auto'
                  }}
                >
                    {/* Delete Button (Floating Left) */}
                    <div className="no-print absolute -left-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                        <button 
                            onClick={() => handleDeleteClick(item)}
                            className="bg-red-100 text-red-500 rounded-full w-6 h-6 flex items-center justify-center shadow hover:bg-red-500 hover:text-white"
                        >
                            <i className="fas fa-trash-alt text-[10px]"></i>
                        </button>
                    </div>

                  {/* Location */}
                  <div className="relative p-1.5 flex items-center">
                    {editingLocationId === item.id ? (
                      <div className="absolute top-0 left-0 z-30 bg-white shadow-xl border border-indigo-200 p-2 rounded-lg w-48">
                         <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                            {Object.keys(hierarchy).map(loc => (
                              <button key={loc} onClick={() => applyLocation(item.id, loc)} className="text-left text-xs p-1 hover:bg-indigo-50 rounded">
                                {loc}
                              </button>
                            ))}
                         </div>
                      </div>
                    ) : (
                      <div className="w-full h-full whitespace-pre-wrap break-words font-bold cursor-pointer" onClick={() => setEditingLocationId(item.id)}>
                         <span className={item.location.includes('Needs Fix') ? 'text-red-500' : ''}>{item.location}</span>
                      </div>
                    )}
                  </div>

                  {/* Component */}
                  <div className="relative p-1.5 flex items-center">
                    {editingComponentId === item.id ? (
                      <div className="absolute top-0 left-0 z-20 bg-white shadow-xl border border-indigo-200 p-2 rounded-lg w-48">
                         <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                            {(hierarchy[item.location] || []).map(sub => (
                              <button key={sub} onClick={() => applyComponent(item.id, sub)} className="text-left text-xs p-1 hover:bg-indigo-50 rounded">
                                {sub}
                              </button>
                            ))}
                         </div>
                      </div>
                    ) : (
                      <div className="w-full h-full whitespace-pre-wrap break-words cursor-pointer" onClick={() => setEditingComponentId(item.id)}>
                        {item.component || item.component}
                      </div>
                    )}
                  </div>

                  {/* Merged Area / CH */}
                  <div className="relative p-1.5">
                     <textarea
                      value={item.structuralElement || item.chainage ? `${item.structuralElement || ''} ${item.chainage || ''}`.trim() : item.chainageOrArea}
                      onChange={(e) => {
                          handleLocalChange(item.id, 'structuralElement', e.target.value);
                          handleLocalChange(item.id, 'chainage', ''); 
                      }}
                      onBlur={(e) => handleBlur(item.id, 'structuralElement', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none font-medium text-slate-700 whitespace-pre-wrap break-words overflow-hidden"
                      style={{ minHeight: '1.5em' }}
                      onInput={(e) => {
                          e.currentTarget.style.height = 'auto';
                          e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                      }}
                    />
                  </div>

                  {/* Description */}
                  <div className="relative p-1.5">
                     <textarea
                      value={item.activityDescription}
                      onChange={(e) => handleLocalChange(item.id, 'activityDescription', e.target.value)}
                      onBlur={(e) => handleBlur(item.id, 'activityDescription', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none whitespace-pre-wrap break-words overflow-hidden"
                      style={{ minHeight: '1.5em' }}
                      onInput={(e) => {
                          e.currentTarget.style.height = 'auto';
                          e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                      }}
                      // Initialize height on render
                      ref={el => { if(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                    />
                  </div>

                  {/* Next */}
                  <div className="relative p-1.5">
                     <textarea
                      value={item.plannedNextActivity}
                      onChange={(e) => handleLocalChange(item.id, 'plannedNextActivity', e.target.value)}
                      onBlur={(e) => handleBlur(item.id, 'plannedNextActivity', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none whitespace-pre-wrap break-words overflow-hidden"
                      style={{ minHeight: '1.5em' }}
                      onInput={(e) => {
                          e.currentTarget.style.height = 'auto';
                          e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                      }}
                    />
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

      <style>{`
         @media print {
            body * {
                visibility: hidden;
            }
            #printable-report, #printable-report * {
                visibility: visible;
            }
            #printable-report {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                margin: 0 !important;
                padding: 10mm !important;
                width: 100% !important;
                height: auto !important;
                transform: none !important;
                box-shadow: none !important;
                border: none !important;
                background: white !important;
                overflow: visible !important;
            }
            .no-print {
                display: none !important;
            }
            /* Reset parent containers */
            html, body, #root {
                margin: 0;
                padding: 0;
                background: white;
                height: auto;
                overflow: visible;
            }
            .no-print-padding {
                padding: 0 !important;
                background: white !important;
                border: none !important;
            }
         }
      `}</style>
    </div>
  );
};
