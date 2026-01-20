
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

type InputMode = 'ai' | 'manual';

export const InputSection: React.FC<InputSectionProps> = ({ currentDate, onDateChange, onItemsAdded, onViewReport, entryCount, user, hierarchy }) => {
  const [mode, setMode] = useState<InputMode>('ai');
  
  // AI State
  const [rawText, setRawText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Warnings State
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pendingItems, setPendingItems] = useState<DPRItem[]>([]);
  const [showWarningModal, setShowWarningModal] = useState(false);

  // Retry State
  const [showRetryModal, setShowRetryModal] = useState(false);

  // AI Context State (Multi-select)
  const [aiLocations, setAiLocations] = useState<string[]>([]);
  const [aiComponents, setAiComponents] = useState<string[]>([]);

  // Manual State
  const [manualLoc, setManualLoc] = useState('');
  const [manualComp, setManualComp] = useState('');
  const [manualElement, setManualElement] = useState('');
  const [manualChainage, setManualChainage] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualNext, setManualNext] = useState('');
  
  // Modal State: 0 = closed, 1 = success, 2 = announcement
  const [modalStep, setModalStep] = useState<number>(0);
  
  const dateObj = new Date(currentDate);
  const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const nepaliDate = getNepaliDate(currentDate);

  // Toggle Handlers
  const toggleLocation = (loc: string) => {
    setAiLocations(prev => {
        const isActive = prev.includes(loc);
        if (isActive) {
            const componentsToRemove = hierarchy[loc] || [];
            setAiComponents(curr => curr.filter(c => !componentsToRemove.includes(c)));
            return prev.filter(l => l !== loc);
        } else {
            return [...prev, loc];
        }
    });
  };

  const toggleComponent = (comp: string) => {
    setAiComponents(prev => 
        prev.includes(comp) ? prev.filter(c => c !== comp) : [...prev, comp]
    );
  };

  const selectAllComponents = (loc: string) => {
      const locationComps = hierarchy[loc] || [];
      const allSelected = locationComps.every(c => aiComponents.includes(c));
      
      if (allSelected) {
          setAiComponents(prev => prev.filter(c => !locationComps.includes(c)));
      } else {
          setAiComponents(prev => {
              const newSet = new Set([...prev, ...locationComps]);
              return Array.from(newSet);
          });
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
      const { items: parsedData, warnings: apiWarnings } = await parseConstructionData(rawText, instructions, aiLocations, aiComponents, hierarchy);
      
      const newItems: DPRItem[] = parsedData.map(item => ({ 
        ...item, 
        id: crypto.randomUUID(),
        chainageOrArea: (item.chainage || "") + (item.structuralElement ? " " + item.structuralElement : ""), // Fallback
        createdBy: user?.displayName || user?.email || 'Unknown' 
      })) as DPRItem[];

      // Check for unclassified items
      const unclassified = newItems.filter(i => i.location.includes("Unclassified") || i.location.includes("Needs Fix"));
      
      if (unclassified.length > 0) {
          setShowRetryModal(true);
          setPendingItems([]);
          setWarnings([]);
          setIsProcessing(false);
          return;
      }

      if (apiWarnings.length > 0) {
          setPendingItems(newItems);
          setWarnings(apiWarnings);
          setShowWarningModal(true);
          setIsProcessing(false);
          return;
      }
      
      finalizeAdd(newItems);
      
    } catch (err: any) {
      console.error(err);
      setError("Failed to process text. Ensure your connection is stable.");
      setIsProcessing(false);
    }
  };

  const finalizeAdd = (items: DPRItem[]) => {
      onItemsAdded(items, rawText);
      setRawText('');
      setInstructions('');
      setWarnings([]);
      setPendingItems([]);
      setShowWarningModal(false);
      setShowRetryModal(false);
      setIsProcessing(false);
      setModalStep(1); // Start success flow
  };

  const handleManualAdd = () => {
      if(!manualLoc || !manualComp || !manualDesc) {
          setError("Location, Component, and Description are required.");
          return;
      }

      const newItem: DPRItem = {
          id: crypto.randomUUID(),
          location: manualLoc,
          component: manualComp,
          structuralElement: manualElement,
          chainage: manualChainage,
          chainageOrArea: `${manualElement} ${manualChainage}`.trim(),
          activityDescription: manualDesc,
          plannedNextActivity: manualNext,
          createdBy: user?.displayName || user?.email || 'Manual Input'
      };

      onItemsAdded([newItem], `Manual Entry: ${manualDesc}`);
      setManualElement('');
      setManualChainage('');
      setManualDesc('');
      setManualNext('');
      setError(null);
      setModalStep(1);
  };

  const handleNextModal = () => {
    setModalStep(2);
  };

  const handleCloseAll = () => {
    setModalStep(0);
    onViewReport();
  };

  const isAiFormValid = rawText.trim().length > 0 && aiLocations.length > 0 && aiComponents.length > 0;

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
             <div className="flex items-center text-sm text-indigo-600 gap-2 font-bold">
               <i className="fas fa-magic"></i> AI Parsing v2.0
             </div>
             <div className="flex items-center text-sm text-slate-500 gap-2">
               <i className="fas fa-layer-group"></i> 4-Level Hierarchy
             </div>
           </div>
        </div>
      </div>

      {/* INPUT SECTION WRAPPER */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden transition-all relative">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                {mode === 'ai' ? <i className="fab fa-whatsapp text-green-600 text-lg"></i> : <i className="fas fa-keyboard text-slate-500"></i>}
                {mode === 'ai' ? 'Progress Entry' : 'Manual Entry'}
            </h3>
            <button 
                onClick={() => setMode(mode === 'ai' ? 'manual' : 'ai')}
                className="text-xs text-slate-400 hover:text-indigo-600 hover:bg-white border border-transparent hover:border-slate-200 px-3 py-1.5 rounded-full transition-all"
            >
                {mode === 'ai' ? 'Switch to Manual' : 'Back to Smart Entry'}
            </button>
        </div>
        
        {/* AI MODE */}
        {mode === 'ai' && (
            <div className="p-6 md:p-8 space-y-6 animate-fade-in">
            
            {/* Multi-Select Context */}
            <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 space-y-4">
                 
                 {/* 1. Location Selection */}
                 <div>
                    <label className="block text-xs font-bold text-indigo-800 uppercase mb-2">
                       <i className="fas fa-map-marker-alt mr-1"></i> 1. Select Work Locations <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                        {Object.keys(hierarchy).map(loc => {
                            const isSelected = aiLocations.includes(loc);
                            return (
                                <button 
                                    key={loc}
                                    onClick={() => toggleLocation(loc)}
                                    className={`text-left px-3 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-2 ${
                                        isSelected 
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                                        : 'bg-white text-slate-600 border-indigo-200 hover:border-indigo-400'
                                    }`}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-white border-white' : 'border-slate-300'}`}>
                                        {isSelected && <i className="fas fa-check text-indigo-600 text-[10px]"></i>}
                                    </div>
                                    {loc}
                                </button>
                            );
                        })}
                    </div>
                 </div>

                 {/* 2. Component Selection (Conditional) */}
                 {aiLocations.length > 0 && (
                     <div className="animate-fade-in">
                        <label className="block text-xs font-bold text-indigo-800 uppercase mb-2 mt-4">
                           <i className="fas fa-layer-group mr-1"></i> 2. Select Components <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {aiLocations.map(loc => {
                                const components = hierarchy[loc] || [];
                                const selectedCount = components.filter(c => aiComponents.includes(c)).length;
                                const isAllSelected = selectedCount === components.length && components.length > 0;

                                return (
                                    <div key={loc} className="bg-white border border-indigo-100 rounded-lg p-3">
                                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-100">
                                            <span className="text-xs font-bold text-indigo-900">{loc}</span>
                                            <button 
                                                onClick={() => selectAllComponents(loc)}
                                                className="text-[10px] text-indigo-500 hover:text-indigo-700 font-bold"
                                            >
                                                {isAllSelected ? 'Deselect All' : 'Select All'}
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {components.map(comp => {
                                                const isSelected = aiComponents.includes(comp);
                                                return (
                                                    <button
                                                        key={comp}
                                                        onClick={() => toggleComponent(comp)}
                                                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                                                            isSelected
                                                            ? 'bg-indigo-100 text-indigo-700 border-indigo-200 font-bold'
                                                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-indigo-300'
                                                        }`}
                                                    >
                                                        {comp}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                     </div>
                 )}
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Paste Site Engineer's Update</label>
                <div className="relative group">
                    <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Paste text here... e.g., 'Apron concreting 45m3 done. Bifurcation excavation in progress...'"
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

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 mb-1 cursor-pointer" onClick={() => {
                    const el = document.getElementById('extra-instructions');
                    if(el) el.classList.toggle('hidden');
                }}>
                    <i className="fas fa-chevron-right text-xs text-slate-400"></i>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide cursor-pointer select-none">
                        Advanced Instructions
                    </label>
                </div>
                <div id="extra-instructions" className="hidden mt-2">
                    <input
                        type="text"
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder="e.g. 'Split separate locations into different rows'"
                        className="w-full p-2 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:border-indigo-400"
                    />
                </div>
            </div>

            <div className="flex justify-between items-center pt-2">
                <button
                onClick={handleProcessAndAdd}
                disabled={isProcessing || !isAiFormValid}
                className={`flex items-center px-8 py-3.5 rounded-xl font-bold text-white shadow-lg shadow-indigo-500/30 transition-all transform ml-auto
                    ${isProcessing || !isAiFormValid
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
        )}

        {/* MANUAL MODE */}
        {mode === 'manual' && (
            <div className="p-6 md:p-8 space-y-4 animate-fade-in bg-slate-50/30">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Location <span className="text-red-500">*</span></label>
                        <select 
                            value={manualLoc} 
                            onChange={e => {
                                setManualLoc(e.target.value);
                                setManualComp(''); // Reset component when location changes
                            }}
                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="">Select Location...</option>
                            {Object.keys(hierarchy).map(loc => (
                                <option key={loc} value={loc}>{loc}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Component <span className="text-red-500">*</span></label>
                        <select 
                            value={manualComp} 
                            onChange={e => setManualComp(e.target.value)}
                            disabled={!manualLoc}
                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                        >
                            <option value="">Select Component...</option>
                            {manualLoc && hierarchy[manualLoc]?.map(comp => (
                                <option key={comp} value={comp}>{comp}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                     <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Area / Element</label>
                        <input 
                            value={manualElement}
                            onChange={e => setManualElement(e.target.value)}
                            placeholder="Raft, Wall, Slab"
                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                     </div>
                     <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Chainage / EL</label>
                        <input 
                            value={manualChainage}
                            onChange={e => setManualChainage(e.target.value)}
                            placeholder="0+100"
                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                     </div>
                     <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Planned Next</label>
                         <input 
                            value={manualNext}
                            onChange={e => setManualNext(e.target.value)}
                            placeholder="What's next?"
                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                     </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Activity Description <span className="text-red-500">*</span></label>
                    <textarea 
                        value={manualDesc}
                        onChange={e => setManualDesc(e.target.value)}
                        placeholder="e.g. Concrete pouring of 45 m3..."
                        className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none h-24"
                    />
                </div>

                <div className="pt-4 flex justify-end">
                    <button
                        onClick={handleManualAdd}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center"
                    >
                        <i className="fas fa-plus-circle mr-2"></i> Add Entry
                    </button>
                </div>

            </div>
        )}
        
        {error && (
            <div className="mx-6 mb-6 p-4 bg-red-50 text-red-700 rounded-xl text-sm flex items-center border border-red-100 animate-pulse">
              <i className="fas fa-exclamation-triangle mr-3 text-lg"></i> {error}
            </div>
        )}

      </div>

      {/* WARNING MODAL (Default / Chainage Missing) */}
      {showWarningModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center border border-slate-200">
                  <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-lg">
                      <i className="fas fa-exclamation-triangle text-yellow-600 text-3xl"></i>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Review Suggestions</h3>
                  <div className="bg-yellow-50 text-yellow-800 text-sm p-4 rounded-xl text-left mb-6 border border-yellow-200 max-h-40 overflow-y-auto">
                      <ul className="list-disc pl-4 space-y-2">
                          {warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                  </div>
                  <div className="flex gap-3">
                      <button onClick={() => finalizeAdd(pendingItems)} className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700">Proceed Anyway</button>
                      <button onClick={() => { setShowWarningModal(false); setIsProcessing(false); }} className="flex-1 bg-white text-slate-600 border border-slate-300 font-bold py-3 rounded-xl hover:bg-slate-50">Cancel & Edit</button>
                  </div>
              </div>
          </div>
      )}

      {/* RETRY MODAL (Unclassified) */}
      {showRetryModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 text-center border border-slate-200">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-lg">
                      <i className="fas fa-map-signs text-red-600 text-3xl"></i>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Ambiguous Locations</h3>
                  <p className="text-slate-500 mb-4 text-sm">
                      The AI couldn't confidently map some items to your Project Hierarchy.
                      Please review the text and add specific Location names from the selection list.
                  </p>
                  
                  <textarea 
                      value={rawText}
                      onChange={e => setRawText(e.target.value)}
                      className="w-full p-3 border border-red-200 rounded-xl bg-red-50 text-sm font-mono mb-4 h-32 focus:ring-2 focus:ring-red-400 outline-none"
                  />

                  <div className="flex gap-3">
                      <button onClick={handleProcessAndAdd} className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 shadow-lg">
                          Retry Parsing
                      </button>
                      <button onClick={() => { setShowRetryModal(false); }} className="px-4 text-slate-400 hover:text-slate-600 font-bold text-sm">
                          Skip
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* SUCCESS MODAL */}
      {modalStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center border border-slate-200 relative">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-lg">
                 <i className="fas fa-check text-green-600 text-3xl"></i>
              </div>
              
              <h3 className="text-xl font-bold text-slate-800 mb-1">Entry Added!</h3>
              <p className="text-slate-600 mb-6 text-sm">
                 Report updated and Quantities auto-synced.
              </p>
              
              <div className="flex gap-3">
                  <button 
                      onClick={() => setModalStep(0)}
                      className="flex-1 bg-white text-slate-700 border border-slate-300 font-bold py-3 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                      Add More
                  </button>
                  <button 
                      onClick={handleNextModal}
                      className="flex-1 bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-black transition-colors shadow-lg"
                  >
                      Done
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* ANNOUNCEMENT MODAL */}
      {modalStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
           <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl shadow-2xl max-w-md w-full p-8 text-center border border-white/20 relative text-white">
              
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-md">
                 <i className="fas fa-bullhorn text-yellow-300 text-3xl animate-bounce"></i>
              </div>
              
              <h3 className="text-2xl font-bold mb-2">Check Quantities!</h3>
              
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-5 mb-8 text-left border border-white/10">
                 <p className="text-indigo-100 mb-4 leading-relaxed">
                   The <strong className="text-white border-b border-white/50">Quantities Page</strong> syncs automatically.
                 </p>
                 <p className="text-indigo-100 leading-relaxed text-sm">
                   <i className="fas fa-hand-point-right mr-2 text-yellow-300"></i>
                   Please verify the locations and chainages in the Quantity Tab after finishing here.
                 </p>
              </div>

              <button 
                  onClick={handleCloseAll}
                  className="w-full bg-white text-indigo-700 font-bold py-3 rounded-xl hover:bg-indigo-50 transition-colors shadow-lg flex items-center justify-center"
              >
                  Go to Report
              </button>
           </div>
        </div>
      )}

    </div>
  );
};
