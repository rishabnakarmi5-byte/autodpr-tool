
import React, { useState, useMemo } from 'react';
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

  const handleBulkLiningAdd = async () => {
    setIsProcessing(true);
    try {
      // Inject the selected stage into the prompt context if selected
      const stageContext = bulkStage 
        ? `IMPORTANT: All entries below are specifically for the '${bulkStage}' stage. Force the 'activityDescription' or 'structuralElement' to reflect ${bulkStage}.` 
        : "Extract the stage (Invert, Kicker, Gantry) from the text row itself.";

      const { items } = await parseConstructionData(
        rawText, 
        `BULK LINING MODE: The text contains multiple tunnel lining entries. ${stageContext} Expected format: Date CH. From To. Pour Quantity.`,
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
    } catch(e: any) {
      setError(e.message || "Failed to parse bulk lining data.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessAndAdd = async () => {
    // Validation: Require text and at least one location.
    if (!rawText.trim()) {
        setError("Please enter some site activity text.");
        return;
    }
    if (aiLocations.length === 0) {
        setError("Please select a Main Location.");
        return;
    }
    
    setIsProcessing(true);
    setError(null);
    try {
      // If no components selected manually, pass empty array (AI will infer or leave blank)
      const { items } = await parseConstructionData(rawText, instructions, aiLocations, aiComponents, hierarchy);
      const stamped = items.map(item => ({ ...item, id: crypto.randomUUID(), createdBy: user?.displayName || user?.email || 'AI' })) as DPRItem[];
      onItemsAdded(stamped, rawText);
      setRawText('');
      setAiLocations([]);
      setAiComponents([]);
      setModalStep(1);
    } catch (err: any) {
      console.error(err);
      
      let msg = err.message || "Processing failed.";
      
      // Parse detailed Google API errors if present
      if (msg.includes('429') || msg.includes('Quota exceeded') || msg.includes('RESOURCE_EXHAUSTED')) {
         msg = "⚠️ AI Daily Quota Exceeded. The free tier limit for Gemini has been reached. Please try again later or update the API Key.";
      } else if (msg.includes('{') && msg.includes('error')) {
         // Attempt to extract cleaner message from JSON dump
         try {
             // Find the start of the JSON object
             const jsonStart = msg.indexOf('{');
             const jsonStr = msg.substring(jsonStart);
             const parsed = JSON.parse(jsonStr);
             if (parsed.error && parsed.error.message) {
                 msg = `AI Error: ${parsed.error.message}`;
             }
         } catch (e) {
             // Fallback to original message if parse fails
         }
      }

      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const createBlankMasterCard = () => {
      const blankItem: DPRItem = {
          id: crypto.randomUUID(),
          location: Object.keys(hierarchy)[0] || 'General',
          component: '',
          structuralElement: '',
          chainageOrArea: '',
          activityDescription: 'New Activity Entry',
          quantity: 0,
          unit: 'm3',
          plannedNextActivity: '',
          createdBy: user?.displayName || 'Manual',
          lastModifiedAt: new Date().toISOString()
      };
      
      // We pass "Manual Creation" as the raw text source
      onItemsAdded([blankItem], "Manual Creation (Blank Card)");
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
           <h3 className="text-slate-500 text-sm font-medium mb-2">Cloud Status</h3>
           <div className="space-y-2">
             <div className="flex items-center text-sm text-slate-600 gap-2"><i className="fas fa-check-circle text-green-500"></i> Sync: Active</div>
             <div className="flex items-center text-sm text-indigo-600 gap-2 font-bold"><i className="fas fa-magic"></i> Automatic DPR Maker</div>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between bg-slate-50/30">
            <div className="flex gap-4">
                <button onClick={() => setMode('ai')} className={`text-xs font-bold px-4 py-2 rounded-full transition-all ${mode === 'ai' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white border border-transparent'}`}>Daily Progress Entry</button>
                <button onClick={() => setMode('bulk_lining')} className={`text-xs font-bold px-4 py-2 rounded-full transition-all ${mode === 'bulk_lining' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white border border-transparent'}`}>Bulk Lining</button>
                <button onClick={() => setMode('manual')} className={`text-xs font-bold px-4 py-2 rounded-full transition-all ${mode === 'manual' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white border border-transparent'}`}>Manual</button>
            </div>
        </div>

        <div className="p-8 space-y-6">
            {mode === 'ai' && (
                <>
                    <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100">
                        <label className="block text-xs font-bold text-indigo-800 uppercase mb-2">1. Select Locations (Context)</label>
                        <div className="flex flex-wrap gap-2">
                            {Object.keys(hierarchy).map(loc => (
                                <button key={loc} onClick={() => setAiLocations(prev => prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc])} className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${aiLocations.includes(loc) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-indigo-200'}`}>{loc}</button>
                            ))}
                        </div>

                        {/* COMPONENT SELECTION */}
                        {availableComponents.length > 0 && (
                            <div className="mt-4 animate-fade-in border-t border-indigo-200 pt-4">
                                <label className="block text-xs font-bold text-indigo-800 uppercase mb-2">2. Select Components (Optional)</label>
                                <div className="flex flex-wrap gap-2">
                                    {availableComponents.map(comp => (
                                        <button 
                                            key={comp} 
                                            onClick={() => setAiComponents(prev => prev.includes(comp) ? prev.filter(c => c !== comp) : [...prev, comp])} 
                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${aiComponents.includes(comp) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-indigo-200'}`}
                                        >
                                            {comp}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <textarea value={rawText} onChange={e => setRawText(e.target.value)} placeholder="Paste site update text here..." className="w-full h-40 p-5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono text-sm" />
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2">
                            <i className="fas fa-exclamation-triangle"></i> {error}
                        </div>
                    )}

                    <button onClick={handleProcessAndAdd} disabled={isProcessing} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                        {isProcessing ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-wand-magic-sparkles"></i>}
                        Analyze & Add to Report
                    </button>
                </>
            )}

            {mode === 'bulk_lining' && (
                <>
                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex-1">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Select Stage (Optional)</label>
                            <select 
                                value={bulkStage} 
                                onChange={e => setBulkStage(e.target.value)}
                                className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Auto-detect from text</option>
                                <option value="Invert">Invert</option>
                                <option value="Kicker">Kicker</option>
                                <option value="Gantry">Gantry</option>
                            </select>
                        </div>
                        <div className="flex-[2] text-xs text-slate-500 italic">
                             If you select a stage, all entries below will be treated as that stage unless specified otherwise.
                        </div>
                    </div>

                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-xs text-amber-800 mb-4">
                        <strong>Format:</strong> Date CH. From to To PourQuantity. Example:<br/>
                        2026-01-22 CH 100 to 120 15m3
                    </div>
                    <textarea value={rawText} onChange={e => setRawText(e.target.value)} placeholder="Paste lining data rows..." className="w-full h-40 p-5 border border-slate-200 rounded-xl bg-slate-50 font-mono text-sm" />
                    
                    {error && (
                        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2">
                            <i className="fas fa-exclamation-triangle"></i> {error}
                        </div>
                    )}
                    
                    <button onClick={handleBulkLiningAdd} disabled={isProcessing} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                        {isProcessing ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-table-list"></i>}
                        Parse Bulk Lining Entries
                    </button>
                </>
            )}

            {mode === 'manual' && (
                <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-white transition-colors">
                    <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-2xl mb-4">
                        <i className="fas fa-pen-nib"></i>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Create Blank Master Record</h3>
                    <p className="text-slate-500 text-center max-w-sm mb-6">
                        Manually enter all details for a new activity without using the AI parser. This creates an empty card you can edit immediately.
                    </p>
                    <button 
                        onClick={createBlankMasterCard}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex items-center gap-2 transform hover:-translate-y-1"
                    >
                        <i className="fas fa-plus-circle"></i> Create Blank Entry
                    </button>
                </div>
            )}
        </div>
      </div>

      {modalStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
           <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl"><i className="fas fa-check"></i></div>
              <h2 className="text-2xl font-bold">Successfully Added</h2>
              <p className="text-slate-500 mt-2 mb-6 text-sm">New Master Record(s) created. Reports and Quantities synced.</p>
              <button onClick={() => { setModalStep(0); onViewReport(); }} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold">View Daily Report</button>
           </div>
        </div>
      )}
    </div>
  );
};
