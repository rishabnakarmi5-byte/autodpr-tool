
import React, { useState, useRef, useEffect } from 'react';
import { Reorder } from 'motion/react';
import { DailyReport, DPRItem, Photo } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';
import { RawInputsModal } from './RawInputsModal';
import { PhotoInspectionModal } from './PhotoInspectionModal';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebaseService';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import html2pdf from 'html2pdf.js';

interface ReportTableProps {
  report: DailyReport;
  reports: DailyReport[];
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

export const ReportTable: React.FC<ReportTableProps> = ({ 
  report, 
  reports,
  onDeleteItem,
  onUpdateItem,
  onUpdateRow,
  onUndo, 
  canUndo, 
  onRedo, 
  canRedo, 
  onInspectItem, 
  onUpdateNote, 
  onAddManualItem, 
  onReorderEntries, 
  onNavigateDate, 
  onGoToHistory 
}) => {
  const [fontSize, setFontSize] = useState(12);
  const [showRawInputs, setShowRawInputs] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isRearranging, setIsRearranging] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const photoIds = Array.from(new Set(report.entries.flatMap(e => e.photoIds || [])));
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
      await updateDoc(photoRef, { caption });
  };

  const downloadAllPhotos = async () => {
      const zip = new JSZip();
      let addedAny = false;
      
      const downloadPromises = photos.map(async (photo) => {
          try {
              const response = await fetch(photo.url, { mode: 'cors' });
              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
              const blob = await response.blob();
              zip.file(`${photo.id}.jpg`, blob);
              addedAny = true;
          } catch (err) {
              console.error(`Failed to download photo ${photo.id}:`, err);
          }
      });
      
      await Promise.all(downloadPromises);
      
      if (!addedAny) {
          alert("CRITICAL ERROR: Could not download any photos.\n\nThis is a SECURITY SETTING error. You must authorize your app domain in Firebase Storage CORS settings.\n\nInstructions:\n1. Open Google Cloud Shell (in Firebase/GCP Console)\n2. Copy the bucket name from Storage tab\n3. Run: gsutil cors set cors-json-file gs://your-bucket-name\n\nContact admin for more details.");
          return;
      }
      
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `report_photos_${report.date}.zip`);
  };

  const [exportPhotos, setExportPhotos] = useState<Record<string, string>>({});
  const [printingMode, setPrintingMode] = useState<'all' | 'no-photos'>('all');

  const preparePhotosForExport = async () => {
    const loadedPhotos: Record<string, string> = {};
    if (printingMode === 'no-photos') return loadedPhotos;
    
    const fetchPromises = photos.map(async (photo) => {
      try {
        // Fetch the image with a cache-buster and CORS mode
        const response = await fetch(`${photo.url}${photo.url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
          mode: 'cors',
          credentials: 'omit'
        });
        const blob = await response.blob();
        
        return new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            loadedPhotos[photo.id] = reader.result as string;
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        console.error(`Failed to pre-fetch photo ${photo.id} for export:`, err);
        return Promise.resolve();
      }
    });

    await Promise.all(fetchPromises);
    setExportPhotos(loadedPhotos);
    return loadedPhotos;
  };

  const exportToPDF = async () => {
      if (!reportRef.current) return;
      
      setIsPrinting(true);
      const base64Photos = await preparePhotosForExport();
      
      // Allow DOM to update with base64 images
      setTimeout(async () => {
          if (!reportRef.current) return;

          // --- INTENSE IMAGE LOADING VERIFICATION ---
          // Since we are using Base64 now, loading is near-instant, but we still verify
          const images = reportRef.current.querySelectorAll('img');
          const imagePromises = Array.from(images).map(elem => {
              const img = elem as HTMLImageElement;
              if (img.complete) return Promise.resolve();
              return new Promise((resolve) => {
                  img.onload = resolve;
                  img.onerror = resolve; 
              });
          });

          await Promise.all(imagePromises);
          await new Promise(resolve => setTimeout(resolve, 300));

          // --- SMART PAGE BREAK CALCULATION ---
          // A4 is 210x297mm. With 10mm margins, usable area is 190x277mm.
          // Ratio: 277/190 = 1.458
          const containerWidth = reportRef.current.offsetWidth;
          const pageHeightPx = containerWidth * 1.458;
          
          // Clear any old spacers
          reportRef.current.querySelectorAll('.print-spacer').forEach(el => el.remove());

          // Check for splits in atomic elements
          const avoidElements = reportRef.current.querySelectorAll('.avoid-break');
          avoidElements.forEach((el: any) => {
              const rect = el.getBoundingClientRect();
              const containerRect = reportRef.current!.getBoundingClientRect();
              
              const relativeTop = rect.top - containerRect.top;
              const relativeBottom = rect.bottom - containerRect.top;
              
              const startPage = Math.floor(relativeTop / pageHeightPx);
              const endPage = Math.floor((relativeBottom - 1) / pageHeightPx); // 1px buffer
              
              // If element spans multiple pages, push it to the IMMEDIATELY next one
              if (startPage !== endPage) {
                  const spacer = document.createElement('div');
                  spacer.className = 'print-spacer';
                  // Calculate height needed to reach the start of the VERY NEXT page
                  const nextPageStart = (startPage + 1) * pageHeightPx;
                  const neededHeight = nextPageStart - relativeTop;
                  
                  // Only add spacer if it's significant and doesn't exceed a full page
                  if (neededHeight > 2 && neededHeight < pageHeightPx) {
                      spacer.style.height = `${neededHeight}px`;
                      spacer.style.width = '100%';
                      el.parentNode.insertBefore(spacer, el);
                  }
              }
          });

          const opt = {
            margin: [10, 10, 10, 10] as [number, number, number, number],
            filename: `DPR_${report.date}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
            pagebreak: { mode: 'css' }
          };
          
          try {
              await html2pdf().set(opt).from(reportRef.current).save();
          } finally {
              setIsPrinting(false);
              // Clean up spacers after export
              reportRef.current?.querySelectorAll('.print-spacer').forEach(el => el.remove());
          }
      }, 250); 
  };

  const exportToImage = async () => {
      if (!reportRef.current) return;
      setIsPrinting(true);
      setPrintingMode('no-photos'); // As requested: JPG export should not include photos
      
      const base64Photos = await preparePhotosForExport();

      setTimeout(async () => {
          if (!reportRef.current) return;
          
          // Double check if elements are hidden
          const photosSection = reportRef.current.querySelector('.photos-section');
          if (photosSection) (photosSection as HTMLElement).style.display = 'none';

          // --- INTENSE IMAGE LOADING VERIFICATION ---
          const images = reportRef.current.querySelectorAll('img');
          const imagePromises = Array.from(images).map(elem => {
              const img = elem as HTMLImageElement;
              if (img.complete) return Promise.resolve();
              return new Promise((resolve) => {
                  img.onload = resolve;
                  img.onerror = resolve;
              });
          });

          await Promise.all(imagePromises);
          await new Promise(resolve => setTimeout(resolve, 300));

          import('html2canvas').then(html2canvas => {
              html2canvas.default(reportRef.current!, { 
                  scale: 2, 
                  useCORS: true, 
                  scrollY: 0,
                  allowTaint: false 
              }).then(canvas => {
                  const link = document.createElement('a');
                  link.download = `DPR_${report.date}.jpg`;
                  link.href = canvas.toDataURL('image/jpeg', 0.98);
                  link.click();
              }).catch(err => {
                  console.error("html2canvas export error:", err);
              }).finally(() => {
                  setIsPrinting(false);
                  setPrintingMode('all');
                  if (photosSection) (photosSection as HTMLElement).style.display = 'block';
              });
          });
      }, 250);
  };

  const handleRotatePhoto = async (photoId: string, currentRotation: number = 0) => {
    const newRotation = (currentRotation + 90) % 360;
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, rotation: newRotation } : p));
    if (selectedPhoto && selectedPhoto.id === photoId) {
      setSelectedPhoto(prev => prev ? { ...prev, rotation: newRotation } : null);
    }
    const { updatePhotoRotation } = await import('../services/photoService');
    await updatePhotoRotation(photoId, newRotation);
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
        <style>{`
          .avoid-break {
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          /* Specific fixes for table rows in chrome/html2canvas */
          tr.avoid-break {
            display: table-row !important;
          }
        `}</style>
        <div id="printable-report" className={`bg-white p-10 rounded-2xl border border-slate-100 transition-all origin-top ${isPrinting ? 'shadow-none' : 'shadow-2xl'}`} style={{ width: '100%' }}>
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
                className={`group border-b border-slate-900 hover:bg-indigo-50/50 cursor-pointer align-top text-black avoid-break ${isRearranging ? 'bg-indigo-50/20 select-none' : ''}`}
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
        
        {/* Conditional rendering for export: Remove empty note entirely from DOM if printing */}
        {(!isPrinting || (report.note && report.note.trim().length > 0)) && (
          <div className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm w-full mt-6 avoid-break ${!report.note || report.note.trim().length === 0 ? 'no-print' : ''}`}>
              <div className="flex justify-between items-center mb-3">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Daily Report Note</label>
              </div>
              <textarea 
                  value={report.note || ""}
                  onChange={e => onUpdateNote(e.target.value)}
                  placeholder="Enter 2-3 lines of note for this DPR..."
                  className="w-full min-h-24 p-5 bg-slate-50 rounded-xl border border-slate-200 outline-none text-sm font-medium transition-all placeholder:text-slate-300 resize-none"
              />
          </div>
        )}

        {photos.length > 0 && printingMode !== 'no-photos' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm w-full mt-6 avoid-break photos-section">
                <div className="flex justify-between items-center mb-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Site Activity Photos</label>
                    {!isPrinting && (
                      <button onClick={downloadAllPhotos} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-widest no-print">Download All</button>
                    )}
                </div>
                <div className={`grid gap-8 ${isPrinting ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                    {photos.map(photo => (
                        <div key={photo.id} className="space-y-4 avoid-break flex flex-col mb-4">
                            <div className={`w-full bg-slate-50 rounded-2xl overflow-hidden shadow-lg border border-slate-100 flex items-center justify-center min-h-[200px] ${isPrinting ? 'p-0 bg-white' : ''}`}>
                              <img 
                                src={isPrinting && exportPhotos[photo.id] ? exportPhotos[photo.id] : photo.url} 
                                alt="Site Activity" 
                                className={`w-full h-auto object-contain cursor-pointer transition-all hover:scale-[1.02] ${isPrinting ? 'max-h-[650px]' : 'max-h-[450px]'}`} 
                                style={{ transform: `rotate(${photo.rotation || 0}deg)` }}
                                referrerPolicy="no-referrer" 
                                onClick={() => setSelectedPhoto(photo)} 
                              />
                            </div>
                            <div className={`w-full font-bold text-slate-700 bg-slate-50 p-4 rounded-xl text-center border border-slate-100 ${isPrinting ? 'text-lg' : 'text-lg'}`}>
                                {photo.caption || (() => {
                                    const item = report.entries.find(e => e.photoIds?.includes(photo.id));
                                    if (!item) return 'Site Activity Photo';
                                    return `${item.location} > ${item.component || 'Unclassified'}`;
                                })()}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>
      </div>

      {selectedPhoto && (
        <PhotoInspectionModal 
            photo={selectedPhoto}
            reports={reports}
            onClose={() => setSelectedPhoto(null)}
            onInspectItem={onInspectItem}
            onUpdatePhoto={(updated) => setPhotos(prev => prev.map(p => p.id === updated.id ? updated : p))}
            onUpdateReport={onUpdateRow}
        />
      )}

      <RawInputsModal 
        date={report.date} 
        isOpen={showRawInputs} 
        onClose={() => setShowRawInputs(false)} 
      />
    </div>
  );
};
