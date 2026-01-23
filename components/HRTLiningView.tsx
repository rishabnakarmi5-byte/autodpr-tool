
import React, { useState, useMemo } from 'react';
import { DailyReport, DPRItem } from '../types';

interface HRTLiningViewProps {
  reports: DailyReport[];
  user: any;
  onInspectItem?: (item: DPRItem) => void;
  onHardSync?: () => void;
  blockedItemIds: string[];
  onToggleBlock: (itemId: string) => void;
}

const TOTAL_LENGTH = 2606;

export const HRTLiningView: React.FC<HRTLiningViewProps> = ({ reports, onInspectItem, onHardSync, blockedItemIds, onToggleBlock }) => {
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(TOTAL_LENGTH);
  const [showBlockedManager, setShowBlockedManager] = useState(false);

  const parseCh = (str: string): number | null => {
    if (!str) return null;
    const clean = str.replace(/[^\d\+\.]/g, '');
    if (!clean.includes('+')) return parseFloat(clean) || null;
    const parts = clean.split('+');
    return (parseFloat(parts[0]) * 1000) + (parseFloat(parts[1]) || 0);
  };

  const allRelevantItems = useMemo(() => {
    const items: (DPRItem & { fromCh: number, toCh: number, stage: string, date: string })[] = [];
    const regex = /(?:ch\.?|chainage|@)\s*([0-9\+\.]+)(?:\s*(?:to|[-–—])\s*([0-9\+\.]+))?/i;

    reports.forEach(r => {
      r.entries.forEach(e => {
        const isHRT = e.location.toLowerCase().includes("headrace") || e.location.toLowerCase().includes("hrt");
        if (!isHRT) return;
        
        if (e.itemType !== 'C25 Concrete') return;

        const desc = (e.activityDescription + " " + (e.structuralElement || "")).toLowerCase();
        let stage = "";
        if (desc.includes('invert')) stage = 'Invert';
        else if (desc.includes('kicker')) stage = 'Kicker';
        else if (desc.includes('gantry') || desc.includes('arch')) stage = 'Gantry';

        if (stage) {
          const match = (e.chainage || e.activityDescription || "").match(regex);
          if (match) {
            const start = parseCh(match[1]);
            const end = match[2] ? parseCh(match[2]) : start;
            if (start !== null && end !== null) {
              items.push({ 
                ...e, 
                date: r.date, 
                fromCh: Math.min(start, end), 
                toCh: Math.max(start, end), 
                stage 
              });
            }
          }
        }
      });
    });
    return items;
  }, [reports]);

  const liningItems = useMemo(() => {
      return allRelevantItems.filter(i => !blockedItemIds.includes(i.id)).sort((a,b) => b.fromCh - a.fromCh);
  }, [allRelevantItems, blockedItemIds]);

  const blockedItems = useMemo(() => {
      return allRelevantItems.filter(i => blockedItemIds.includes(i.id)).sort((a,b) => b.fromCh - a.fromCh);
  }, [allRelevantItems, blockedItemIds]);

  const viewWidth = rangeEnd - rangeStart;

  const renderEntryList = (title: string, colorClass: string, stage: string) => {
    const items = liningItems.filter(i => i.stage === stage);
    return (
        <div className={`flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm`}>
            <div className={`p-3 border-b border-slate-100 ${colorClass} bg-opacity-10`}>
                <h3 className={`text-xs font-black uppercase tracking-wider ${colorClass.replace('bg-', 'text-')}`}>{title}</h3>
                <div className="flex justify-between items-center mt-1">
                   <span className="text-[10px] text-slate-400 font-bold">{items.length} Concrete Pours</span>
                </div>
            </div>
            <div className="max-h-[350px] overflow-y-auto p-2 space-y-2">
                {items.length === 0 ? <div className="text-center text-slate-300 text-xs italic py-10">No C25 Concrete data for {stage}</div> : 
                 items.map(item => (
                    <div 
                        key={item.id} 
                        className="p-3 bg-white hover:bg-indigo-50/30 hover:shadow-md border border-slate-100 rounded-lg cursor-pointer transition-all group relative overflow-hidden"
                    >
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-mono font-bold text-slate-400" onClick={() => onInspectItem?.(item)}>{item.date}</span>
                            <div className="flex items-center gap-2">
                               <button 
                                  onClick={(e) => { e.stopPropagation(); if(confirm("Exclude this record from lining progress view permanently?")) onToggleBlock(item.id); }}
                                  className="w-5 h-5 rounded-full bg-slate-100 hover:bg-red-500 hover:text-white flex items-center justify-center text-[10px] text-slate-400 transition-all opacity-0 group-hover:opacity-100"
                                  title="Block Item"
                               >
                                  <i className="fas fa-times"></i>
                               </button>
                               <span onClick={() => onInspectItem?.(item)} className={`text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm border ${colorClass === 'bg-blue-500' ? 'bg-blue-600 border-blue-700' : colorClass === 'bg-green-500' ? 'bg-green-600 border-green-700' : 'bg-red-600 border-red-700'} text-white`}>
                                   {item.quantity > 0 ? `${item.quantity}${item.unit || 'm3'}` : '-'}
                               </span>
                            </div>
                        </div>
                        <div className="text-sm font-bold text-slate-800" onClick={() => onInspectItem?.(item)}>
                             CH {item.fromCh} - {item.toCh}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium truncate mt-1" onClick={() => onInspectItem?.(item)}>
                           {item.activityDescription.substring(0, 40)}...
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">HRT Progress Profile</h2>
          <p className="text-sm text-slate-500 italic">Tracking C25 Concrete pours across 2606.0m alignment</p>
        </div>
        
        <div className="flex items-center gap-3">
            <button 
                onClick={() => setShowBlockedManager(true)}
                className={`bg-white text-amber-600 border border-amber-200 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-amber-50 transition-all ${blockedItemIds.length > 0 ? 'opacity-100' : 'opacity-50'}`}
            >
                <i className="fas fa-ban"></i> {blockedItemIds.length} Blocked
            </button>
            <button onClick={onHardSync} className="bg-white text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-50 transition-all">
                <i className="fas fa-sync-alt"></i> Sync Data
            </button>

            <div className="flex flex-col gap-2 bg-slate-50 p-4 rounded-xl border border-slate-200 w-full md:w-auto">
                <label className="text-[10px] font-black uppercase text-slate-400 flex justify-between">
                    <span>Section Range (Control)</span>
                    <span className="text-indigo-600">{rangeStart}m - {rangeEnd}m</span>
                </label>
                <div className="flex gap-4 items-center">
                    <input type="number" value={rangeStart} onChange={e => setRangeStart(Math.max(0, parseInt(e.target.value) || 0))} className="w-24 p-2 border rounded-lg text-xs font-bold" />
                    <div className="w-20 h-1 bg-slate-200 rounded"></div>
                    <input type="number" value={rangeEnd} onChange={e => setRangeEnd(Math.min(TOTAL_LENGTH, parseInt(e.target.value) || TOTAL_LENGTH))} className="w-24 p-2 border rounded-lg text-xs font-bold" />
                    <button onClick={() => { setRangeStart(0); setRangeEnd(TOTAL_LENGTH); }} className="text-[10px] font-black text-indigo-600 hover:underline uppercase">Reset</button>
                </div>
            </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 relative overflow-hidden">
        <div className="absolute top-8 right-8 flex gap-4 text-[10px] font-black uppercase tracking-widest z-10">
           <span className="flex items-center gap-1.5"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div> Invert</span>
           <span className="flex items-center gap-1.5"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> Kicker</span>
           <span className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-500 rounded-sm"></div> Gantry</span>
        </div>

        <div className="relative h-[400px] border-l-2 border-b-2 border-slate-200 ml-12 mb-8">
          <svg width="100%" height="100%" viewBox={`${rangeStart} 0 ${viewWidth} 300`} preserveAspectRatio="none" className="overflow-visible">
            {[0, 500, 1000, 1500, 2000, 2606].map(m => (
              <g key={m}>
                <line x1={m} y1="0" x2={m} y2="300" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <text x={m} y="320" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#94a3b8" style={{ transform: 'scaleX(1)' }}>{m}m</text>
              </g>
            ))}

            <line x1={rangeStart} y1="125" x2={rangeEnd} y2="125" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="5,5" vectorEffect="non-scaling-stroke" />

            {liningItems.filter(i => i.stage === 'Invert').map(i => (
              <rect key={i.id} x={i.fromCh} y="170" width={Math.max(i.toCh - i.fromCh, 2)} height="40" fill="#3b82f6" fillOpacity="0.8" className="hover:fill-blue-400 cursor-pointer transition-colors" onClick={() => onInspectItem?.(i)} />
            ))}
            {liningItems.filter(i => i.stage === 'Kicker').map(i => (
              <rect key={i.id} x={i.fromCh} y="130" width={Math.max(i.toCh - i.fromCh, 2)} height="40" fill="#22c55e" fillOpacity="0.8" className="hover:fill-green-400 cursor-pointer transition-colors" onClick={() => onInspectItem?.(i)} />
            ))}
            {liningItems.filter(i => i.stage === 'Gantry').map(i => (
              <rect key={i.id} x={i.fromCh} y="60" width={Math.max(i.toCh - i.fromCh, 2)} height="60" fill="#ef4444" fillOpacity="0.8" className="hover:fill-red-400 cursor-pointer transition-colors" onClick={() => onInspectItem?.(i)} />
            ))}
          </svg>

          <div className="absolute left-[-50px] top-[75px] text-[10px] font-black text-red-500 origin-center -rotate-90 uppercase">Gantry</div>
          <div className="absolute left-[-50px] top-[145px] text-[10px] font-black text-green-500 origin-center -rotate-90 uppercase">Kicker</div>
          <div className="absolute left-[-50px] top-[185px] text-[10px] font-black text-blue-500 origin-center -rotate-90 uppercase">Invert</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
          {renderEntryList("Invert Progress", "bg-blue-500", "Invert")}
          {renderEntryList("Kicker Progress", "bg-green-500", "Kicker")}
          {renderEntryList("Gantry Progress", "bg-red-500", "Gantry")}
      </div>

      {showBlockedManager && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden border border-slate-700">
                  <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
                      <div className="flex items-center gap-3">
                          <i className="fas fa-ban text-amber-500 text-xl"></i>
                          <h2 className="font-bold uppercase tracking-tight">Excluded Lining Records</h2>
                      </div>
                      <button onClick={() => setShowBlockedManager(false)} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors">
                          <i className="fas fa-times"></i>
                      </button>
                  </div>
                  <div className="p-6 overflow-y-auto max-h-[60vh] space-y-3">
                      {blockedItems.length === 0 ? (
                          <div className="text-center py-10 text-slate-400 italic">No items are currently blocked from the lining view.</div>
                      ) : blockedItems.map(item => (
                          <div key={item.id} className="p-3 border border-slate-200 rounded-xl flex justify-between items-center bg-slate-50">
                              <div>
                                  <div className="text-xs font-black text-indigo-600 uppercase">CH {item.fromCh} - {item.toCh} ({item.stage})</div>
                                  <div className="text-sm font-medium text-slate-700 truncate max-w-[400px]">{item.activityDescription}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">{item.date} • {item.id.substring(0,8)}</div>
                              </div>
                              <button 
                                  onClick={() => onToggleBlock(item.id)}
                                  className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 transition-all"
                              >
                                  Restore to View
                              </button>
                          </div>
                      ))}
                  </div>
                  <div className="p-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 italic">
                      Records listed here are permanently hidden from the tunnel progress profile chart, even after data sync.
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
