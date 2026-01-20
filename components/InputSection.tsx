
import React, { useState } from 'react';
import { parseConstructionData } from '../services/geminiService';
import { DPRItem, QuantityEntry } from '../types';
import { getNepaliDate } from '../utils/nepaliDate';
import { identifyItemType, parseQuantityDetails } from '../utils/constants';
import { incrementUserStats, addQuantity } from '../services/firebaseService';

interface InputSectionProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  onItemsAdded: (items: DPRItem[], rawText: string) => void;
  onViewReport: () => void;
  entryCount: number;
  user: any;
  hierarchy: Record<string, string[]>;
}

export const InputSection: React.FC<InputSectionProps> = ({ currentDate, onDateChange, onItemsAdded, onViewReport, entryCount, user, hierarchy }) => {
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiLocations, setAiLocations] = useState<string[]>([]);
  const [aiComponents, setAiComponents] = useState<string[]>([]);
  
  // Review Modal State
  const [reviewItems, setReviewItems] = useState<DPRItem[] | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const handleProcess = async () => {
    if (!rawText.trim() || aiLocations.length === 0) return;
    setIsProcessing(true);
    try {
      const parsedData = await parseConstructionData(rawText, "", aiLocations, aiComponents);
      const itemsWithMeta = parsedData.map(item => ({
        ...item,
        id: crypto.randomUUID(),
        createdBy: user.displayName,
        isDefaulted: item.activityDescription.toLowerCase().includes('concrete') && !/\b(c10|c15|c20|c30|c35)\b/i.test(item.activityDescription)
      })) as DPRItem[];

      // Check for missing hierarchy fields
      const hasMissing = itemsWithMeta.some(i => !i.location || !i.component || !i.chainageOrArea);
      if (hasMissing) setShowWarning(true);
      
      setReviewItems(itemsWithMeta);
    } catch (e) {
      alert("Error parsing data. Try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (!reviewItems) return;
    
    // Auto-Sync Quantities logic
    for (const item of reviewItems) {
      const regex = /(\d+(\.\d+)?)\s*(m3|cum|sqm|sq\.m|m|mtr|nos|t|ton)/i;
      const match = item.activityDescription.match(regex);
      if (match) {
        const details = parseQuantityDetails(item.location, item.component, item.chainageOrArea, item.activityDescription);
        const newQty: QuantityEntry = {
          id: crypto.randomUUID(),
          date: currentDate,
          location: item.location,
          structure: details.structure,
          detailElement: details.detailElement,
          detailLocation: details.detailLocation,
          itemType: identifyItemType(item.activityDescription),
          description: item.activityDescription,
          quantityValue: parseFloat(match[1]),
          quantityUnit: match[3],
          originalRawString: match[0],
          originalReportItemId: item.id,
          lastUpdated: new Date().toISOString(),
          updatedBy: user.displayName
        };
        await addQuantity(newQty);
      }
    }

    await incrementUserStats(user.uid, reviewItems.length);
    onItemsAdded(reviewItems, rawText);
    setReviewItems(null);
    setRawText('');
    onViewReport();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white rounded-2xl p-6 shadow-xl border border-slate-100">
         <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold flex items-center gap-2"><i className="fab fa-whatsapp text-green-500"></i> Smart Progress Entry</h3>
            <input type="date" value={currentDate} onChange={e => onDateChange(e.target.value)} className="text-sm p-2 border rounded-lg bg-slate-50" />
         </div>
         
         <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
           {Object.keys(hierarchy).map(loc => (
             <button key={loc} onClick={() => setAiLocations(prev => prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc])} className={`p-3 rounded-xl border text-xs font-bold transition-all ${aiLocations.includes(loc) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                {loc}
             </button>
           ))}
         </div>

         <textarea value={rawText} onChange={e => setRawText(e.target.value)} placeholder="Paste site update here..." className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm leading-relaxed" />
         
         <div className="mt-6 flex justify-end">
            <button onClick={handleProcess} disabled={isProcessing || !rawText} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">
               {isProcessing ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-wand-magic-sparkles mr-2"></i>}
               Analyze Progress
            </button>
         </div>
      </div>

      {reviewItems && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                 <div>
                    <h3 className="text-xl font-bold">Review Parsed Data</h3>
                    <p className="text-xs text-slate-500">AI has extracted {reviewItems.length} items. Check for accuracy.</p>
                 </div>
                 <button onClick={() => setReviewItems(null)} className="text-slate-400 hover:text-slate-600"><i className="fas fa-times text-xl"></i></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                 {showWarning && (
                   <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-center gap-3 text-red-700">
                      <i className="fas fa-exclamation-triangle text-xl"></i>
                      <p className="text-sm font-medium">Some fields (Location/Component) couldn't be inferred. Please verify before adding.</p>
                   </div>
                 )}
                 {reviewItems.map((item, idx) => (
                   <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="col-span-1"><label className="text-[10px] font-bold text-slate-400 uppercase">Location</label><input className="w-full p-2 text-xs border rounded bg-white" value={item.location} onChange={e => setReviewItems(prev => prev!.map((it, i) => i === idx ? {...it, location: e.target.value} : it))} /></div>
                      <div className="col-span-1"><label className="text-[10px] font-bold text-slate-400 uppercase">Component</label><input className="w-full p-2 text-xs border rounded bg-white" value={item.component} onChange={e => setReviewItems(prev => prev!.map((it, i) => i === idx ? {...it, component: e.target.value} : it))} /></div>
                      <div className="col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase">Description</label><input className="w-full p-2 text-xs border rounded bg-white" value={item.activityDescription} onChange={e => setReviewItems(prev => prev!.map((it, i) => i === idx ? {...it, activityDescription: e.target.value} : it))} /></div>
                      {item.isDefaulted && <p className="col-span-4 text-[10px] text-amber-600 italic"><i className="fas fa-info-circle"></i> Grade not specified. Defaulted to <strong>C25 Concrete</strong>. Edit if needed.</p>}
                   </div>
                 ))}
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex gap-3">
                 <button onClick={() => { setReviewItems(null); setShowWarning(false); }} className="flex-1 bg-white border border-slate-300 py-3 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-all">
                    Retry Parsing
                 </button>
                 <button onClick={handleFinalSubmit} className="flex-[2] bg-indigo-600 py-3 rounded-xl font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                    <i className="fas fa-check-double"></i> Confirm & Sync Everything
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
