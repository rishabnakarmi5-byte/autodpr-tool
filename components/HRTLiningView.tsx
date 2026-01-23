
import React, { useMemo } from 'react';
import { DailyReport, DPRItem } from '../types';

interface HRTLiningViewProps {
  reports: DailyReport[];
  user: any;
  onInspectItem?: (item: DPRItem) => void;
}

const TOTAL_LENGTH = 2606;

export const HRTLiningView: React.FC<HRTLiningViewProps> = ({ reports, onInspectItem }) => {
  
  // Robust Chainage Parser
  const parseCh = (str: string): number | null => {
    if (!str) return null;
    const clean = str.replace(/[^\d\+\.]/g, ''); // Keep digits, plus, and dots
    if (!clean.includes('+')) {
        const num = parseFloat(clean);
        return isNaN(num) ? null : num;
    }
    const parts = clean.split('+');
    const km = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    return (km * 1000) + m;
  };

  // Extract Lining items dynamically from reports
  const liningItems = useMemo(() => {
      const items: (DPRItem & { fromCh: number, toCh: number, stage: string, date: string })[] = [];
      // Improved regex to handle various separator styles and optional "to"
      const regex = /(?:ch\.?|chainage|@)\s*([0-9\+\.]+)(?:\s*(?:to|[-–—])\s*([0-9\+\.]+))?/i;

      reports.forEach(r => {
          r.entries.forEach(e => {
              // Rule: Must be HRT location and mention Concrete (specifically C25 as per user request)
              const isHRT = e.location.toLowerCase().includes("headrace") || e.location.toLowerCase().includes("hrt");
              if (!isHRT) return;

              const desc = (e.activityDescription + " " + (e.structuralElement || "")).toLowerCase();
              const isConcrete = desc.includes('concrete') || desc.includes('conc') || e.itemType?.includes('Concrete');
              
              if (isConcrete) {
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
              }
          });
      });
      return items;
  }, [reports]);

  // Generate X-axis markers every 200m
  const markers = useMemo(() => {
    const arr = [];
    for (let i = 0; i <= TOTAL_LENGTH; i += 200) arr.push(i);
    if (arr[arr.length - 1] !== TOTAL_LENGTH) arr.push(TOTAL_LENGTH);
    return arr;
  }, []);

  return (
    <div className="space-y-6 animate-fade-in pb-20">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 uppercase tracking-tight">HRT Progress Profile</h2>
                <p className="text-sm text-slate-500">Visualization of C25 Concrete lining from Master Records.</p>
            </div>
            <div className="text-right">
                <span className="text-xs font-bold text-slate-400 uppercase block">Total Span</span>
                <span className="text-xl font-mono font-bold text-slate-700">0m - {TOTAL_LENGTH}m</span>
            </div>
        </div>

        {/* CHART CONTAINER */}
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
            <div className="relative w-full h-[350px] bg-slate-50 rounded-xl border border-slate-200 overflow-hidden shadow-inner">
                {/* SVG Layers */}
                <svg 
                    width="100%" 
                    height="100%" 
                    viewBox={`-50 0 ${TOTAL_LENGTH + 100} 300`} 
                    preserveAspectRatio="none"
                    className="overflow-visible"
                >
                    {/* Background Grid Lines */}
                    {markers.map(m => (
                        <g key={`grid-${m}`}>
                            <line 
                                x1={m} y1="40" x2={m} y2="240" 
                                stroke="#e2e8f0" strokeWidth="1" 
                                vectorEffect="non-scaling-stroke"
                            />
                            <text 
                                x={m} y="260" 
                                fontSize="12" fill="#94a3b8" 
                                textAnchor="middle" 
                                className="font-mono font-bold"
                                vectorEffect="non-scaling-stroke"
                                style={{ transform: 'scaleX(0.2)', transformOrigin: `${m}px 0` }}
                            >
                                {m}m
                            </text>
                        </g>
                    ))}

                    {/* Stage Horizontal Tracks (Labels) */}
                    <text x="-10" y="200" fontSize="14" fontWeight="bold" fill="#3b82f6" textAnchor="end">INVERT</text>
                    <text x="-10" y="150" fontSize="14" fontWeight="bold" fill="#22c55e" textAnchor="end">KICKER</text>
                    <text x="-10" y="90" fontSize="14" fontWeight="bold" fill="#ef4444" textAnchor="end">GANTRY</text>

                    <line x1="0" y1="125" x2={TOTAL_LENGTH} y2="125" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="5,5" vectorEffect="non-scaling-stroke" />
                    
                    {/* Invert Segments */}
                    {liningItems.filter(i => i.stage === 'Invert').map(i => {
                        const width = Math.max(i.toCh - i.fromCh, 2); // Minimum 2m width for visibility
                        return (
                            <rect 
                                key={i.id} x={i.fromCh} y="175" width={width} height="40" 
                                fill="#3b82f6" fillOpacity="0.8" stroke="#1d4ed8" strokeWidth="0.5" 
                                className="hover:fill-blue-400 cursor-pointer transition-colors"
                                onClick={() => onInspectItem && onInspectItem(i)}
                            >
                                <title>{`Invert: ${i.fromCh}m - ${i.toCh}m\nDate: ${i.date}\nQty: ${i.quantity} ${i.unit}`}</title>
                            </rect>
                        );
                    })}

                    {/* Kicker Segments */}
                    {liningItems.filter(i => i.stage === 'Kicker').map(i => {
                        const width = Math.max(i.toCh - i.fromCh, 2);
                        return (
                            <rect 
                                key={i.id} x={i.fromCh} y="130" width={width} height="40" 
                                fill="#22c55e" fillOpacity="0.8" stroke="#15803d" strokeWidth="0.5" 
                                className="hover:fill-green-400 cursor-pointer transition-colors"
                                onClick={() => onInspectItem && onInspectItem(i)}
                            >
                                <title>{`Kicker: ${i.fromCh}m - ${i.toCh}m\nDate: ${i.date}\nQty: ${i.quantity} ${i.unit}`}</title>
                            </rect>
                        );
                    })}

                    {/* Gantry Segments */}
                    {liningItems.filter(i => i.stage === 'Gantry').map(i => {
                        const width = Math.max(i.toCh - i.fromCh, 2);
                        return (
                            <rect 
                                key={i.id} x={i.fromCh} y="60" width={width} height="60" 
                                fill="#ef4444" fillOpacity="0.8" stroke="#b91c1c" strokeWidth="0.5" 
                                className="hover:fill-red-400 cursor-pointer transition-colors"
                                onClick={() => onInspectItem && onInspectItem(i)}
                            >
                                <title>{`Gantry: ${i.fromCh}m - ${i.toCh}m\nDate: ${i.date}\nQty: ${i.quantity} ${i.unit}`}</title>
                            </rect>
                        );
                    })}
                </svg>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-8">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-blue-600 uppercase">Invert Done</span>
                        <i className="fas fa-layer-group text-blue-200"></i>
                    </div>
                    <div className="text-xl font-bold text-blue-900">
                        {liningItems.filter(i => i.stage === 'Invert').reduce((acc, i) => acc + (i.toCh - i.fromCh), 0).toFixed(1)}m
                    </div>
                </div>
                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-green-600 uppercase">Kicker Done</span>
                        <i className="fas fa-layer-group text-green-200"></i>
                    </div>
                    <div className="text-xl font-bold text-green-900">
                        {liningItems.filter(i => i.stage === 'Kicker').reduce((acc, i) => acc + (i.toCh - i.fromCh), 0).toFixed(1)}m
                    </div>
                </div>
                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-red-600 uppercase">Gantry Done</span>
                        <i className="fas fa-layer-group text-red-200"></i>
                    </div>
                    <div className="text-xl font-bold text-red-900">
                        {liningItems.filter(i => i.stage === 'Gantry').reduce((acc, i) => acc + (i.toCh - i.fromCh), 0).toFixed(1)}m
                    </div>
                </div>
            </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3 items-start">
            <i className="fas fa-info-circle text-amber-500 mt-1"></i>
            <div className="text-sm text-amber-900">
                <p className="font-bold">Interaction Tip:</p>
                <p>Click on any colored segment in the chart above to open its <strong>Master Record Card</strong>. You can verify quantities, edit chainages, or view the source text directly from there.</p>
            </div>
        </div>
    </div>
  );
};
