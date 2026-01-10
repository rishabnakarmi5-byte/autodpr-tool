import React, { useState, useEffect } from 'react';
import { parseConstructionData } from '../services/geminiService';
import { DPRItem } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';

interface InputSectionProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  onItemsAdded: (items: DPRItem[]) => void;
  entryCount: number;
}

export const InputSection: React.FC<InputSectionProps> = ({ currentDate, onDateChange, onItemsAdded, entryCount }) => {
  const [rawText, setRawText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateObj = new Date(currentDate);
  const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const nepaliDate = getNepaliDate(currentDate);

  const handleProcess = async () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);
    setError(null);
    try {
      const parsedData = await parseConstructionData(rawText, instructions);
      const newItems: DPRItem[] = parsedData.map(item => ({ ...item, id: crypto.randomUUID() }));
      onItemsAdded(newItems);
      setRawText(''); 
    } catch (err) {
      console.error(err);
      setError("Failed to process text. Ensure your API key is correct.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      
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

        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-lg shadow-slate-200/50 flex flex-col justify-center">
           <h3 className="text-slate-500 text-sm font-medium mb-2">Quick Actions</h3>
           <div className="space-y-2">
             <div className="flex items-center text-sm text-slate-600 gap-2">
               <i className="fas fa-check-circle text-green-500"></i> Cloud Sync Active
             </div>
             <div className="flex items-center text-sm text-slate-600 gap-2">
               <i className="fas fa-brain text-purple-500"></i> AI Model Ready
             </div>
           </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <i className="fab fa-whatsapp text-green-500 text-xl"></i> 
            Message Parser
          </h2>
          <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded font-medium">Step 1</span>
        </div>
        
        <div className="p-6 md:p-8 space-y-6">
          
          {/* Main Text Input */}
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

          {/* Instructions Input */}
          <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
             <label className="block text-xs font-bold text-indigo-800 mb-2 uppercase tracking-wide">
               <i className="fas fa-robot mr-1"></i> Special Instructions for AI (Optional)
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
               <i className="fas fa-shield-alt mr-1"></i> Data processed securely via Gemini AI
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
              {isProcessing ? (
                <>
                  <i className="fas fa-circle-notch fa-spin mr-2"></i> Analyzing...
                </>
              ) : (
                <>
                  <i className="fas fa-wand-magic-sparkles mr-2"></i> Convert to Report
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};