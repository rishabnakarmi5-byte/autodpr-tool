
import React, { useState, useMemo, useEffect } from 'react';
import { parseConstructionData } from '../services/geminiService';
import { saveRawInput, updateRawInputStatus } from '../services/firebaseService';
import { DPRItem, ItemTypeDefinition } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';

interface InputSectionProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  onItemsAdded: (items: DPRItem[], rawText: string, existingLogId?: string) => Promise<void>;
  onViewReport: () => void;
  entryCount: number;
  user: any;
  hierarchy: Record<string, string[]>;
  customItemTypes?: ItemTypeDefinition[];
}

type InputMode = 'ai' | 'manual' | 'bulk_lining';

export const InputSection: React.FC<InputSectionProps> = ({ currentDate, onDateChange, onItemsAdded, onViewReport, entryCount, user, hierarchy, customItemTypes }) => {
  const [mode, setMode] = useState<InputMode>('ai');
  const [instructions, setInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [aiLocations, setAiLocations] = useState<string[]>([]);
  const [aiComponents, setAiComponents] = useState<string[]>([]);
  const [contextTexts, setContextTexts] = useState<Record<string, string>>({ "General:General": "" });
  const [modalStep, setModalStep] = useState<number>(0);

  const activeContexts = useMemo(() => {
    if (aiComponents.length === 0) return [{ loc: "General", comp: "General" }];
    
    const list: { loc: string; comp: string }[] = [];
    aiLocations.forEach(loc => {
      const comps = hierarchy[loc] || [];
      comps.forEach(c => {
        if (aiComponents.includes(c)) {
          list.push({ loc, comp: c });
        }
      });
    });
    return list;
  }, [aiLocations, aiComponents, hierarchy]);

  const handleTextChange = (loc: string, comp: string, val: string) => {
    const key = `${loc}:${comp}`;
    setContextTexts(prev => ({ ...prev, [key]: val }));
  };

  const handleProcessAndAdd = async () => {
    const entriesToProcess = activeContexts.filter(ctx => {
      const val = contextTexts[`${ctx.loc}:${ctx.comp}`];
      return val && val.trim().length > 0;
    });

    if (entriesToProcess.length === 0) {
        setError("Please enter activities in at least one box.");
        return;
    }
    
    setIsProcessing(true);
    setError(null);

    const aggregatedRaw = entriesToProcess.map(ctx => {
        const text = contextTexts[`${ctx.loc}:${ctx.comp}`];
        return `--- CONTEXT: ${ctx.loc} > ${ctx.comp} ---\n${text}`;
    }).join('\n\n');

    // LOG IMMEDIATELY BEFORE AI CALL
    let logId: string | undefined = undefined;
    try {
        logId = await saveRawInput(
            aggregatedRaw,
            currentDate,
            aiLocations.length > 0 ? aiLocations : ["General"],
            aiComponents,
            user?.displayName || 'Unknown',
            'processing'
        );
    } catch (logErr) {
        console.warn("Failed to log raw input pre-processing", logErr);
    }

    try {
      const { items } = await parseConstructionData(
        aggregatedRaw, 
        instructions, 
        aiLocations.length > 0 ? aiLocations : ["General"], 
        aiComponents, 
        hierarchy, 
        customItemTypes
      );
      
      const stamped = items.map(item => ({ 
          ...item, 
          id: crypto.randomUUID(), 
          createdBy: user?.displayName || user?.email || 'AI' 
      })) as DPRItem[];

      await onItemsAdded(stamped, aggregatedRaw, logId);
      
      const newTexts = { ...contextTexts };
      entriesToProcess.forEach(ctx => {
        newTexts[`${ctx.loc}:${ctx.comp}`] = "";
      });
      setContextTexts(newTexts);
      
      setModalStep(1);
    } catch (err: any) {
      console.error("AI Error:", err);
      setError(`Parsing failed: ${err.message || "Unknown error"}. Check activity logs.`);
      if (logId) {
          await updateRawInputStatus(logId, 'failed', err.message);
      }
    } finally {
      setIsProcessing(false);
    }
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
      await onItemsAdded([blankItem], "Manual Creation (Blank Card)");
      setModalStep(1);
  };

  return (
    <div className="space-y-8 animate-fade-in relative">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-indigo-700 via-indigo-800 to-indigo-900 rounded-2xl p-7 text-white shadow-2xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
             <i className="fas fa-calendar-alt text-8xl"></i>
           </div>
           <h2 className="text-indigo-200 text-xs font-black uppercase tracking-widest mb-2">Active Reporting Profile</h2>
           <h1 className="text-4xl font-black tracking-tight">{new Date(currentDate).toDateString()}</h1>
           <div className="flex items-baseline gap-2 mt-1">
             <h2 className="text-lg text-indigo-300 font-medium">{getNepaliDate(currentDate)}</h2>
             <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
             <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Construction DPR</span>
           </div>
           
           <div className="mt-8 flex flex-wrap gap-4 items-center">
               <div className="bg-white/10 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 flex flex-col">
                 <span className="text-[10px] font-black uppercase text-indigo-300 tracking-wider">Daily Entries</span>
                 <span className="text-2xl font-black">{entryCount}</span>
               </div>
               <div className="relative">
                 <input 
                   type="date" 
                   value={currentDate} 
                   onChange={e => onDateChange(e.target.value)} 
                   className="bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-bold rounded-xl px-4 py-3 focus:outline-none transition-all cursor-pointer" 
                 />
                 <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none opacity-50"></i>
               </div>
           </div>
        </div>
        <div className="bg-white rounded-2xl p-7 border border-slate-200 flex flex-col justify-center shadow-lg relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4">
             <i className="fas fa-microchip text-slate-100 text-6xl"></i>
           </div>
           <h3 className="text-slate-800 text-xs font-black uppercase tracking-widest mb-3 relative">AI Intelligence</h3>
           <p className="text-sm text-slate-500 leading-relaxed font-medium relative">
             Select one or more components to unlock dedicated entry boxes. AI will automatically extract identifiers like <span className="text-indigo-600 font-bold">"Panel 1"</span> or <span className="text-indigo-600 font-bold">"CH 1050"</span> from your text.
           </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="px-8 pt-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div className="flex gap-1 pb-1">
                <button onClick={() => setMode('ai')} className={`px-6 py-3 rounded-t-2xl text-xs font-black uppercase tracking-widest transition-all ${mode === 'ai' ? 'bg-white border-x border-t border-slate-100 text-indigo-600 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]' : 'text-slate-400 hover:text-slate-600'}`}>Daily Progress Entry</button>
                <button onClick={() => setMode('bulk_lining')} className={`px-6 py-3 rounded-t-2xl text-xs font-black uppercase tracking-widest transition-all ${mode === 'bulk_lining' ? 'bg-white border-x border-t border-slate-100 text-indigo-600 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]' : 'text-slate-400 hover:text-slate-600'}`}>Bulk Lining</button>
                <button onClick={() => setMode('manual')} className={`px-6 py-3 rounded-t-2xl text-xs font-black uppercase tracking-widest transition-all ${mode === 'manual' ? 'bg-white border-x border-t border-slate-100 text-indigo-600 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]' : 'text-slate-400 hover:text-slate-600'}`}>Manual</button>
            </div>
            {mode === 'ai' && (
              <button onClick={() => {setAiLocations([]); setAiComponents([]);}} className="text-[10px] font-black text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg mb-2 uppercase transition-all">Reset Context</button>
            )}
        </div>

        <div className="p-8 space-y-8">
            {mode === 'ai' && (
                <>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">1. Select Locations (Context)</label>
                            <div className="flex flex-wrap gap-2">
                                {Object.keys(hierarchy).map(loc => (
                                    <button 
                                        key={loc} 
                                        onClick={() => setAiLocations(prev => prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc])} 
                                        className={`px-5 py-2.5 rounded-xl text-xs font-bold border transition-all ${aiLocations.includes(loc) ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
                                    >
                                        {loc}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {aiLocations.length > 0 && (
                            <div className="animate-fade-in pt-4 border-t border-slate-100">
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">2. Select Components (Optional)</label>
                                <div className="flex flex-wrap gap-2">
                                    {aiLocations.flatMap(loc => hierarchy[loc] || []).map(comp => (
                                        <button 
                                            key={comp} 
                                            onClick={() => setAiComponents(prev => prev.includes(comp) ? prev.filter(c => c !== comp) : [...prev, comp])} 
                                            className={`px-4 py-2 rounded-xl text-[11px] font-bold border transition-all ${aiComponents.includes(comp) ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
                                        >
                                            {comp}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-6 pt-4">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">3. Enter Site Activities</label>
                        
                        <div className="grid grid-cols-1 gap-6">
                          {activeContexts.map((ctx, index) => {
                             const key = `${ctx.loc}:${ctx.comp}`;
                             const isGeneral = ctx.loc === "General";
                             
                             return (
                               <div key={key} className="bg-slate-50/50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-all hover:shadow-md">
                                 <div className={`px-5 py-3 border-b flex justify-between items-center ${isGeneral ? 'bg-slate-100 border-slate-200' : 'bg-indigo-50/80 border-indigo-100'}`}>
                                    <div className="flex items-center gap-2">
                                       <i className={`fas ${isGeneral ? 'fa-globe' : 'fa-layer-group'} text-indigo-400 text-xs`}></i>
                                       <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                                          {isGeneral ? "General Progress" : `${ctx.loc} > ${ctx.comp}`}
                                       </span>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-400 italic">Contextual Entry Card</span>
                                 </div>
                                 <textarea 
                                    value={contextTexts[key] || ""} 
                                    onChange={e => handleTextChange(ctx.loc, ctx.comp, e.target.value)}
                                    placeholder={isGeneral ? "Enter overall site updates..." : `Enter activities for ${ctx.comp}...`}
                                    className="w-full h-32 p-5 bg-transparent focus:bg-white outline-none text-sm font-medium transition-all placeholder:text-slate-300 font-mono"
                                 />
                               </div>
                             );
                          })}
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-800 px-6 py-4 rounded-2xl text-sm font-bold border border-red-200 flex items-center gap-3 animate-shake">
                            <i className="fas fa-exclamation-triangle"></i>
                            {error}
                        </div>
                    )}

                    <button 
                        onClick={handleProcessAndAdd} 
                        disabled={isProcessing} 
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:scale-100 active:scale-95 group uppercase tracking-widest text-sm"
                    >
                        {isProcessing ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-wand-magic-sparkles group-hover:rotate-12 transition-transform"></i>}
                        {isProcessing ? "Processing Data..." : "Analyze & Add to Report"}
                    </button>
                </>
            )}

            {mode === 'bulk_lining' && (
                <div className="space-y-6">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Lining Component</label>
                        <div className="flex flex-wrap gap-2">
                            <button className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold border border-indigo-600 shadow-lg">HRT from Inlet</button>
                            <button className="px-5 py-2.5 bg-white text-slate-600 rounded-xl text-xs font-bold border border-slate-200">HRT from Adit</button>
                        </div>
                    </div>
                    <textarea 
                       placeholder="Format: Date CH From To Qty (e.g., 2026-02-17 1200 1205 75)" 
                       className="w-full h-56 p-6 border border-slate-200 rounded-3xl bg-slate-50 focus:bg-white focus:ring-4 focus:ring-indigo-50 font-mono text-sm outline-none transition-all" 
                    />
                    <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-5 rounded-2xl shadow-xl shadow-emerald-100 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm">
                        <i className="fas fa-table-list"></i> Parse Bulk Lining Entries
                    </button>
                </div>
            )}

            {mode === 'manual' && (
                <div className="flex flex-col items-center justify-center py-24 px-10 border-4 border-dashed border-slate-100 rounded-3xl bg-slate-50/50 hover:bg-white transition-all group">
                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <i className="fas fa-plus-circle text-indigo-600 text-4xl"></i>
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">Standard Record Creation</h3>
                    <p className="text-slate-500 text-center mb-10 max-w-sm font-medium">Create a blank master record and fill in details manually using our advanced split-field editor.</p>
                    <button onClick={createBlankMasterCard} className="bg-slate-900 hover:bg-black text-white px-10 py-4 rounded-2xl font-black shadow-2xl transition-all uppercase tracking-widest text-xs">
                        Create Blank Record
                    </button>
                </div>
            )}
        </div>
      </div>

      {modalStep === 1 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-md">
           <div className="bg-white rounded-[2.5rem] p-12 text-center max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/20 animate-fade-in">
              <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl animate-bounce">
                 <i className="fas fa-check"></i>
              </div>
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight mb-2">Record Verified</h2>
              <p className="text-slate-500 mb-10 text-sm font-medium leading-relaxed">System has successfully processed your activities. Quantities, units, and site hierarchies have been updated globally.</p>
              <button onClick={() => { setModalStep(0); onViewReport(); }} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-indigo-100 transition-all active:scale-95">View Daily Report</button>
           </div>
        </div>
      )}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
      `}</style>
    </div>
  );
};
