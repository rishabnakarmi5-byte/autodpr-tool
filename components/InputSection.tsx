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

export const InputSection: React.FC<InputSectionProps> = ({ currentDate, onDateChange, onItemsAdded, entryCount, user }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [rawText, setRawText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedItems, setGeneratedItems] = useState<DPRItem[]>([]);
  
  // Photo State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dateObj = new Date(currentDate);
  const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const nepaliDate = getNepaliDate(currentDate);

  // --- Compression Logic ---
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1280; // Reasonable max width for report
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Start with 0.7 quality
          let quality = 0.7;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          
          // Simple loop to reduce quality if still too big (approx check)
          // Base64 length * 0.75 is approx byte size
          while (dataUrl.length * 0.75 > 300000 && quality > 0.1) {
             quality -= 0.1;
             dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
     if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        setIsCompressing(true);
        try {
          const compressedBase64 = await compressImage(file);
          setPreviewUrl(compressedBase64);
          setSelectedFile(file); // Keep original ref if needed, but we use base64
        } catch (e) {
          setError("Failed to process image");
        } finally {
          setIsCompressing(false);
        }
     }
  };

  const handleAddPhoto = async () => {
    if (!previewUrl) return;
    
    const newPhoto: ReportPhoto = {
      id: crypto.randomUUID(),
      url: previewUrl, // Currently base64, ideally upload to storage immediately or later. 
                       // For this flow, we will upload to storage during this step to keep the object clean.
      caption: caption || 'Site Photo',
      uploadedBy: user?.displayName || 'Unknown',
      timestamp: new Date().toISOString()
    };

    // Upload to Firebase Storage immediately to save space in Firestore document
    try {
       setIsCompressing(true); // Reuse loading state
       const storagePath = `reports/${currentDate}/${newPhoto.id}.jpg`;
       const downloadUrl = await uploadReportImage(previewUrl, storagePath);
       
       newPhoto.url = downloadUrl; // Swap base64 for storage URL
       
       setPhotos([...photos, newPhoto]);
       setPreviewUrl(null);
       setCaption('');
       setSelectedFile(null);
       if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
       setError("Failed to upload photo to cloud storage.");
    } finally {
       setIsCompressing(false);
    }
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos(photos.filter(p => p.id !== id));
  };

  const handleFinalize = () => {
    onItemsAdded(generatedItems, photos);
    // Reset
    setRawText('');
    setPhotos([]);
    setGeneratedItems([]);
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
               Site Photos
             </h2>
             <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded font-medium">Step 2 of 2</span>
           </div>

           <div className="p-6 md:p-8 space-y-6">
             
             {/* New Photo Input */}
             <div className="bg-slate-50 p-6 rounded-xl border border-dashed border-slate-300">
               <div className="flex flex-col md:flex-row gap-6 items-start">
                  
                  {/* Image Preview / Input */}
                  <div className="w-full md:w-1/3">
                    {previewUrl ? (
                      <div className="relative rounded-lg overflow-hidden aspect-video border border-slate-200">
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                        <button 
                          onClick={() => { setPreviewUrl(null); setSelectedFile(null); }}
                          className="absolute top-2 right-2 bg-white/80 p-1.5 rounded-full text-red-500 hover:bg-white transition-colors"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ) : (
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full aspect-video flex flex-col items-center justify-center bg-white rounded-lg border border-slate-200 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all"
                      >
                         <i className="fas fa-cloud-upload-alt text-3xl text-slate-300 mb-2"></i>
                         <span className="text-sm text-slate-500">Click to upload photo</span>
                         <span className="text-[10px] text-slate-400 mt-1">Auto-compressed to &lt;300KB</span>
                      </div>
                    )}
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/*"
                      onChange={handleFileSelect}
                    />
                  </div>

                  {/* Caption & Add Button */}
                  <div className="flex-1 w-full space-y-4">
                     <div>
                       <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Caption</label>
                       <input 
                         type="text" 
                         value={caption}
                         onChange={(e) => setCaption(e.target.value)}
                         placeholder="e.g. Rebar work at Headworks"
                         className="w-full p-3 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                       />
                     </div>
                     <button
                       onClick={handleAddPhoto}
                       disabled={!previewUrl || isCompressing}
                       className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 transition-colors"
                     >
                        {isCompressing ? 'Compressing & Uploading...' : 'Add Photo'}
                     </button>
                  </div>
               </div>
             </div>

             {/* Photo List */}
             {photos.length > 0 && (
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 {photos.map(p => (
                   <div key={p.id} className="relative group bg-white border border-slate-200 rounded-lg overflow-hidden">
                      <img src={p.url} alt="Added" className="w-full h-32 object-cover" />
                      <div className="p-2 text-xs text-slate-600 truncate">{p.caption}</div>
                      <button 
                        onClick={() => handleRemovePhoto(p.id)}
                        className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                   </div>
                 ))}
               </div>
             )}

             <div className="flex justify-between items-center pt-4 border-t border-slate-100">
               <button onClick={() => setStep(1)} className="text-slate-500 font-bold text-sm hover:text-slate-700">
                 Back
               </button>
               <button
                  onClick={handleFinalize}
                  className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-200 transition-all transform hover:-translate-y-1"
               >
                  Generate Final Report <i className="fas fa-arrow-right ml-2"></i>
               </button>
             </div>
           </div>
        </div>
      )}

    </div>
  );
};