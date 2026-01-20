
import React, { useState, useEffect, useRef } from 'react';
import { DailyReport, DPRItem, QuantityEntry } from '../types';
import { addQuantity } from '../services/firebaseService';
import { getNepaliDate } from '../utils/nepaliDate';

interface ReportTableProps {
  report: DailyReport;
  onDeleteItem: (id: string) => void;
  onUpdateItem: (id: string, field: keyof DPRItem, value: string) => void;
  onUpdateAllEntries?: (entries: DPRItem[]) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  hierarchy: Record<string, string[]>;
}

export const ReportTable: React.FC<ReportTableProps> = ({ report, onDeleteItem, onUpdateItem, onUpdateAllEntries, onUndo, canUndo, hierarchy }) => {
  
  const [entries, setEntries] = useState<DPRItem[]>(report.entries);
  const [fontSize, setFontSize] = useState<number>(12);
  const [isExporting, setIsExporting] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);
  
  // Paper Settings
  const [paperSize, setPaperSize] = useState<'a4' | 'a3' | 'a2' | 'a1'>('a4');
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
      a3: { w: '297mm', h: '420mm' },
      a2: { w: '420mm', h: '594mm' },
      a1: { w: '594mm', h: '841mm' }
  };
  
  const currentDimensions = orientation === 'portrait' 
      ? paperStyles[paperSize] 
      : { w: paperStyles[paperSize].h, h: paperStyles[paperSize].w };

  const handlePrint = () => {
    // Inject print styles dynamically
    const style = document.createElement('style');
    style.innerHTML = `@page { size: ${paperSize.toUpperCase()} ${orientation}; margin: 0; }`;
    style.id = 'print-style-override';
    document.head.appendChild(style);
    
    window.print();
    
    setTimeout(() => {
        const el = document.getElementById('print-style-override');
        if(el) el.remove();
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
      <div className="flex flex-col xl:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 gap-6">
        <div>
           <h2 className="text-xl font-bold text-slate-800">Final Report</h2>
           <p className="text-sm text-slate-500 mt-1">
             Drag rows to reorder.
           </p>
        </div>

        {/* Controls */}
        <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto">
          
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
             <select 
                value={paperSize} 
                onChange={(e) => setPaperSize(e.target.value as any)}
                className="bg-transparent text-sm font-bold text-slate-700 outline-none"
             >
                 <option value="a4">A4</option>
                 <option value="a3">A3</option>
                 <option value="a2">A2</option>
                 <option value="a1">A1</option>
             </select>
             <button onClick={() => setOrientation(o => o === 'portrait' ? 'landscape' : 'portrait')} className="text-slate-500 hover:text-indigo-600">
                 <i className={`fas fa-${orientation === 'portrait' ? 'file' : 'file-image'}`}></i>
             </button>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
             <i className="fas fa-search-plus text-slate-400 text-xs"></i>
             <input 
                 type="range" min="0.5" max="1.5" step="0.1" value={zoom} 
                 onChange={e => setZoom(parseFloat(e.target.value))}
                 className="w-20"
             />
          </div>

          <button
             onClick={() => setIsDragMode(!isDragMode)}
             className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 border w-full md:w-auto justify-center transition-colors ${
               isDragMode 
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
             }`}
          >
             {isDragMode ? <i className="fas fa-check"></i> : <i className="fas fa-arrows-up-down"></i>}
          </button>

          <button 
              onClick={handlePrint}
              className="flex items-center justify-center px-4 py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-black transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              <i className="fas fa-print mr-2"></i> Print / PDF
          </button>
        </div>
      </div>

      {/* Printable Area Wrapper */}
      <div className="overflow-auto bg-slate-200/50 p-4 md:p-8 rounded-2xl border border-slate-200 text-center flex justify-center">
        
        <div 
          className="report-page bg-white p-[15mm] shadow-2xl text-left relative mb-8 transition-all duration-300 origin-top"
          style={{ 
              width: currentDimensions.w, 
              minHeight: currentDimensions.h, 
              transform: `scale(${zoom})`
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
            <div className="grid grid-cols-12 border-b-2 border-black bg-gray-200 divide-x-2 divide-black font-bold text-center text-xs uppercase tracking-wide">
              <div className="col-span-2 p-2 flex items-center justify-center">Location</div>
              <div className="col-span-2 p-2 flex items-center justify-center">Component</div>
              <div className="col-span-1 p-2 flex items-center justify-center">Area</div>
              <div className="col-span-1 p-2 flex items-center justify-center">CH / EL</div>
              <div className="col-span-4 p-2 flex items-center justify-center">Activity Description</div>
              <div className="col-span-2 p-2 flex items-center justify-center">Next Plan</div>
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
                  className={`grid grid-cols-12 divide-x divide-black text-xs leading-relaxed group hover:bg-blue-50/10 transition-colors relative
                    ${index !== entries.length - 1 ? 'border-b border-black' : ''}
                    ${isDragMode ? 'cursor-move' : ''}
                  `}
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
                  <div className="col-span-2 p-1.5 relative">
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
                         <div className={`w-full h-full min-h-[24px] whitespace-pre-wrap cursor-pointer font-bold ${item.location.includes('Needs Fix') ? 'text-red-500' : ''}`} style={{ fontSize: `${fontSize}px` }}>
                            {item.location}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Component */}
                  <div className="col-span-2 p-1.5 relative">
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
                        <div className="w-full h-full min-h-[24px] whitespace-pre-wrap cursor-pointer" style={{ fontSize: `${fontSize}px` }}>
                            {item.component || item.component}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Area */}
                  <div className="col-span-1 p-1.5 relative">
                     <textarea
                      value={item.structuralElement || ''}
                      onChange={(e) => handleLocalChange(item.id, 'structuralElement', e.target.value)}
                      onBlur={(e) => handleBlur(item.id, 'structuralElement', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none font-medium"
                      style={{ fontSize: `${fontSize}px` }}
                      placeholder="Area"
                    />
                  </div>

                  {/* CH / EL */}
                  <div className="col-span-1 p-1.5 relative">
                     <textarea
                      value={item.chainage || item.chainageOrArea || ''}
                      onChange={(e) => {
                          handleLocalChange(item.id, 'chainage', e.target.value);
                          // Keep fallback sync for now if needed, or drift apart
                          handleLocalChange(item.id, 'chainageOrArea', e.target.value); 
                      }}
                      onBlur={(e) => handleBlur(item.id, 'chainage', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none font-mono text-[10px]"
                      style={{ fontSize: `${fontSize}px` }}
                      placeholder="Pos"
                    />
                  </div>

                  {/* Description */}
                  <div className="col-span-4 p-1.5 relative">
                     <textarea
                      value={item.activityDescription}
                      onChange={(e) => handleLocalChange(item.id, 'activityDescription', e.target.value)}
                      onBlur={(e) => handleBlur(item.id, 'activityDescription', e.target.value)}
                      className="w-full h-full bg-transparent resize-none outline-none whitespace-pre-wrap"
                      style={{ fontSize: `${fontSize}px` }}
                    />
                  </div>

                  {/* Next */}
                  <div className="col-span-2 p-1.5 relative">
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

    </div>
  );
};
