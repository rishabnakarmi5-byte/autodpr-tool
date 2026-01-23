
import React, { useState, useMemo } from 'react';
import { DailyReport, DPRItem } from '../types';

interface HRTLiningViewProps {
  reports: DailyReport[];
  user: any;
  onInspectItem?: (item: DPRItem) => void;
  onHardSync?: () => void;
}

const TOTAL_LENGTH = 2606;

export const HRTLiningView: React.FC<HRTLiningViewProps> = ({ reports, onInspectItem, onHardSync }) => {
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(TOTAL_LENGTH);

  const parseCh = (str: string): number | null => {
    if (!str) return null;
    const clean = str.replace(/[^\d\+\.]/g, '');
    if (!clean.includes('+')) return parseFloat(clean) || null;
    const parts = clean.split('+');
    return (parseFloat(parts[0]) * 1000) + (parseFloat(parts[1]) || 0);
  };

  const liningItems = useMemo(() => {
    const items: (DPRItem & { fromCh: number, toCh: number, stage: string, date: string })[] = [];
    const regex = /(?:ch\.?|chainage|@)\s*([0-9\+\.]+)(?:\s*(?:to|[-–—])\s*([0-9\+\.]+))?/i;

    reports.forEach(r => {
      r.entries.forEach(e => {
        const isHRT = e.location.toLowerCase().includes("headrace") || e.location.toLowerCase().includes("hrt");
        if (!isHRT) return;
        
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
              items.push({ ...e, date: r.date, fromCh: Math.min(start, end), toCh: Math.max(start, end), stage });
            }
          }
        }
      });
    });
    return items.sort((a,b) => b.fromCh - a.fromCh);
  }, [reports]);

  const viewWidth = rangeEnd - rangeStart;

  const renderEntryList = (title: string, colorClass: string, stage: string) => {
    const items = liningItems.filter(i => i.stage === stage);
    return (
        <div className={`flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm`}>
            <div className={`p-3 border-b border-slate-100 ${colorClass} bg-opacity-10`}>
                <h3 className={`text-xs font-black uppercase tracking-wider ${colorClass.replace('bg-', 'text-')}`}>{title}</h3>
                <span className="text-[10px] text-slate-400 font-bold">{items.length} Entries</span>
            </div>
            <div className="max-h-[300px] overflow-y-auto p-2 space-y-2">
                {items.length === 0 ? <div className="text-center text-slate-300 text-xs italic py-4">No data</div> : 
                 items.map(item => (
                    <div 
                        key={item.id} 
                        onClick={() => onInspectItem?.(item)}
                        className="p-3 bg-slate-50 hover:bg-white hover:shadow-md border border-slate-100 rounded-lg cursor-pointer transition-all group"
                    >
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-mono font-bold text-slate-500">{item.date}</span>
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded text-white ${colorClass.replace('bg-opacity-10', '')}`}>{item.quantity > 0 ? `${item.quantity}${item.unit}` : '-'}</span>
                        </div>
                        <div className="text-xs font-bold text-slate-800">
                             CH {item.fromCh} - {item.toCh}
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
          <p className="text-sm text-slate-500 italic">Total Alignment: 2606.0m</p>
        </div>
        
        <div className="flex items-center gap-4">
            <button onClick={onHardSync} className="bg-white text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-50 transition-all">
                <i className="fas fa-sync-alt"></i> Sync Data
            </button>

            <div className="flex flex-col gap-2 bg-slate-50 p-4 rounded-xl border border-slate-200 w-full md:w-auto">
            <label className="text-[10px] font-black uppercase text-slate-400 flex justify-between">
                <span>Break Profile Sections (Coordinate Control)</span>
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
            {/* Grid & Axis Markers */}
            {[0, 500, 1000, 1500, 2000, 2606].map(m => (
              <g key={m}>
                <line x1={m} y1="0" x2={m} y2="300" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <text x={m} y="320" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#94a3b8" style={{ transform: 'scaleX(1)' }}>{m}m</text>
              </g>
            ))}

            <line x1={rangeStart} y1="125" x2={rangeEnd} y2="125" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="5,5" vectorEffect="non-scaling-stroke" />

            {/* Pour Layers */}
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

          {/* Vertical Labels */}
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
    </div>
  );
};
