import React, { useState } from 'react';
import { parseConstructionData } from '../services/geminiService';
import { DPRItem } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';
import { LOCATION_HIERARCHY } from '../utils/constants';

interface InputSectionProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  onItemsAdded: (items: DPRItem[], rawText: string) => void;
  onViewReport: () => void;
  entryCount: number;
  user: any;
}

type InputMode = 'ai' | 'manual';

export const InputSection: React.FC<InputSectionProps> = ({ currentDate, onDateChange, onItemsAdded, onViewReport, entryCount, user }) => {
  const [mode, setMode] = useState<InputMode>('ai');
  
  // AI State
  const [rawText, setRawText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // AI Context State
  const [aiLocation, setAiLocation] = useState('');
  const [aiComponent, setAiComponent] = useState('');

  // Manual State
  const [manualLoc, setManualLoc] = useState('');
  const [manualComp, setManualComp] = useState('');
  const [manualChainage, setManualChainage] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualNext, setManualNext] = useState('');
  
  // Modal State: 0 = closed, 1 = success, 2 = announcement
  const [modalStep, setModalStep] = useState<number>(0);
  
  const dateObj = new Date(currentDate);
  const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const nepaliDate = getNepaliDate(currentDate);

  const handleProcessAndAdd = async () => {
    if (!rawText.trim() || !aiLocation || !aiComponent) {
        setError("Please select a Location and Component, and enter text.");
        return;
    }
    
    setIsProcessing(true);
    setError(null);
    try {
      const parsedData = await parseConstructionData(rawText, instructions, aiLocation, aiComponent);
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

  const handleManualAdd = () => {
      if(!manualLoc || !manualComp || !manualDesc) {
          setError("Location, Component, and Description are required.");
          return;
      }

      const newItem: DPRItem = {
          id: crypto.randomUUID(),
          location: manualLoc,
          component: manualComp,
          chainageOrArea: manualChainage,
          activityDescription: manualDesc,
          plannedNextActivity: manualNext,
          createdBy: user?.displayName || user?.email || 'Manual Input'
      };

      onItemsAdded([newItem], `Manual Entry: ${manualDesc}`);
      
      // Reset form
      setManualChainage('');
      setManualDesc('');
      setManualNext('');
      setError(null);
      
      // Keep location/component for rapid entry of similar items
      setModalStep(1);
  };

  const handleNextModal = () => {
    setModalStep(2);
  };

  const handleCloseAll = () => {
    setModalStep(0);
    onViewReport();
  };

  // Helper to check validity of AI form
  const isAiFormValid = rawText.trim().length > 0 && aiLocation !== '' && aiComponent !== '';

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

      {/* INPUT SECTION WRAPPER */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden transition-all">
        
        {/* Toggle Header */}
        <div className="p-2 bg-slate-50 border-b border-slate-200 flex gap-2">
            <button 
                onClick={() => setMode('ai')}
                className={`flex-1 py-3 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all ${mode === 'ai' ? 'bg-white text-indigo-600 shadow-md ring-1 ring-slate-200' : 'text-slate-500 hover:bg-slate-100'}`}
            >
                <i className="fab fa-whatsapp text-lg"></i> AI Text Parser
            </button>
            <button 
                onClick={() => setMode('manual')}
                className={`flex-1 py-3 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all ${mode === 'manual' ? 'bg-white text-indigo-600 shadow-md ring-1 ring-slate-200' : 'text-slate-500 hover:bg-slate-100'}`}
            >
                <i className="fas fa-keyboard text-lg"></i> Manual Entry
            </button>
        </div>
        
        {/* AI MODE */}
        {mode === 'ai' && (
            <div className="p-6 md:p-8 space-y-6 animate-fade-in">
            
            {/* Compulsory Selectors */}
            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-bold text-indigo-800 uppercase mb-1">
                       <i className="fas fa-map-marker-alt mr-1"></i> Location <span className="text-red-500">*</span>
                    </label>
                    <select 
                        value={aiLocation} 
                        onChange={e => {
                            setAiLocation(e.target.value);
                            setAiComponent(''); // Reset component
                        }}
                        className={`w-full p-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-400 outline-none ${!aiLocation ? 'border-red-300' : 'border-indigo-200'}`}
                    >
                        <option value="">Select Location...</option>
                        {Object.keys(LOCATION_HIERARCHY).map(loc => (
                            <option key={loc} value={loc}>{loc}</option>
                        ))}
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-indigo-800 uppercase mb-1">
                       <i className="fas fa-layer-group mr-1"></i> Component <span className="text-red-500">*</span>
                    </label>
                    <select 
                        value={aiComponent} 
                        onChange={e => setAiComponent(e.target.value)}
                        disabled={!aiLocation}
                        className={`w-full p-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-400 outline-none disabled:opacity-50 ${!aiComponent ? 'border-red-300' : 'border-indigo-200'}`}
                    >
                        <option value="">Select Component...</option>
                        {aiLocation && LOCATION_HIERARCHY[aiLocation]?.map(comp => (
                            <option key={comp} value={comp}>{comp}</option>
                        ))}
                    </select>
                 </div>
                 <div className="md:col-span-2 text-[10px] text-indigo-600 italic">
                     * These selections tell the AI exactly where this work belongs.
                 </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Paste Site Engineer's Update</label>
                <div className="relative group">
                    <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Paste text here... e.g., 'Apron concreting 45m3 done...'"
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
                <p className="text-xs text-slate-400 hidden md:block">
                    <i className="fas fa-shield-alt mr-1"></i> Data backed up automatically
                </p>
                <button
                onClick={handleProcessAndAdd}
                disabled={isProcessing || !isAiFormValid}
                className={`flex items-center px-8 py-3.5 rounded-xl font-bold text-white shadow-lg shadow-indigo-500/30 transition-all transform
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
                            {Object.keys(LOCATION_HIERARCHY).map(loc => (
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
                            {manualLoc && LOCATION_HIERARCHY[manualLoc]?.map(comp => (
                                <option key={comp} value={comp}>{comp}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                     <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Chainage / Area</label>
                        <input 
                            value={manualChainage}
                            onChange={e => setManualChainage(e.target.value)}
                            placeholder="e.g. Ch 0 to 15m"
                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                     </div>
                     <div className="md:col-span-3">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Activity Description <span className="text-red-500">*</span></label>
                        <input 
                            value={manualDesc}
                            onChange={e => setManualDesc(e.target.value)}
                            placeholder="e.g. Concrete pouring of 45 m3..."
                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                     </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Planned Next Activity</label>
                    <input 
                        value={manualNext}
                        onChange={e => setManualNext(e.target.value)}
                        placeholder="What's next?"
                        className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
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

      {/* STEP 1: SUCCESS MODAL */}
      {modalStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center border border-slate-200 relative">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-lg">
                 <i className="fas fa-check text-green-600 text-3xl"></i>
              </div>
              
              <h3 className="text-xl font-bold text-slate-800 mb-1">Entry Added!</h3>
              <p className="text-slate-600 mb-6 text-sm">
                 Item successfully added to the daily report.
              </p>
              
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6 text-left shadow-inner">
                 <ul className="space-y-3 text-sm text-slate-700">
                    <li className="flex items-start gap-3">
                       <i className="fab fa-whatsapp text-green-500 mt-1 text-lg flex-shrink-0"></i>
                       <span className="font-bold">Don't forget to send photos in WhatsApp!</span>
                    </li>
                 </ul>
              </div>

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

      {/* STEP 2: ANNOUNCEMENT MODAL */}
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