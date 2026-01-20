
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
  const [fontSize, setFontSize] = useState<number>(11);
  const [rowPadding, setRowPadding] = useState<number>(6); // px
  const [descColWidth, setDescColWidth] = useState<number>(40); // Percentage for description column
  const [isExporting, setIsExporting] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);
  
  // Paper Settings
  const [paperSize, setPaperSize] = useState<'a4' | 'a3'>('a4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
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

  // Paper CSS Mapping
  const paperStyles = {
      a4: { w: '210mm', h: '297mm' },
      a3: { w: '297mm', h: '420mm' }
  };
  
  const currentDimensions = orientation === 'portrait' 
      ? paperStyles[paperSize] 
      : { w: paperStyles[paperSize].h, h: paperStyles[paperSize].w };

  // Dynamic Grid Template
  // We allocate fixed percentages to specific columns, and the rest adjust.
  // Location (~12%), Component (~12%), Area/CH (~12%), Next (~14%)
  // Description takes the rest (variable)
  const otherColsTotal = 12 + 12 + 12 + 14; 
  const currentDescWidth = Math.max(20, Math.min(60, descColWidth));
  
  // Normalize grid template columns
  const gridTemplate = `12fr 12fr 12fr ${currentDescWidth}fr 14fr`;

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
      <div className="flex flex-col xl:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 gap-4">
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
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-end">
          
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
             <button onClick={() => setOrientation(o => o === 'portrait' ? 'landscape' : 'portrait')} className="text-slate-500 hover:text-indigo-600 px-2" title="Orientation">
                 <i className={`fas fa-${orientation === 'portrait' ? 'file' : 'file-image'}`}></i>
             </button>
             <div className="w-px h-4 bg-slate-300"></div>
             <i className="fas fa-text-height text-slate-400 text-xs pl-1"></i>
             <input 
                 type="range" min="8" max="14" step="1" value={fontSize} 
                 onChange={e => setFontSize(parseInt(e.target.value))}
                 className="w-16"
                 title="Font Size"
             />
          </div>

          {/* Row Height Control */}
          <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
             <span className="text-[10px] font-bold text-slate-400 uppercase px-1">Row Height</span>
             <button onClick={() => setRowPadding(p => Math.max(2, p - 2))} className="w-6 h-6 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center">
                <i className="fas fa-minus text-[10px]"></i>
             </button>
             <button onClick={() => setRowPadding(p => Math.min(20, p + 2))} className="w-6 h-6 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center">
                <i className="fas fa-plus text-[10px]"></i>
             </button>
          </div>

          {/* Column Width Control */}
          <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
             <span className="text-[10px] font-bold text-slate-400 uppercase px-1">Desc. Width</span>
             <button onClick={() => setDescColWidth(w => Math.max(20, w - 5))} className="w-6 h-6 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center">
                <i className="fas fa-compress-alt text-[10px]"></i>
             </button>
             <button onClick={() => setDescColWidth(w => Math.min(60, w + 5))} className="w-6 h-6 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center">
                <i className="fas fa-expand-alt text-[10px]"></i>
             </button>
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
              <i className="fas fa-print mr-2"></i> Print
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
              width: currentDimensions.w, 
              minHeight: currentDimensions.h, 
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

          {/* Table */}
          <div className="border-2 border-black">
            {/* Table Header */}
            <div 
                className="grid border-b-2 border-black bg-gray-200 divide-x-2 divide-black font-bold text-center text-xs uppercase tracking-wide"
                style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="p-2 flex items-center justify-center">Location</div>
              <div className="p-2 flex items-center justify-center">Component</div>
              <div className="p-2 flex items-center justify-center">Area / CH</div>
              <div className="p-2 flex items-center justify-center">Activity Description</div>
              <div className="p-2 flex items-center justify-center">Next Plan</div>
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
                  className={`grid divide-x divide-black text-xs leading-relaxed group hover:bg-blue-50/10 transition-colors relative
                    ${index !== entries.length - 1 ? 'border-b border-black' : ''}
                    ${isDragMode ? 'cursor-move' : ''}
                  `}
                  style={{ gridTemplateColumns: gridTemplate }}
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
                  <div className="relative border-r border-black last:border-0" style={{ padding: `${rowPadding}px` }}>
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
                      <div className="relative w-full h-full" onClick={() => setEditingLocationId(item.id)}>
                         <div className={`w-full h-full whitespace-pre-wrap cursor-pointer font-bold ${item.location.includes('Needs Fix') ? 'text-red-500' : ''}`} style={{ fontSize: `${fontSize}px` }}>
                            {item.location}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Component */}
                  <div className="relative border-r border-black last:border-0" style={{ padding: `${rowPadding}px` }}>
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
                      <div className="relative w-full h-full" onClick={() => setEditingComponentId(item.id)}>
                        <div className="w-full h-full whitespace-pre-wrap cursor-pointer" style={{ fontSize: `${fontSize}px` }}>
                            {item.component || item.component}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Merged Area / CH */}
                  <div className="relative border-r border-black last:border-0" style={{ padding: `${rowPadding}px` }}>
                     <textarea
                      // Concatenate Area and Chainage for display
                      value={item.structuralElement || item.chainage ? `${item.structuralElement || ''} ${item.chainage || ''}`.trim() : item.chainageOrArea}
                      // Note: Editing here is tricky because we have one field but two data points.
                      // For now, allow editing the 'structuralElement' as a general 'Details' field if they type here.
                      onChange={(e) => {
                          handleLocalChange(item.id, 'structuralElement', e.target.value);
                          handleLocalChange(item.id, 'chainage', ''); // Clear chainage if manually edited here to avoid duplication
                      }}
                      onBlur={(e) => handleBlur(item.id, 'structuralElement', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none font-medium text-slate-700"
                      style={{ fontSize: `${fontSize}px` }}
                    />
                  </div>

                  {/* Description */}
                  <div className="relative border-r border-black last:border-0" style={{ padding: `${rowPadding}px` }}>
                     <textarea
                      value={item.activityDescription}
                      onChange={(e) => handleLocalChange(item.id, 'activityDescription', e.target.value)}
                      onBlur={(e) => handleBlur(item.id, 'activityDescription', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none whitespace-pre-wrap"
                      style={{ fontSize: `${fontSize}px` }}
                    />
                  </div>

                  {/* Next */}
                  <div className="relative" style={{ padding: `${rowPadding}px` }}>
                     <textarea
                      value={item.plannedNextActivity}
                      onChange={(e) => handleLocalChange(item.id, 'plannedNextActivity', e.target.value)}
                      onBlur={(e) => handleBlur(item.id, 'plannedNextActivity', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none"
                      style={{ fontSize: `${fontSize}px` }}
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
