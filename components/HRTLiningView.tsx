
import React, { useMemo } from 'react';
import { DailyReport, DPRItem } from '../types';

interface HRTLiningViewProps {
  reports: DailyReport[];
  user: any;
  onInspectItem?: (item: DPRItem) => void;
}

const TOTAL_LENGTH = 2606;

export const HRTLiningView: React.FC<HRTLiningViewProps> = ({ reports, onInspectItem }) => {
  
  // Extract Lining items dynamically from reports
  const liningItems = useMemo(() => {
      const items: (DPRItem & { fromCh: number, toCh: number, stage: string, date: string })[] = [];
      const regex = /(?:ch\.?|chainage|@)\s*(\d+\+\d+(?:\.\d+)?|[\d\+\-\.]+)(?:\s*(?:to|-)\s*(\d+\+\d+(?:\.\d+)?|[\d\+\-\.]+))/i;

      reports.forEach(r => {
          r.entries.forEach(e => {
              if (e.location.includes("Headrace") || e.location.includes("HRT")) {
                  const desc = (e.activityDescription + " " + (e.structuralElement || "")).toLowerCase();
                  let stage = "";
                  if (desc.includes('invert')) stage = 'Invert';
                  else if (desc.includes('kicker')) stage = 'Kicker';
                  else if (desc.includes('gantry') || desc.includes('arch')) stage = 'Gantry';

                  if (stage) {
                      const match = (e.chainage || e.activityDescription).match(regex);
                      if (match) {
                          const p1 = parseFloat(match[1].replace('+',''));
                          const p2 = parseFloat(match[2].replace('+',''));
                          items.push({
                              ...e,
                              date: r.date,
                              fromCh: Math.min(p1, p2),
                              toCh: Math.max(p1, p2),
                              stage
                          });
                      }
                  }
              }
          });
      });
      return items;
  }, [reports]);

  return (
    <div className="space-y-6 animate-fade-in pb-20">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800">HRT Progress Profile</h2>
            <p className="text-sm text-slate-500">Live visualization from Master Records.</p>
        </div>

        {/* CHART */}
        <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-100 overflow-hidden">
            <div style={{ width: '100%', height: '300px' }} className="relative">
                <svg width="100%" height="100%" viewBox={`0 0 ${TOTAL_LENGTH} 250`} preserveAspectRatio="none">
                    <rect x="0" y="0" width={TOTAL_LENGTH} height="250" fill="#f8fafc" />
                    <line x1="0" y1="125" x2={TOTAL_LENGTH} y2="125" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="10,5" vectorEffect="non-scaling-stroke" />
                    
                    {/* Invert */}
                    {liningItems.filter(i => i.stage === 'Invert').map(i => (
                        <rect 
                            key={i.id} x={i.fromCh} y="180" width={i.toCh - i.fromCh} height="40" 
                            fill="#3b82f6" stroke="white" strokeWidth="0.5" 
                            className="hover:opacity-75 cursor-pointer"
                            onClick={() => onInspectItem && onInspectItem(i)}
                        >
                            <title>Invert: {i.fromCh}-{i.toCh} ({i.date})</title>
                        </rect>
                    ))}

                    {/* Kicker */}
                    {liningItems.filter(i => i.stage === 'Kicker').map(i => (
                        <rect 
                            key={i.id} x={i.fromCh} y="130" width={i.toCh - i.fromCh} height="40" 
                            fill="#22c55e" stroke="white" strokeWidth="0.5" 
                            className="hover:opacity-75 cursor-pointer"
                            onClick={() => onInspectItem && onInspectItem(i)}
                        >
                            <title>Kicker: {i.fromCh}-{i.toCh} ({i.date})</title>
                        </rect>
                    ))}

                    {/* Gantry */}
                    {liningItems.filter(i => i.stage === 'Gantry').map(i => (
                        <rect 
                            key={i.id} x={i.fromCh} y="60" width={i.toCh - i.fromCh} height="60" 
                            fill="#ef4444" stroke="white" strokeWidth="0.5" 
                            className="hover:opacity-75 cursor-pointer"
                            onClick={() => onInspectItem && onInspectItem(i)}
                        >
                            <title>Gantry: {i.fromCh}-{i.toCh} ({i.date})</title>
                        </rect>
                    ))}
                </svg>
            </div>
            <div className="flex justify-center gap-6 mt-4 text-xs font-bold uppercase">
                <span className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500 rounded"></div> Invert</span>
                <span className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded"></div> Kicker</span>
                <span className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500 rounded"></div> Gantry</span>
            </div>
        </div>
    </div>
  );
};
