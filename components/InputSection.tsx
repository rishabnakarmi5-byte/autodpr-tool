
import React, { useState, useMemo } from 'react';
import { parseConstructionData } from '../services/geminiService';
import { saveRawInput } from '../services/firebaseService';
import { DPRItem, ItemTypeDefinition } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';

interface InputSectionProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  onItemsAdded: (items: DPRItem[], rawText: string) => Promise<void>;
  onViewReport: () => void;
  entryCount: number;
  user: any;
  hierarchy: Record<string, string[]>;
  customItemTypes?: ItemTypeDefinition[];
}

type InputMode = 'ai' | 'manual' | 'bulk_lining';

export const InputSection: React.FC<InputSectionProps> = ({ currentDate, onDateChange, onItemsAdded, onViewReport, entryCount, user, hierarchy, customItemTypes }) => {
  const [mode, setMode] = useState<InputMode>('ai');
  const [rawText, setRawText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiLocations, setAiLocations] = useState<string[]>([]);
  const [aiComponents, setAiComponents] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Bulk Lining State
  const [bulkStage, setBulkStage] = useState<string>('');
  
  // Modal State
  const [modalStep, setModalStep] = useState<number>(0);

  // Derived state for available components based on selected locations
  const availableComponents = useMemo(() => {
    const comps = new Set<string>();
    aiLocations.forEach(loc => {
        const list = hierarchy[loc] || [];
        list.forEach(c => comps.add(c));
    });
    return Array.from(comps);
  }, [aiLocations, hierarchy]);

  const isFocusedContext = aiLocations.length === 1 && aiComponents.length === 1;

  const handleProcessAndAdd = async () => {
    if (!rawText.trim()) {
        setError("Please enter some site activity text.");
        return;
    }
    
    const locationsToUse = aiLocations.length > 0 ? aiLocations : [Object.keys(hierarchy)[0] || "General"];
    
    setIsProcessing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Pass both selected locations AND components to aid extraction
      const { items } = await parseConstructionData(
        rawText, 
        instructions, 
        locationsToUse, 
        aiComponents, 
        hierarchy, 
        customItemTypes
      );
      
      let finalItems = items;
      
      if (finalItems.length === 0 && rawText.trim().length > 0) {
          finalItems = [{
             location: locationsToUse[0],
             component: aiComponents[0] || '',
             structuralElement: '',
             chainageOrArea: '',
             activityDescription: rawText,
             plannedNextActivity: 'Continue works',
             quantity: 0,
             unit: 'm3',
             itemType: 'Other'
          }];
      }

      const stamped = finalItems.map(item => ({ 
          ...item, 
          id: crypto.randomUUID(), 
          createdBy: user?.displayName || user?.email || 'AI' 
      })) as DPRItem[];

      await onItemsAdded(stamped, rawText);
      setRawText('');
      // Keep context if focused, otherwise reset? 
      // User likely wants to enter another item for the same location
      if (!isFocusedContext) {
        setAiLocations([]);
        setAiComponents([]);
      }
      setModalStep(1);
    } catch (err: any) {
      console.error("AI Error:", err);
      setError(`Parsing failed: ${err.message || "Unknown error"}. Your raw text was saved to activity logs.`);
      await saveRawInput(rawText, currentDate, locationsToUse, aiComponents, user?.displayName || 'Unknown', 'failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkLiningAdd = async () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);
    setError(null);
    try {
      const { items } = await parseConstructionData(
        rawText, 
        `BULK LINING MODE: ${bulkStage ? `Stage ${bulkStage}` : ''}`,
        ["Headrace Tunnel (HRT)"],
        ["HRT from Inlet", "HRT from Adit"],
        hierarchy,
        customItemTypes
      );
      const stamped = items.map(item => ({ ...item, id: crypto.randomUUID(), createdBy: user?.displayName || 'Bulk' })) as DPRItem[];
      await onItemsAdded(stamped, rawText);
      setRawText('');
      setModalStep(1);
    } catch(e: any) { setError(e.message); } finally { setIsProcessing(false); }
  };

  const createBlankMasterCard = async () => {
      const blankItem: DPRItem = {
          id: crypto.randomUUID(),
          location: aiLocations[0] || Object.keys(hierarchy)[0] || 'General',
          component: aiComponents[0] || '',
          structuralElement: '',
          chainageOrArea: '',
          activityDescription: 'New Activity Entry',
          quantity: 0,
          unit: 'm3',
          itemType: 'Other',
          plannedNextActivity: '',
          createdBy: user?.displayName || 'Manual',
          lastModifiedAt: new Date().toISOString()
      };
      await onItemsAdded([blankItem], "Manual Creation");
      setModalStep(1);
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
           <h3 className="text-slate-500 text-sm font-medium mb-2">System Insight</h3>
           <p className="text-xs text-slate-400 leading-relaxed">AI analyzes your text to extract quantities, areas (like Panel 1), and chainages (CH/EL).</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between bg-slate-50/30">
            <div className="flex gap-4">
                <button onClick={() => setMode('ai')} className={`text-xs font-bold px-4 py-2 rounded-full transition-all ${mode === 'ai' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white border border-transparent'}`}>Daily Updates</button>
                <button onClick={() => setMode('bulk_lining')} className={`text-xs font-bold px-4 py-2 rounded-full transition-all ${mode === 'bulk_lining' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white border border-transparent'}`}>Bulk Lining</button>
                <button onClick={() => setMode('manual')} className={`text-xs font-bold px-4 py-2 rounded-full transition-all ${mode === 'manual' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white border border-transparent'}`}>Manual</button>
            </div>
        </div>

        <div className="p-8 space-y-6">
            {mode === 'ai' && (
                <>
                    <div className={`p-5 rounded-xl border transition-all ${isFocusedContext ? 'bg-indigo-900 text-white border-indigo-700 shadow-lg' : 'bg-indigo-50/50 text-indigo-800 border-indigo-100'}`}>
                        <div className="flex justify-between items-center mb-4">
                           <label className={`block text-xs font-black uppercase tracking-wider ${isFocusedContext ? 'text-indigo-300' : 'text-indigo-800'}`}>
                              {isFocusedContext ? "Context Locked" : "1. Define Context (Optional but Recommended)"}
                           </label>
                           {isFocusedContext && (
                               <button onClick={() => {setAiLocations([]); setAiComponents([]);}} className="text-[10px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded font-bold uppercase">Clear Context</button>
                           )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {Object.keys(hierarchy).map(loc => (
                                <button key={loc} onClick={() => setAiLocations(prev => prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc])} className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${aiLocations.includes(loc) ? (isFocusedContext ? 'bg-white text-indigo-900 border-white' : 'bg-indigo-600 text-white border-indigo-600') : (isFocusedContext ? 'bg-white/5 text-indigo-300 border-white/10' : 'bg-white text-slate-600 border-indigo-200')}`}>{loc}</button>
                            ))}
                        </div>

                        {availableComponents.length > 0 && (
                            <div className={`mt-4 animate-fade-in border-t pt-4 ${isFocusedContext ? 'border-white/10' : 'border-indigo-200'}`}>
                                <label className={`block text-[10px] font-black uppercase mb-2 ${isFocusedContext ? 'text-indigo-400' : 'text-indigo-800'}`}>2. Select Component</label>
                                <div className="flex flex-wrap gap-2">
                                    {availableComponents.map(comp => (
                                        <button 
                                            key={comp} 
                                            onClick={() => setAiComponents(prev => prev.includes(comp) ? prev.filter(c => c !== comp) : [...prev, comp])} 
                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${aiComponents.includes(comp) ? (isFocusedContext ? 'bg-white text-indigo-900 border-white' : 'bg-indigo-600 text-white border-indigo-600') : (isFocusedContext ? 'bg-white/5 text-indigo-300 border-white/10' : 'bg-white text-slate-600 border-indigo-200')}`}
                                        >
                                            {comp}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {isFocusedContext && (
                            <div className="mt-4 pt-3 border-t border-white/10 text-[10px] font-bold text-indigo-300 italic">
                               <i className="fas fa-info-circle mr-1"></i> Input text will be mapped to <strong>{aiLocations[0]} &gt; {aiComponents[0]}</strong>. Identifiers like "Panel 1" will be extracted as Area.
                            </div>
                        )}
                    </div>

                    <div>
                        <textarea value={rawText} onChange={e => setRawText(e.target.value)} placeholder={isFocusedContext ? `Enter activities for ${aiComponents[0]} (e.g., 'Panel 1 concrete 75m3')` : "Paste site update text here..."} className="w-full h-40 p-5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono text-sm" />
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-800 px-4 py-4 rounded-xl text-sm font-medium border border-red-200">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-4">
                        <button onClick={handleProcessAndAdd} disabled={isProcessing} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                            {isProcessing ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-wand-magic-sparkles"></i>}
                            {isFocusedContext ? `Add to ${aiComponents[0]}` : "Analyze & Add to Report"}
                        </button>
                    </div>
                </>
            )}

            {mode === 'bulk_lining' && (
                <>
                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex-1">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Select Stage</label>
                            <select value={bulkStage} onChange={e => setBulkStage(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none">
                                <option value="">Auto-detect</option>
                                <option value="Invert">Invert</option>
                                <option value="Kicker">Kicker</option>
                                <option value="Gantry">Gantry</option>
                            </select>
                        </div>
                    </div>
                    <textarea value={rawText} onChange={e => setRawText(e.target.value)} placeholder="Date CH From To Qty..." className="w-full h-40 p-5 border border-slate-200 rounded-xl bg-slate-50 font-mono text-sm mt-4" />
                    <button onClick={handleBulkLiningAdd} disabled={isProcessing} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all mt-4 flex items-center justify-center gap-2">
                        {isProcessing ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-table-list"></i>}
                        Parse Bulk Entries
                    </button>
                </>
            )}

            {mode === 'manual' && (
                <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-white transition-colors">
                    <button onClick={createBlankMasterCard} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition-all">
                        <i className="fas fa-plus-circle mr-2"></i> Create Blank Entry
                    </button>
                </div>
            )}
        </div>
      </div>

      {modalStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
           <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl"><i className="fas fa-check"></i></div>
              <h2 className="text-2xl font-bold uppercase tracking-tight">Record Added</h2>
              <p className="text-slate-500 mt-2 mb-6 text-sm">Quantities and history updated.</p>
              <button onClick={() => { setModalStep(0); onViewReport(); }} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold uppercase tracking-wide">View Daily Report</button>
           </div>
        </div>
      )}
    </div>
  );
};
