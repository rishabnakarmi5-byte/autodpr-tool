
import React, { useState, useRef, useEffect } from 'react';
import { Reorder } from 'motion/react';
import { DailyReport, DPRItem, Photo } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';
import { RawInputsModal } from './RawInputsModal';
import { collection, query, where, onSnapshot, getFirestore, doc, updateDoc } from 'firebase/firestore';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import html2pdf from 'html2pdf.js';

const db = getFirestore();

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
  onNavigateDate: (direction: 'prev' | 'next') => void;
  onGoToHistory: () => void;
}

export const ReportTable: React.FC<ReportTableProps> = ({ report, onUndo, canUndo, onRedo, canRedo, onInspectItem, onUpdateNote, onAddManualItem, onReorderEntries, onNavigateDate, onGoToHistory }) => {
  const [fontSize, setFontSize] = useState(12);
  const [showRawInputs, setShowRawInputs] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isRearranging, setIsRearranging] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const photoIds = report.entries.flatMap(e => e.photoIds || []);
    if (photoIds.length === 0) {
        setPhotos([]);
        return;
    }
    
    // Firestore 'in' query supports up to 30 elements
    const chunks = [];
    for (let i = 0; i < photoIds.length; i += 30) {
        chunks.push(photoIds.slice(i, i + 30));
    }
    
    const unsubscribes = chunks.map(chunk => {
        const q = query(collection(db, 'photos'), where('id', 'in', chunk));
        return onSnapshot(q, (snapshot) => {
            const newPhotos = snapshot.docs.map(doc => doc.data() as Photo);
            
            // Update state by combining all chunks, ensuring we only have photos that exist in the current report
            setPhotos(prev => {
                const otherChunksPhotos = prev.filter(p => !chunk.includes(p.id));
                return [...otherChunksPhotos, ...newPhotos].filter(p => photoIds.includes(p.id));
            });
        });
    });
    
    return () => unsubscribes.forEach(unsub => unsub());
  }, [report.entries]);

  const updatePhotoCaption = async (photoId: string, caption: string) => {
      const photoRef = doc(db, 'photos', photoId);
      const [location, component] = caption.split(' -> ');
      await updateDoc(photoRef, { location, component });
  };

  const downloadAllPhotos = async () => {
      const zip = new JSZip();
      for (const photo of photos) {
          const response = await fetch(photo.url);
          const blob = await response.blob();
          zip.file(`${photo.id}.jpg`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `report_photos_${report.date}.zip`);
  };

  const exportToPDF = async () => {
      if (!reportRef.current) return;
      
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `DPR_${report.date}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };
      
      html2pdf().set(opt).from(reportRef.current).save();
  };

  const exportToImage = async () => {
      if (!reportRef.current) return;
      
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `DPR_${report.date}.jpg`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };
      
      // html2pdf can export to image by changing the type
      html2pdf().set(opt).from(reportRef.current).toPdf().get('pdf').then((pdf: any) => {
        // This is a bit hacky, but html2pdf doesn't have a direct "to image" for the whole content easily
        // An alternative is taking a screenshot of just the printable-report div
      });

      // Alternative approach for JPG:
      import('html2canvas').then(html2canvas => {
          html2canvas.default(reportRef.current!, { scale: 2, useCORS: true }).then(canvas => {
              const link = document.createElement('a');
              link.download = `DPR_${report.date}.jpg`;
              link.href = canvas.toDataURL('image/jpeg', 0.98);
              link.click();
          });
      });
  };

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in relative pb-20">
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 no-print">
        <div className="flex gap-2 w-full md:w-auto justify-between md:justify-start">
          <div className="flex gap-2">
            <button onClick={() => onNavigateDate('prev')} className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"><i className="fas fa-chevron-left"></i></button>
            <button onClick={() => onNavigateDate('next')} className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"><i className="fas fa-chevron-right"></i></button>
            <button onClick={onGoToHistory} className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all text-xs font-bold">History</button>
          </div>
          <div className="flex gap-2">
            <button onClick={onUndo} disabled={!canUndo} className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-30 transition-all"><i className="fas fa-undo"></i></button>
            <button onClick={onRedo} disabled={!canRedo} className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-30 transition-all"><i className="fas fa-redo"></i></button>
          </div>
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
          <button onClick={exportToPDF} className="flex-1 md:flex-none bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-black transition-all text-sm">
            <i className="fas fa-file-pdf"></i> Export PDF
          </button>
          <button onClick={exportToImage} className="flex-1 md:flex-none bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all text-sm">
            <i className="fas fa-file-image"></i> Export JPG
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
        
        {report.note && report.note !== "No notes for this report." && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm w-full mt-6">
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
                {report.note}
              </div>
            )}
          </div>
        )}

        {photos.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm w-full mt-6">
                <div className="flex justify-between items-center mb-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Site Activity Photos</label>
                    <button onClick={downloadAllPhotos} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-widest no-print">Download All</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {photos.map(photo => (
                        <div key={photo.id} className="space-y-4 cursor-pointer" onClick={() => setSelectedPhoto(photo)}>
                            <img src={photo.url} alt="Site Activity" className="w-full aspect-video object-cover rounded-2xl shadow-lg" referrerPolicy="no-referrer" />
                            <input 
                                type="text" 
                                value={report.entries.find(e => e.photoIds?.includes(photo.id)) ? 
                                       `${report.entries.find(e => e.photoIds?.includes(photo.id))?.location} -> ${report.entries.find(e => e.photoIds?.includes(photo.id))?.component}` : 
                                       'Caption'}
                                readOnly
                                className="w-full text-lg font-bold text-slate-900 bg-slate-100 p-4 rounded-lg border-none outline-none text-center"
                            />
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>
      </div>

      {selectedPhoto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm" onClick={() => setSelectedPhoto(null)}>
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Associated Master Records</h2>
            <div className="space-y-2">
              {report.entries.filter(e => e.photoIds?.includes(selectedPhoto.id)).map(entry => (
                <div key={entry.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
                  <div>
                    <div className="font-bold text-indigo-600">{entry.location} - {entry.component}</div>
                    <div className="text-sm">{entry.activityDescription}</div>
                  </div>
                  <button 
                    onClick={() => {
                        const newPhotoIds = entry.photoIds?.filter(id => id !== selectedPhoto.id) || [];
                        onUpdateRow(entry.id, { photoIds: newPhotoIds });
                        setSelectedPhoto(null);
                    }}
                    className="text-red-500 hover:text-red-700 p-2"
                  >
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setSelectedPhoto(null)} className="mt-6 w-full bg-slate-900 text-white py-2 rounded-lg font-bold">Close</button>
          </div>
        </div>
      )}

      <RawInputsModal 
        date={report.date} 
        isOpen={showRawInputs} 
        onClose={() => setShowRawInputs(false)} 
      />
    </div>
  );
};
