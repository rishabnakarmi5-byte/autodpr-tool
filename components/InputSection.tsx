import React, { useState, useRef } from 'react';
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
  const [uploadProgress, setUploadProgress] = useState<{current: number, total: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dateObj = new Date(currentDate);
  const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const nepaliDate = getNepaliDate(currentDate);

  // --- Fast Compression Logic (Single Pass) ---
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          
          // FAST CONFIG: Max 1024px dimension.
          // This resolution is large enough for PDF reports but small enough for fast processing.
          const MAX_WIDTH = 1024; 
          const MAX_HEIGHT = 1024;
          
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions maintaining aspect ratio
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          // Draw once
          ctx?.drawImage(img, 0, 0, width, height);

          // Export once at 60% quality (0.6).
          // 1024px at 0.6 quality usually results in ~150kb - 250kb files.
          // This avoids the slow "while loop" checking size repeatedly.
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
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
      setStep(2); // Move to photo upload step
    } catch (err) {
      console.error(err);
      setError("Failed to process text. Ensure your connection is stable.");
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
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCaptionChange = (id: string, caption: string) => {
    setPendingPhotos(prev => prev.map(p => p.id === id ? { ...p, caption } : p));
  };

  const handleRemovePendingPhoto = (id: string) => {
    setPendingPhotos(prev => prev.filter(p => p.id !== id));
  };

  const handleFinalize = async () => {
    if (uploadProgress) return; // Prevent double click

    const finalPhotos: ReportPhoto[] = [];
    
    // Start Progress
    if (pendingPhotos.length > 0) {
      setUploadProgress({ current: 0, total: pendingPhotos.length });

      try {
        for (let i = 0; i < pendingPhotos.length; i++) {
          const p = pendingPhotos[i];
          
          // 1. Compress (Fast)
          const compressedBase64 = await compressImage(p.file);
          
          // 2. Upload
          const storagePath = `reports/${currentDate}/${p.id}.jpg`;
          const downloadUrl = await uploadReportImage(compressedBase64, storagePath);

          // 3. Add to final list
          finalPhotos.push({
            id: p.id,
            url: downloadUrl,
            caption: p.caption || 'Site Photo',
            uploadedBy: user?.displayName || 'Unknown',
            timestamp: new Date().toISOString()
          });

          // Update progress
          setUploadProgress({ current: i + 1, total: pendingPhotos.length });
        }
      } catch (e) {
        console.error(e);
        setError("Failed to upload some photos. Please check connection.");
        setUploadProgress(null);
        return;
      }
    }

    onItemsAdded(generatedItems, finalPhotos);
    
    // Clean up object URLs to avoid memory leaks
    pendingPhotos.forEach(p => URL.revokeObjectURL(p.preview));

    // Reset
    setRawText('');
    setPendingPhotos([]);
    setGeneratedItems([]);
    setUploadProgress(null);
    setStep(1);
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
               <i className="fas fa-brain text-purple-500"></i> Smart Engine Ready
             </div>
           </div>
           {/* Hidden signature */}
           <div className="absolute bottom-1 right-1">
             <span className="text-white text-[1px] opacity-[0.01] select-none">built by Rishab Nakarmi</span>
           </div>
        </div>
      </div>

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
                <p className="text-xs text-slate-400 mt-1">Select multiple files at once. Auto-compression on finalize.</p>
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
                      <span>Compressing & Uploading...</span>
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
                     <span><i className="fas fa-circle-notch fa-spin mr-2"></i> Processing...</span>
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