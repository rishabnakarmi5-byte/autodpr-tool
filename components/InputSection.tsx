
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
  hierarchy: Record<string, string[]>;
}

type InputMode = 'ai' | 'manual' | 'bulk_lining';

export const InputSection: React.FC<InputSectionProps> = ({ currentDate, onDateChange, onItemsAdded, onViewReport, entryCount, user, hierarchy }) => {
  const [mode, setMode] = useState<InputMode>('ai');
  const [rawText, setRawText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiLocations, setAiLocations] = useState<string[]>([]);
  const [aiComponents, setAiComponents] = useState<string[]>([]);
  
  // Modal State
  const [modalStep, setModalStep] = useState<number>(0);

  const handleBulkLiningAdd = async () => {
    setIsProcessing(true);
    try {
      const { items } = await parseConstructionData(
        rawText, 
        "BULK LINING MODE: The text contains multiple tunnel lining entries. Expected format: Date CH. From To. Type (Invert/Kicker/Gantry) Pour Quantity. Example: '2026-01-22 CH 0+500 to 0+520 Gantry C25 150m3'. Extract each row as a separate Master Record.",
        ["Headrace Tunnel (HRT)"],
        ["HRT from Inlet", "HRT from Adit"],
        hierarchy
      );
      
      const stamped = items.map(item => ({ 
        ...item, 
        id: crypto.randomUUID(),
        createdBy: user?.displayName || user?.email || 'System'
      })) as DPRItem[];

      onItemsAdded(stamped, rawText);
      setRawText('');
      setModalStep(1);
    } catch(e) {
      setError("Failed to parse bulk lining data.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessAndAdd = async () => {
    if (!rawText.trim() || aiLocations.length === 0 || aiComponents.length === 0) {
        setError("Please select at least one Location and Component, and enter text.");
        return;
    }
    
    setIsProcessing(true);
    setError(null);
    try {
      const { items } = await parseConstructionData(rawText, instructions, aiLocations, aiComponents, hierarchy);
      const stamped = items.map(item => ({ ...item, id: crypto.randomUUID(), createdBy: user?.displayName || user?.email || 'AI' })) as DPRItem[];
      onItemsAdded(stamped, rawText);
      setRawText('');
      setModalStep(1);
    } catch (err) {
      setError("Processing failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in relative">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-2xl p-6 text-white shadow-xl">
           <h2 className="text-indigo-100 text-sm font-semibold uppercase tracking-wider mb-1">Active Report</h2>
           <h1 className="text-3xl font-bold">{new Date(currentDate).toDateString()}</h1>
           <h2 className="text-lg text-indigo-200 mt-1">{getNepaliDate(currentDate)}</h2>
           <div className="mt-4 flex gap-4">
               <div className="bg-white/10 px-4 py-2 rounded-lg">
                 <span className="text-xs block text-indigo-200">Entries</span>
                 <span className="text-xl font-bold">{entryCount}</span>
               </div>
               <input type="date" value={currentDate} onChange={e => onDateChange(e.target.value)} className="bg-white/10 border border-white/20 text-white text-sm rounded px-3 py-1.5 focus:outline-none" />
           </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-slate-200 flex flex-col justify-center">
           <h3 className="text-slate-500 text-sm font-medium mb-2">Cloud Status</h3>
           <div className="space-y-2">
             <div className="flex items-center text-sm text-slate-600 gap-2"><i className="fas fa-check-circle text-green-500"></i> Sync: Active</div>
             <div className="flex items-center text-sm text-indigo-600 gap-2 font-bold"><i className="fas fa-magic"></i> AI Model: Gemini 3</div>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between bg-slate-50/30">
            <div className="flex gap-4">
                <button onClick={() => setMode('ai')} className={`text-xs font-bold px-4 py-2 rounded-full transition-all ${mode === 'ai' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white border border-transparent'}`}>WhatsApp AI</button>
                <button onClick={() => setMode('bulk_lining')} className={`text-xs font-bold px-4 py-2 rounded-full transition-all ${mode === 'bulk_lining' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white border border-transparent'}`}>Bulk Lining</button>
                <button onClick={() => setMode('manual')} className={`text-xs font-bold px-4 py-2 rounded-full transition-all ${mode === 'manual' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white border border-transparent'}`}>Manual</button>
            </div>
        </div>

        <div className="p-8 space-y-6">
            {mode === 'ai' && (
                <>
                    <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100">
                        <label className="block text-xs font-bold text-indigo-800 uppercase mb-2">Select Locations</label>
                        <div className="flex flex-wrap gap-2">
                            {Object.keys(hierarchy).map(loc => (
                                <button key={loc} onClick={() => setAiLocations(prev => prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc])} className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${aiLocations.includes(loc) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-indigo-200'}`}>{loc}</button>
                            ))}
                        </div>
                    </div>
                    <textarea value={rawText} onChange={e => setRawText(e.target.value)} placeholder="Paste site update text..." className="w-full h-40 p-5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono text-sm" />
                    <button onClick={handleProcessAndAdd} disabled={isProcessing} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                        {isProcessing ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-wand-magic-sparkles"></i>}
                        Analyze & Add to Report
                    </button>
                </>
            )}

            {mode === 'bulk_lining' && (
                <>
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-xs text-amber-800 mb-4">
                        <strong>Format:</strong> Date CH. From to To Stage PourQuantity. Example:<br/>
                        2026-01-22 CH 100 to 120 Gantry 15m3
                    </div>
                    <textarea value={rawText} onChange={e => setRawText(e.target.value)} placeholder="Paste lining data rows..." className="w-full h-40 p-5 border border-slate-200 rounded-xl bg-slate-50 font-mono text-sm" />
                    <button onClick={handleBulkLiningAdd} disabled={isProcessing} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                        {isProcessing ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-table-list"></i>}
                        Parse Bulk Lining Entries
                    </button>
                </>
            )}
        </div>
      </div>

      {modalStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
           <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl"><i className="fas fa-check"></i></div>
              <h2 className="text-2xl font-bold">Successfully Added</h2>
              <p className="text-slate-500 mt-2 mb-6 text-sm">New Master Records created. Reports and Quantities synced.</p>
              <button onClick={() => { setModalStep(0); onViewReport(); }} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold">View Daily Report</button>
           </div>
        </div>
      )}
    </div>
  );
};
