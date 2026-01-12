import React, { useState, useRef, useEffect } from 'react';
import { parseConstructionData } from '../services/geminiService';
import { DPRItem, ReportPhoto } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';
import { User } from 'firebase/auth';
import { uploadReportImage } from '../services/firebaseService';

interface InputSectionProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  onItemsAdded: (items: DPRItem[], photos?: ReportPhoto[]) => void;
  entryCount: number;
  user: User | null;
}

interface PendingPhoto {
  id: string;
  file: File;
  preview: string;
  caption: string;
}

export const InputSection: React.FC<InputSectionProps> = ({ currentDate, onDateChange, onItemsAdded, entryCount, user }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [rawText, setRawText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedItems, setGeneratedItems] = useState<DPRItem[]>([]);
  
  // Photo State
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{current: number, total: number, status: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debugging State
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const dateObj = new Date(currentDate);
  const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const nepaliDate = getNepaliDate(currentDate);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setDebugLogs(prev => [`[${time}] ${msg}`, ...prev]);
    console.log(`[DPR DEBUG] ${msg}`);
  };

  // --- Fast & Safe Resize Logic ---
  const resizeImageToBlob = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      // 1. SKIP IF FILE IS ALREADY SMALL (< 500KB)
      // This prevents unnecessary processing for small images which often causes the "stuck" issue.
      if (file.size < 500 * 1024) {
         addLog(`File small (${(file.size / 1024).toFixed(1)} KB). Skipping resize.`);
         resolve(file);
         return;
      }

      addLog(`Starting resize for: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // FAST CONFIG: Max 800px. This is instant on most phones.
          const MAX_SIZE = 800; 
          let width = img.width;
          let height = img.height;

          // 2. SKIP IF DIMENSIONS ARE WITHIN LIMITS
          if (width <= MAX_SIZE && height <= MAX_SIZE) {
             addLog(`Dimensions (${width}x${height}) OK. Skipping resize.`);
             resolve(file);
             return;
          }

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error("Canvas Context failed"));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Export as Blob directly (better than base64 string for memory)
          canvas.toBlob((blob) => {
            if (blob) {
               addLog(`Resize success. New size: ${(blob.size / 1024).toFixed(1)} KB`);
               resolve(blob);
            } else {
               reject(new Error("Canvas toBlob returned null"));
            }
          }, 'image/jpeg', 0.7); // 70% quality
        };
        img.onerror = (err) => reject(new Error("Image object failed to load"));
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(new Error("FileReader failed"));
      reader.readAsDataURL(file);
    });
  };

  const handleProcess = async () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);
    setError(null);
    try {
      const parsedData = await parseConstructionData(rawText, instructions);
      const newItems: DPRItem[] = parsedData.map(item => ({ 
        ...item, 
        id: crypto.randomUUID(),
        createdBy: user?.displayName || user?.email || 'Unknown' 
      }));
      setGeneratedItems(newItems);
      setStep(2); 
    } catch (err: any) {
      console.error(err);
      setError("Failed to process text. Ensure your connection is stable.");
      addLog(`Text processing error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newPhotos: PendingPhoto[] = Array.from(e.target.files).map((file: File) => {
        const preview = URL.createObjectURL(file);
        return {
          id: crypto.randomUUID(),
          file,
          preview,
          caption: ''
        };
      });
      setPendingPhotos(prev => [...prev, ...newPhotos]);
      addLog(`Selected ${e.target.files.length} new photos.`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCaptionChange = (id: string, caption: string) => {
    setPendingPhotos(prev => prev.map(p => p.id === id ? { ...p, caption } : p));
  };

  const handleRemovePendingPhoto = (id: string) => {
    setPendingPhotos(prev => prev.filter(p => p.id !== id));
  };

  const handleFinalize = async () => {
    if (uploadProgress) return; 

    setDebugLogs([]); // Clear previous logs
    setShowDebug(true); // Auto-show logs on start
    addLog("--- Starting Batch Process ---");
    
    const finalPhotos: ReportPhoto[] = [];
    const total = pendingPhotos.length;
    
    if (total > 0) {
      setUploadProgress({ current: 0, total, status: 'Starting...' });

      // SEQUENTIAL LOOP (Not parallel) to allow UI updates and prevent freezing
      for (let i = 0; i < total; i++) {
        const p = pendingPhotos[i];
        
        try {
          // 1. Resize
          setUploadProgress({ current: i + 1, total, status: `Resizing photo ${i+1}...` });
          // Add a small delay to let UI render the progress update
          await new Promise(r => setTimeout(r, 50)); 
          
          let blobToUpload: Blob;
          try {
            blobToUpload = await resizeImageToBlob(p.file);
          } catch (resizeErr: any) {
            addLog(`Resize failed for ${p.file.name}: ${resizeErr.message}. Uploading original.`);
            blobToUpload = p.file; // Fallback to original
          }

          // 2. Upload
          setUploadProgress({ current: i + 1, total, status: `Uploading photo ${i+1}...` });
          addLog(`Uploading ${p.id}...`);
          
          const storagePath = `reports/${currentDate}/${p.id}.jpg`;
          const downloadUrl = await uploadReportImage(blobToUpload, storagePath);
          
          addLog(`Upload complete: ${downloadUrl.substring(0, 20)}...`);

          finalPhotos.push({
            id: p.id,
            url: downloadUrl,
            caption: p.caption || 'Site Photo',
            uploadedBy: user?.displayName || 'Unknown',
            timestamp: new Date().toISOString()
          });

        } catch (e: any) {
          addLog(`ERROR on photo ${i+1}: ${e.message}`);
          console.error(e);
          // Don't abort the whole batch, just skip this one
        }
      }
    }

    addLog(`Batch complete. Success: ${finalPhotos.length}/${total}`);

    if (finalPhotos.length === 0 && total > 0) {
      setError("All uploads failed. Please check the debug log below.");
      setUploadProgress(null);
      return; 
    }

    onItemsAdded(generatedItems, finalPhotos);
    
    // Cleanup
    pendingPhotos.forEach(p => URL.revokeObjectURL(p.preview));
    setRawText('');
    setPendingPhotos([]);
    setGeneratedItems([]);
    setUploadProgress(null);
    setStep(1);
    setShowDebug(false);
  };

  return (
    <div className="space-y-8 animate-fade-in relative">
      
      {/* Dashboard Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-2xl p-6 text-white shadow-xl shadow-indigo-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <i className="fas fa-calendar-alt text-9xl"></i>
          </div>
          <div className="relative z-10">
            <h2 className="text-indigo-100 text-sm font-semibold uppercase tracking-wider mb-1">Active Report</h2>
            <div className="flex flex-col mb-2">
               <h1 className="text-3xl font-bold">{formattedDate}</h1>
               <h2 className="text-lg text-indigo-200 font-medium mt-1">{nepaliDate}</h2>
            </div>
            <div className="flex items-center gap-4 mt-4">
               <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/10">
                 <span className="text-xs text-indigo-100 block">Total Entries</span>
                 <span className="text-xl font-bold">{entryCount}</span>
               </div>
               <div className="flex-1">
                 <label className="text-xs text-indigo-200 block mb-1">Change Date</label>
                 <input 
                  type="date" 
                  value={currentDate}
                  onChange={(e) => onDateChange(e.target.value)}
                  className="bg-white/10 border border-white/20 text-white text-sm rounded px-3 py-1.5 focus:outline-none focus:bg-white/20 w-full md:w-auto"
                />
               </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-lg shadow-slate-200/50 flex flex-col justify-center relative overflow-hidden">
           <h3 className="text-slate-500 text-sm font-medium mb-2">System Status</h3>
           <div className="space-y-2">
             <div className="flex items-center text-sm text-slate-600 gap-2">
               <i className="fas fa-check-circle text-green-500"></i> Cloud Sync Active
             </div>
             <div className="flex items-center text-sm text-slate-600 gap-2">
               <i className="fas fa-bug text-orange-500"></i> 
               <button onClick={() => setShowDebug(!showDebug)} className="hover:underline">
                 Diagnostic Mode {showDebug ? 'ON' : 'OFF'}
               </button>
             </div>
           </div>
        </div>
      </div>

      {/* DEBUG CONSOLE */}
      {showDebug && (
        <div className="bg-slate-900 text-green-400 p-4 rounded-xl font-mono text-xs max-h-40 overflow-y-auto border border-slate-700 shadow-inner">
           <div className="flex justify-between border-b border-slate-700 pb-2 mb-2">
             <span className="font-bold">Diagnostic Log</span>
             <button onClick={() => setDebugLogs([])} className="text-slate-500 hover:text-white">Clear</button>
           </div>
           {debugLogs.length === 0 && <span className="text-slate-600 opacity-50">Waiting for actions...</span>}
           {debugLogs.map((log, i) => (
             <div key={i}>{log}</div>
           ))}
        </div>
      )}

      {/* STEP 1: TEXT INPUT */}
      {step === 1 && (
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <i className="fab fa-whatsapp text-green-500 text-xl"></i> 
              Data Parser
            </h2>
            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded font-medium">Step 1 of 2</span>
          </div>
          
          <div className="p-6 md:p-8 space-y-6">
            <div>
               <label className="block text-sm font-medium text-slate-700 mb-2">Paste Site Engineer's Update</label>
               <div className="relative group">
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Paste text here... e.g., 'Headworks: Apron concreting 45m3 done...'"
                    className="w-full h-40 p-5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none transition-all resize-none font-mono text-sm leading-relaxed"
                  />
                  <div className="absolute top-4 right-4 flex gap-2">
                     {rawText && (
                        <button 
                          onClick={() => setRawText('')}
                          className="p-1.5 text-slate-400 hover:text-red-500 transition-colors bg-white rounded shadow-sm border border-slate-200"
                          title="Clear text"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                     )}
                  </div>
               </div>
            </div>

            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
               <label className="block text-xs font-bold text-indigo-800 mb-2 uppercase tracking-wide">
                 <i className="fas fa-robot mr-1"></i> Special Instructions (Optional)
               </label>
               <input
                  type="text"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. 'Split separate locations into different rows' or 'Ignore safety mentions'"
                  className="w-full p-3 border border-indigo-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 focus:outline-none text-sm text-slate-700 placeholder-indigo-300"
               />
            </div>

            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm flex items-center border border-red-100 animate-pulse">
                <i className="fas fa-exclamation-triangle mr-3 text-lg"></i> {error}
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
               <p className="text-xs text-slate-400 hidden md:block">
                 <i className="fas fa-shield-alt mr-1"></i> Data processed securely
               </p>
               <button
                onClick={handleProcess}
                disabled={isProcessing || !rawText.trim()}
                className={`flex items-center px-8 py-3.5 rounded-xl font-bold text-white shadow-lg shadow-indigo-500/30 transition-all transform
                  ${isProcessing || !rawText.trim() 
                    ? 'bg-slate-300 shadow-none cursor-not-allowed translate-y-0' 
                    : 'bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0'
                  }`}
              >
                {isProcessing ? <i className="fas fa-circle-notch fa-spin mr-2"></i> : <i className="fas fa-wand-magic-sparkles mr-2"></i>}
                Analyze & Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: PHOTOS */}
      {step === 2 && (
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
           <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
             <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
               <i className="fas fa-camera text-indigo-500 text-xl"></i> 
               Bulk Photo Upload
             </h2>
             <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded font-medium">Step 2 of 2</span>
           </div>

           <div className="p-6 md:p-8 space-y-6">
             
             {/* Bulk Input */}
             <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors"
             >
                <i className="fas fa-images text-4xl text-indigo-300 mb-3"></i>
                <p className="text-indigo-600 font-medium">Click to select photos</p>
                <p className="text-xs text-slate-400 mt-1">Select multiple files at once. 
                   <span className="font-bold text-indigo-500 ml-1">Safe-Mode Enabled.</span>
                </p>
                <input 
                   type="file" 
                   multiple 
                   accept="image/*"
                   ref={fileInputRef}
                   className="hidden"
                   onChange={handleFilesSelect}
                />
             </div>

             {/* Photo Grid */}
             {pendingPhotos.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {pendingPhotos.map(p => (
                      <div key={p.id} className="flex gap-4 p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                         <div className="w-24 h-24 flex-shrink-0 bg-slate-100 rounded overflow-hidden relative">
                            <img src={p.preview} className="w-full h-full object-cover" alt="preview" />
                            <button 
                               onClick={() => handleRemovePendingPhoto(p.id)}
                               className="absolute top-1 right-1 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                            >
                               <i className="fas fa-times"></i>
                            </button>
                         </div>
                         <div className="flex-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Caption</label>
                            <textarea 
                               value={p.caption}
                               onChange={(e) => handleCaptionChange(p.id, e.target.value)}
                               placeholder="Enter caption..."
                               className="w-full mt-1 p-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-indigo-400 resize-none h-16"
                            />
                         </div>
                      </div>
                   ))}
                </div>
             )}

             {/* Progress Bar */}
             {uploadProgress && (
                <div className="space-y-2">
                   <div className="flex justify-between text-xs font-bold text-indigo-600">
                      <span>{uploadProgress.status}</span>
                      <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
                   </div>
                   <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                      <div 
                         className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" 
                         style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                      ></div>
                   </div>
                   <p className="text-center text-xs text-slate-400">Processing photo {uploadProgress.current} of {uploadProgress.total}</p>
                </div>
             )}

             <div className="flex justify-between items-center pt-4 border-t border-slate-100">
               <button 
                  onClick={() => setStep(1)} 
                  disabled={!!uploadProgress}
                  className="text-slate-500 font-bold text-sm hover:text-slate-700 disabled:opacity-50"
               >
                 Back
               </button>
               <button
                  onClick={handleFinalize}
                  disabled={!!uploadProgress}
                  className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-200 transition-all transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                  {uploadProgress ? (
                     <span><i className="fas fa-circle-notch fa-spin mr-2"></i> Working...</span>
                  ) : (
                     <span>Finalize Report <i className="fas fa-arrow-right ml-2"></i></span>
                  )}
               </button>
             </div>
           </div>
        </div>
      )}

    </div>
  );
};