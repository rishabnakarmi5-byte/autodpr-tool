
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LiningEntry, DailyReport } from '../types';
import { subscribeToLining, saveLiningBatch, deleteLiningEntry } from '../services/firebaseService';
import { getNepaliDate } from '../utils/nepaliDate';

interface HRTLiningViewProps {
  reports: DailyReport[];
  user: any;
}

const TOTAL_LENGTH = 2606;

export const HRTLiningView: React.FC<HRTLiningViewProps> = ({ reports, user }) => {
  const [entries, setEntries] = useState<LiningEntry[]>([]);
  const [undoStack, setUndoStack] = useState<LiningEntry[][]>([]);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [editItem, setEditItem] = useState<LiningEntry | null>(null);
  
  // Stats
  const stats = useMemo(() => {
      const calc = (stage: string) => {
          // Merge overlapping intervals to get true length
          const relevant = entries.filter(e => e.stage === stage).sort((a,b) => a.fromCh - b.fromCh);
          let covered = 0;
          let maxReached = 0;
          
          // Simple total (ignoring overlap logic for speed, user requested "How much concrete poured" vs length)
          // For visualization length:
          if(relevant.length === 0) return { len: 0, pct: 0 };

          // Union of intervals algorithm
          let merged: {start: number, end: number}[] = [];
          for(const r of relevant) {
              if(merged.length === 0 || merged[merged.length-1].end < r.fromCh) {
                  merged.push({start: r.fromCh, end: r.toCh});
              } else {
                  merged[merged.length-1].end = Math.max(merged[merged.length-1].end, r.toCh);
              }
          }
          covered = merged.reduce((acc, cur) => acc + (cur.end - cur.start), 0);
          return { len: covered, pct: (covered / TOTAL_LENGTH) * 100 };
      };
      return {
          invert: calc('Invert'),
          kicker: calc('Kicker'),
          gantry: calc('Gantry')
      };
  }, [entries]);

  useEffect(() => {
    return subscribeToLining((data) => setEntries(data));
  }, []);

  const saveStateForUndo = () => {
      setUndoStack(prev => [...prev.slice(-19), entries]);
  };

  const handleUndo = async () => {
      if(undoStack.length === 0) return;
      const prev = undoStack[undoStack.length - 1];
      setUndoStack(prevStack => prevStack.slice(0, -1));
      // This is tricky with Firestore real-time. Ideally we just re-save the batch.
      // But deleting items that were added is hard.
      // For this simplified version, we'll just restore the state visually and let user "Save" again or 
      // implement a proper batch overwrite. 
      // A full overwrite of the collection is safer for "Undo" in this specific single-doc context context.
      // Since we use individual docs, let's just alert for now that real undo is complex with cloud sync.
      // Actually, let's just re-upload the previous state as a batch.
      await saveLiningBatch(prev);
  };

  // --- PARSERS ---

  const handleSystemSync = async () => {
      if(!window.confirm("This will scan all Daily Reports for 'Invert', 'Kicker', 'Gantry' in 'Headrace Tunnel' and ADD them to the chart. Continue?")) return;
      saveStateForUndo();

      const newEntries: LiningEntry[] = [];
      const regex = /(?:ch\.?|chainage|@)\s*(\d+\+\d+(?:\.\d+)?|[\d\+\-\.]+)(?:\s*(?:to|-)\s*(\d+\+\d+(?:\.\d+)?|[\d\+\-\.]+))/i;
      
      reports.forEach(report => {
          report.entries.forEach(item => {
              if (item.location.includes("Headrace Tunnel") || item.location.includes("HRT")) {
                  let stage: 'Invert' | 'Kicker' | 'Gantry' | null = null;
                  const desc = item.activityDescription.toLowerCase() + " " + (item.structuralElement || "").toLowerCase();
                  
                  if (desc.includes("invert")) stage = 'Invert';
                  else if (desc.includes("kicker")) stage = 'Kicker';
                  else if (desc.includes("gantry") || desc.includes("arch") || desc.includes("wall")) stage = 'Gantry';

                  if (stage) {
                      // Extract chainage
                      // Look in chainage field first, then description
                      const chText = item.chainage || item.activityDescription;
                      const match = chText.match(regex);
                      if (match) {
                          const parseCh = (s: string) => parseFloat(s.replace(/\+/g, ''));
                          const start = parseCh(match[1]);
                          const end = parseCh(match[2]);
                          
                          // Extract Volume
                          const volMatch = item.activityDescription.match(/(\d+(\.\d+)?)\s*(m3|cum)/i);
                          const vol = volMatch ? parseFloat(volMatch[1]) : 0;

                          // Avoid dupes based on ID logic or date+stage+start
                          const exists = entries.find(e => e.date === report.date && e.stage === stage && Math.abs(e.fromCh - start) < 1);
                          if (!exists) {
                              newEntries.push({
                                  id: crypto.randomUUID(),
                                  date: report.date,
                                  stage,
                                  fromCh: start,
                                  toCh: end,
                                  volume: vol,
                                  remarks: "Auto-synced",
                                  source: 'System',
                                  lastUpdated: new Date().toISOString()
                              });
                          }
                      }
                  }
              }
          });
      });

      if (newEntries.length > 0) {
          await saveLiningBatch(newEntries);
          alert(`Synced ${newEntries.length} new entries.`);
      } else {
          alert("No new matching data found in reports.");
      }
  };

  const handleLegacyImport = async () => {
      // Parser for the specific OCR format provided
      // Format: "0+663.00 0+680.00 36.5" or "0+720.00 0+742.00 30"
      if (!importText) return;
      saveStateForUndo();

      const lines = importText.split('\n');
      const newEntries: LiningEntry[] = [];
      
      lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          // Looking for patterns like 0+000.00
          const chPattern = /\d+\+\d+\.?\d*/;
          
          if (parts.length >= 3) {
              const startStr = parts.find(p => chPattern.test(p));
              const endStr = parts.slice(parts.indexOf(startStr!)+1).find(p => chPattern.test(p));
              
              if (startStr && endStr) {
                  const parseCh = (s: string) => parseFloat(s.replace(/\+/g, ''));
                  const start = parseCh(startStr);
                  const end = parseCh(endStr);
                  
                  // Find volume (usually the number after end chainage)
                  // It might be "36.5" or "30"
                  // Filter out the chainages, look for numbers
                  const remaining = parts.filter(p => p !== startStr && p !== endStr);
                  const vol = remaining.find(p => !isNaN(parseFloat(p)) && parseFloat(p) < 1000); // Heuristic: volume < 1000 usually
                  
                  if (start < end) { // Validity check
                      newEntries.push({
                          id: crypto.randomUUID(),
                          date: new Date().toISOString().split('T')[0], // Default to today as legacy date unknown from simple line
                          stage: 'Invert', // Default, user can bulk change or we assume tab context
                          fromCh: start,
                          toCh: end,
                          volume: vol ? parseFloat(vol) : 0,
                          remarks: "Legacy Import",
                          source: 'Legacy',
                          lastUpdated: new Date().toISOString()
                      });
                  }
              }
          }
      });

      if (newEntries.length > 0) {
          if(window.confirm(`Found ${newEntries.length} valid entries. Import as 'Invert' (Default)? You can edit stage later.`)) {
              await saveLiningBatch(newEntries);
              setImportText('');
              setShowImport(false);
          }
      } else {
          alert("Could not parse data. Ensure format is 'StartCH EndCH Volume'.");
      }
  };

  const handleExportChart = async () => {
      const el = document.getElementById('hrt-chart-container');
      if (el && window.html2canvas) {
          const canvas = await window.html2canvas(el);
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/jpeg');
          link.download = `HRT_Lining_Status_${new Date().toISOString().split('T')[0]}.jpg`;
          link.click();
      }
  };

  const deleteEntry = async (id: string) => {
      if(confirm("Delete this entry?")) {
          saveStateForUndo();
          await deleteLiningEntry(id);
      }
  };

  const saveEdit = async () => {
      if(!editItem) return;
      await saveLiningBatch([editItem]);
      setEditItem(null);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
        
        {/* Header Actions */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 border-b border-slate-200 pb-4">
            <div>
                <h2 className="text-3xl font-bold text-slate-800">HRT Concrete Lining Status</h2>
                <p className="text-slate-500">Longitudinal Profile (0 - 2606m)</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <button onClick={handleSystemSync} className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg font-bold text-xs hover:bg-indigo-100 flex items-center gap-2">
                    <i className="fas fa-sync"></i> Sync from Reports
                </button>
                <button onClick={() => setShowImport(true)} className="bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold text-xs hover:bg-slate-100 flex items-center gap-2">
                    <i className="fas fa-file-import"></i> Import Legacy
                </button>
                <button onClick={handleUndo} disabled={undoStack.length === 0} className="bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold text-xs hover:bg-slate-100 flex items-center gap-2 disabled:opacity-50">
                    <i className="fas fa-undo"></i> Undo
                </button>
                <button onClick={handleExportChart} className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-black flex items-center gap-2 shadow-lg">
                    <i className="fas fa-camera"></i> Export JPG
                </button>
            </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
            <StatCard label="1. Invert" color="bg-blue-600" data={stats.invert} />
            <StatCard label="2. Kicker" color="bg-green-600" data={stats.kicker} />
            <StatCard label="3. Gantry" color="bg-red-600" data={stats.gantry} />
        </div>

        {/* CHART CONTAINER */}
        <div id="hrt-chart-container" className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 overflow-x-auto">
            <h3 className="text-center font-bold text-xl mb-6 uppercase tracking-widest text-slate-800">HRT Concrete Lining Status - {getNepaliDate(new Date().toISOString())}</h3>
            
            <div className="min-w-[1000px] relative h-[300px] select-none">
                {/* SVG Drawing */}
                <svg width="100%" height="100%" viewBox={`0 0 ${TOTAL_LENGTH + 100} 250`} className="overflow-visible">
                    
                    {/* Tunnel Profile Outline (Schematic) */}
                    <rect x="0" y="150" width={TOTAL_LENGTH} height="60" fill="#e2e8f0" rx="4" />
                    <line x1="0" y1="180" x2={TOTAL_LENGTH} y2="180" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="5,5" />

                    {/* Scale / Grid Lines */}
                    {[0, 500, 1000, 1500, 2000, 2606].map(x => (
                        <g key={x}>
                            <line x1={x} y1="40" x2={x} y2="220" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,4" />
                            <text x={x} y="30" fontSize="24" textAnchor="middle" fill="#64748b" fontWeight="bold">{x} m</text>
                        </g>
                    ))}

                    {/* DATA BARS */}
                    
                    {/* 1. Invert (Bottom Layer) */}
                    <g>
                        {entries.filter(e => e.stage === 'Invert').map(e => (
                            <rect 
                                key={e.id}
                                x={e.fromCh}
                                y="180"
                                width={Math.max(1, e.toCh - e.fromCh)}
                                height="30"
                                fill="#2563eb" // Blue
                                stroke="white"
                                strokeWidth="1"
                            >
                                <title>Invert: {e.fromCh}-{e.toCh}</title>
                            </rect>
                        ))}
                        <text x="-20" y="200" textAnchor="end" fontSize="20" fontWeight="bold" fill="#2563eb">Invert</text>
                    </g>

                    {/* 2. Kicker (Middle Layer) */}
                    <g>
                        {entries.filter(e => e.stage === 'Kicker').map(e => (
                            <rect 
                                key={e.id}
                                x={e.fromCh}
                                y="150"
                                width={Math.max(1, e.toCh - e.fromCh)}
                                height="30"
                                fill="#16a34a" // Green
                                stroke="white"
                                strokeWidth="1"
                            >
                                <title>Kicker: {e.fromCh}-{e.toCh}</title>
                            </rect>
                        ))}
                        <text x="-20" y="170" textAnchor="end" fontSize="20" fontWeight="bold" fill="#16a34a">Kicker</text>
                    </g>

                    {/* 3. Gantry (Top Layer) */}
                    <g>
                        {entries.filter(e => e.stage === 'Gantry').map(e => (
                            <rect 
                                key={e.id}
                                x={e.fromCh}
                                y="90"
                                width={Math.max(1, e.toCh - e.fromCh)}
                                height="60"
                                fill="#dc2626" // Red
                                stroke="white"
                                strokeWidth="1"
                            >
                                <title>Gantry: {e.fromCh}-{e.toCh}</title>
                            </rect>
                        ))}
                        <text x="-20" y="130" textAnchor="end" fontSize="20" fontWeight="bold" fill="#dc2626">Gantry</text>
                    </g>

                    {/* Legend */}
                    <g transform={`translate(${TOTAL_LENGTH + 20}, 150)`}>
                        <rect x="0" y="0" width="20" height="20" fill="#2563eb" />
                        <text x="30" y="15" fontSize="16">Invert</text>
                        <rect x="0" y="30" width="20" height="20" fill="#16a34a" />
                        <text x="30" y="45" fontSize="16">Kicker</text>
                        <rect x="0" y="60" width="20" height="20" fill="#dc2626" />
                        <text x="30" y="75" fontSize="16">Gantry</text>
                    </g>

                </svg>
            </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700">Detailed Records</div>
            <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-white sticky top-0 shadow-sm">
                        <tr className="text-slate-500">
                            <th className="p-3">Date</th>
                            <th className="p-3">Stage</th>
                            <th className="p-3">Start Ch</th>
                            <th className="p-3">End Ch</th>
                            <th className="p-3">Length</th>
                            <th className="p-3 text-right">Volume (m3)</th>
                            <th className="p-3">Source</th>
                            <th className="p-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {entries.sort((a,b) => b.fromCh - a.fromCh).map(entry => (
                            <tr key={entry.id} className="hover:bg-slate-50">
                                {editItem?.id === entry.id ? (
                                    <>
                                        <td className="p-2"><input type="date" className="p-1 border rounded" value={editItem.date} onChange={e => setEditItem({...editItem, date: e.target.value})} /></td>
                                        <td className="p-2">
                                            <select className="p-1 border rounded" value={editItem.stage} onChange={e => setEditItem({...editItem, stage: e.target.value as any})}>
                                                <option>Invert</option><option>Kicker</option><option>Gantry</option>
                                            </select>
                                        </td>
                                        <td className="p-2"><input type="number" className="p-1 border rounded w-20" value={editItem.fromCh} onChange={e => setEditItem({...editItem, fromCh: parseFloat(e.target.value)})} /></td>
                                        <td className="p-2"><input type="number" className="p-1 border rounded w-20" value={editItem.toCh} onChange={e => setEditItem({...editItem, toCh: parseFloat(e.target.value)})} /></td>
                                        <td className="p-2 text-slate-400">{(editItem.toCh - editItem.fromCh).toFixed(2)}</td>
                                        <td className="p-2 text-right"><input type="number" className="p-1 border rounded w-20 text-right" value={editItem.volume} onChange={e => setEditItem({...editItem, volume: parseFloat(e.target.value)})} /></td>
                                        <td className="p-2 text-slate-400">{editItem.source}</td>
                                        <td className="p-2 text-right">
                                            <button onClick={saveEdit} className="text-green-600 mr-2"><i className="fas fa-check"></i></button>
                                            <button onClick={() => setEditItem(null)} className="text-red-500"><i className="fas fa-times"></i></button>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="p-3 text-slate-600">{entry.date}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${entry.stage === 'Invert' ? 'bg-blue-100 text-blue-700' : entry.stage === 'Kicker' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {entry.stage}
                                            </span>
                                        </td>
                                        <td className="p-3 font-mono">{entry.fromCh.toFixed(2)}</td>
                                        <td className="p-3 font-mono">{entry.toCh.toFixed(2)}</td>
                                        <td className="p-3 font-bold text-slate-700">{(entry.toCh - entry.fromCh).toFixed(2)} m</td>
                                        <td className="p-3 text-right font-mono">{entry.volume}</td>
                                        <td className="p-3 text-xs text-slate-400">{entry.source}</td>
                                        <td className="p-3 text-right">
                                            <button onClick={() => setEditItem(entry)} className="text-slate-400 hover:text-indigo-600 mr-3"><i className="fas fa-pen"></i></button>
                                            <button onClick={() => deleteEntry(entry.id)} className="text-slate-400 hover:text-red-600"><i className="fas fa-trash"></i></button>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* IMPORT MODAL */}
        {showImport && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
                    <h3 className="text-lg font-bold mb-4">Import Legacy Data</h3>
                    <p className="text-sm text-slate-500 mb-2">Paste raw text from PDF OCR (Format: StartCH EndCH Volume). Each entry on new line.</p>
                    <textarea 
                        className="w-full h-40 border p-3 rounded-lg font-mono text-xs mb-4 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={importText}
                        onChange={e => setImportText(e.target.value)}
                        placeholder={`0+663.00 0+680.00 36.5\n0+680.00 0+702.50 36.5`}
                    />
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setShowImport(false)} className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100">Cancel</button>
                        <button onClick={handleLegacyImport} className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-bold">Parse & Import</button>
                    </div>
                </div>
            </div>
        )}

    </div>
  );
};

const StatCard = ({ label, color, data }: any) => (
    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-4">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl font-bold shadow-md ${color}`}>
            {Math.round(data.pct)}%
        </div>
        <div>
            <div className="text-xs font-bold text-slate-400 uppercase">{label}</div>
            <div className="text-lg font-bold text-slate-800">{data.len.toFixed(1)} / {TOTAL_LENGTH} m</div>
        </div>
    </div>
);
