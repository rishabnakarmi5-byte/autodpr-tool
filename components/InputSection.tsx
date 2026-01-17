import React, { useState } from 'react';
import { parseConstructionData } from '../services/geminiService';
import { DPRItem } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';

interface InputSectionProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  onItemsAdded: (items: DPRItem[], rawText: string) => void;
  onViewReport: () => void;
  entryCount: number;
  user: any;
}

export const InputSection: React.FC<InputSectionProps> = ({ currentDate, onDateChange, onItemsAdded, onViewReport, entryCount, user }) => {
  const [rawText, setRawText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Modal State: 0 = closed, 1 = success, 2 = announcement
  const [modalStep, setModalStep] = useState<number>(0);
  
  const dateObj = new Date(currentDate);
  const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const nepaliDate = getNepaliDate(currentDate);

  const handleProcessAndAdd = async () => {
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
      
      onItemsAdded(newItems, rawText);
      setRawText('');
      setInstructions('');
      setModalStep(1); // Start success flow
      
    } catch (err: any) {
      console.error(err);
      setError("Failed to process text. Ensure your connection is stable.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNextModal = () => {
    setModalStep(2);
  };

  const handleCloseAll = () => {
    setModalStep(0);
    onViewReport();
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
             <div className="flex items-center text-sm text-slate-400 gap-2">
               <i className="fas fa-camera-slash"></i> Photos Disabled
             </div>
             <div className="flex items-center text-sm text-indigo-600 gap-2 font-bold">
               <i className="fas fa-shield-alt"></i> Backup Enabled
             </div>
           </div>
        </div>
      </div>

      {/* TEXT INPUT SECTION */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <i className="fab fa-whatsapp text-green-500 text-xl"></i> 
            Data Parser
          </h2>
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
                <i className="fas fa-shield-alt mr-1"></i> Data backed up automatically
              </p>
              <button
              onClick={handleProcessAndAdd}
              disabled={isProcessing || !rawText.trim()}
              className={`flex items-center px-8 py-3.5 rounded-xl font-bold text-white shadow-lg shadow-indigo-500/30 transition-all transform
                ${isProcessing || !rawText.trim() 
                  ? 'bg-slate-300 shadow-none cursor-not-allowed translate-y-0' 
                  : 'bg-green-600 hover:bg-green-700 hover:-translate-y-1 active:translate-y-0'
                }`}
            >
              {isProcessing ? (
                  <span><i className="fas fa-circle-notch fa-spin mr-2"></i> Processing...</span> 
              ) : (
                  <span><i className="fas fa-wand-magic-sparkles mr-2"></i> Analyze & Add to Report</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* STEP 1: SUCCESS MODAL */}
      {modalStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center border border-slate-200 relative">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-lg">
                 <i className="fas fa-check text-green-600 text-3xl"></i>
              </div>
              
              <h3 className="text-xl font-bold text-slate-800 mb-1">Thank you, {user?.displayName ? user.displayName.split(' ')[0] : 'Engineer'}!</h3>
              <p className="text-slate-600 mb-6 text-sm">
                 Thank you for updating your site's progress in this DPR.
              </p>
              
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6 text-left shadow-inner">
                 <ul className="space-y-3 text-sm text-slate-700">
                    <li className="flex items-start gap-3">
                       <i className="fab fa-whatsapp text-green-500 mt-1 text-lg flex-shrink-0"></i>
                       <span className="font-bold">Don't forget to send photos in WhatsApp!</span>
                    </li>
                    <li className="flex items-start gap-3">
                       <i className="fas fa-database text-indigo-500 mt-1 flex-shrink-0"></i>
                       <span>Data safely backed up in permanent storage.</span>
                    </li>
                 </ul>
              </div>

              <button 
                  onClick={handleNextModal}
                  className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-black transition-colors shadow-lg shadow-slate-300/50 flex items-center justify-center"
              >
                  Next
              </button>
           </div>
        </div>
      )}

      {/* STEP 2: ANNOUNCEMENT MODAL */}
      {modalStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
           <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl shadow-2xl max-w-md w-full p-8 text-center border border-white/20 relative text-white">
              
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-md">
                 <i className="fas fa-bullhorn text-yellow-300 text-3xl animate-bounce"></i>
              </div>
              
              <h3 className="text-2xl font-bold mb-2">Big update on Magh 3!</h3>
              
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-5 mb-8 text-left border border-white/10">
                 <p className="text-indigo-100 mb-4 leading-relaxed">
                   Check out the <strong className="text-white border-b border-white/50">Quantities Page</strong> after you have checked your report.
                 </p>
                 <p className="text-indigo-100 leading-relaxed text-sm">
                   <i className="fas fa-hand-point-right mr-2 text-yellow-300"></i>
                   Please spend only <strong className="text-white">2-3 minutes</strong> of your time to correct the missing location/area details in the quantity tab.
                 </p>
              </div>

              <button 
                  onClick={handleCloseAll}
                  className="w-full bg-white text-indigo-700 font-bold py-3 rounded-xl hover:bg-indigo-50 transition-colors shadow-lg flex items-center justify-center"
              >
                  Got it, Check Report
              </button>
           </div>
        </div>
      )}

    </div>
  );
};