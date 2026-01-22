
import React, { useState, useEffect, useMemo } from 'react';
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
  
  // View Controls
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(TOTAL_LENGTH);
  
  // Import State
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importStage, setImportStage] = useState<'Invert' | 'Kicker' | 'Gantry'>('Invert');
  const [importYear, setImportYear] = useState<string>('2025');

  // Conflict State
  const [conflicts, setConflicts] = useState<{existing: LiningEntry, new: LiningEntry}[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);

  const [editItem, setEditItem] = useState<LiningEntry | null>(null);
  
  // Stats calculation
  const stats = useMemo(() => {
      const calc = (stage: string) => {
          const relevant = entries.filter(e => e.stage === stage).sort((a,b) => a.fromCh - b.fromCh);
          if(relevant.length === 0) return { len: 0, pct: 0 };

          // Union of intervals
          let merged: {start: number, end: number}[] = [];
          for(const r of relevant) {
              if(merged.length === 0 || merged[merged.length-1].end < r.fromCh) {
                  merged.push({start: r.fromCh, end: r.toCh});
              } else {
                  merged[merged.length-1].end = Math.max(merged[merged.length-1].end, r.toCh);
              }
          }
          const covered = merged.reduce((acc, cur) => acc + (cur.end - cur.start), 0);
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
      await saveLiningBatch(prev);
  };

  // --- SYNC & CONFLICT LOGIC ---

  const handleSystemSync = async () => {
      saveStateForUndo();
      const newPotentialEntries: LiningEntry[] = [];
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
                      const chText = item.chainage || item.activityDescription;
                      const match = chText.match(regex);
                      if (match) {
                          const parseCh = (s: string) => parseFloat(s.replace(/\+/g, ''));
                          const start = parseCh(match[1]);
                          const end = parseCh(match[2]);
                          
                          const volMatch = item.activityDescription.match(/(\d+(\.\d+)?)\s*(m3|cum)/i);
                          const vol = volMatch ? parseFloat(volMatch[1]) : 0;

                          newPotentialEntries.push({
                              id: crypto.randomUUID(),
                              date: report.date,
                              stage,
                              fromCh: start,
                              toCh: end,
                              volume: vol,
                              remarks: "Auto-synced",
                              source: 'System',
                              status: 'New',
                              lastUpdated: new Date().toISOString()
                          });
                      }
                  }
              }
          });
      });

      // Conflict Detection
      const cleanEntries: LiningEntry[] = [];
      const foundConflicts: {existing: LiningEntry, new: LiningEntry}[] = [];

      for (const newEntry of newPotentialEntries) {
          // Check intersection with existing entries of same stage
          // Interval Intersection: (StartA <= EndB) and (EndA >= StartB)
          const overlapping = entries.find(e => 
              e.stage === newEntry.stage && 
              newEntry.fromCh < e.toCh && 
              newEntry.toCh > e.fromCh
          );

          if (overlapping) {
              // Exact duplicate check (ignore if exact same data)
              const isSame = 
                  Math.abs(overlapping.fromCh - newEntry.fromCh) < 0.1 && 
                  Math.abs(overlapping.toCh - newEntry.toCh) < 0.1 &&
                  overlapping.date === newEntry.date &&
                  Math.abs(overlapping.volume - newEntry.volume) < 0.1;

              if (!isSame) {
                  // Real Conflict or Update
                  foundConflicts.push({ existing: overlapping, new: newEntry });
              }
          } else {
              cleanEntries.push(newEntry);
          }
      }

      if (cleanEntries.length > 0) {
          await saveLiningBatch(cleanEntries);
      }

      if (foundConflicts.length > 0) {
          setConflicts(foundConflicts);
          setShowConflictModal(true);
      } else if (cleanEntries.length > 0) {
          alert(`Synced ${cleanEntries.length} new entries successfully.`);
      } else {
          alert("No new data found.");
      }
  };

  const resolveConflict = async (resolution: 'keep_existing' | 'overwrite' | 'keep_both', conflictIndex: number) => {
      const conflict = conflicts[conflictIndex];
      const newConflicts = [...conflicts];
      newConflicts.splice(conflictIndex, 1);
      setConflicts(newConflicts);

      if (resolution === 'overwrite') {
          // Delete old, Add new (reuse ID or swap)
          await deleteLiningEntry(conflict.existing.id);
          await saveLiningBatch([{ ...conflict.new, status: 'Verified' }]);
      } else if (resolution === 'keep_both') {
          // Add new as Verified, keep existing
          await saveLiningBatch([{ ...conflict.new, status: 'Conflict' }]); // Mark as conflict visible in table
      }
      // 'keep_existing' does nothing
      
      if (newConflicts.length === 0) {
          setShowConflictModal(false);
      }
  };

  // --- LEGACY IMPORT PARSER ---

  const handleLegacyImport = async () => {
      if (!importText) return;
      saveStateForUndo();

      const lines = importText.split('\n');
      const newEntries: LiningEntry[] = [];
      const chPattern = /\d+\+\d+\.?\d*/;
      
      // Date Pattern: 9-Jan, 30-Dec
      const datePattern = /(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;

      lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          
          if (parts.length >= 2) { // At least start/end ch
              const startStr = parts.find(p => chPattern.test(p));
              const startIdx = parts.indexOf(startStr!);
              const endStr = parts.slice(startIdx + 1).find(p => chPattern.test(p));
              
              if (startStr && endStr) {
                  const parseCh = (s: string) => parseFloat(s.replace(/\+/g, ''));
                  const start = parseCh(startStr);
                  const end = parseCh(endStr);
                  
                  // Extract Date
                  let dateStr = `${importYear}-01-01`; // Default
                  const dateMatch = line.match(datePattern);
                  if (dateMatch) {
                      const day = dateMatch[1];
                      const monthStr = dateMatch[2];
                      const monthIndex = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
                          .indexOf(monthStr.toLowerCase());
                      if(monthIndex >= 0) {
                          const d = new Date(parseInt(importYear), monthIndex, parseInt(day));
                          // Fix timezone offset for simple YYYY-MM-DD
                          const offset = d.getTimezoneOffset();
                          const localDate = new Date(d.getTime() - (offset*60*1000));
                          dateStr = localDate.toISOString().split('T')[0];
                      }
                  } else {
                      // Use today if no date found in line
                      dateStr = new Date().toISOString().split('T')[0];
                  }

                  // Find volume (numbers that aren't chainages or dates)
                  const remaining = parts.filter(p => p !== startStr && p !== endStr && !datePattern.test(p));
                  // Filter out "Completed" or text
                  const numCandidates = remaining.filter(p => !isNaN(parseFloat(p)));
                  // Heuristic: Volume is usually the last number or < 1000
                  const volStr = numCandidates.find(p => parseFloat(p) < 1000 && parseFloat(p) > 0);
                  const vol = volStr ? parseFloat(volStr) : 0;
                  
                  if (start < end) {
                      newEntries.push({
                          id: crypto.randomUUID(),
                          date: dateStr,
                          stage: importStage,
                          fromCh: start,
                          toCh: end,
                          volume: vol,
                          remarks: "Legacy Import",
                          source: 'Legacy',
                          status: 'Verified',
                          lastUpdated: new Date().toISOString()
                      });
                  }
              }
          }
      });

      if (newEntries.length > 0) {
          if(window.confirm(`Found ${newEntries.length} valid entries for ${importStage}. Import?`)) {
              await saveLiningBatch(newEntries);
              setImportText('');
              setShowImport(false);
          }
      } else {
          alert("Could not parse data. Ensure format includes Chainages.");
      }
  };

  const handleExportChart = async () => {
      const el = document.getElementById('hrt-chart-container');
      if (el && window.html2canvas) {
          const canvas = await window.html2canvas(el, { scrollX: 0, scrollY: 0, scale: 2 });
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/jpeg', 0.9);
          link.download = `HRT_Lining_${importStage}_${new Date().toISOString().split('T')[0]}.jpg`;
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

  const renderStageTable = (stage: 'Invert' | 'Kicker' | 'Gantry') => {
      const stageEntries = entries.filter(e => e.stage === stage).sort((a,b) => b.fromCh - a.fromCh);
      
      return (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
              <div className={`p-3 border-b border-slate-200 font-bold text-sm uppercase tracking-wider flex justify-between items-center ${
                  stage === 'Invert' ? 'bg-blue-50 text-blue-800' : 
                  stage === 'Kicker' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}>
                  <span>{stage} Records</span>
                  <span className="text-xs bg-white px-2 py-1 rounded border opacity-70">{stageEntries.length} Entries</span>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 text-slate-500">
                        <tr>
                            <th className="p-2">Date</th>
                            <th className="p-2">Start Ch</th>
                            <th className="p-2">End Ch</th>
                            <th className="p-2">Length</th>
                            <th className="p-2 text-right">Vol (m3)</th>
                            <th className="p-2">Status</th>
                            <th className="p-2 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {stageEntries.map(entry => (
                            <tr key={entry.id} className={`hover:bg-slate-50 ${entry.status === 'Conflict' ? 'bg-red-50' : ''}`}>
                                {editItem?.id === entry.id ? (
                                    <>
                                        <td className="p-2"><input type="date" className="p-1 border rounded w-24" value={editItem.date} onChange={e => setEditItem({...editItem, date: e.target.value})} /></td>
                                        <td className="p-2"><input type="number" className="p-1 border rounded w-16" value={editItem.fromCh} onChange={e => setEditItem({...editItem, fromCh: parseFloat(e.target.value)})} /></td>
                                        <td className="p-2"><input type="number" className="p-1 border rounded w-16" value={editItem.toCh} onChange={e => setEditItem({...editItem, toCh: parseFloat(e.target.value)})} /></td>
                                        <td className="p-2 text-slate-400">{(editItem.toCh - editItem.fromCh).toFixed(2)}</td>
                                        <td className="p-2 text-right"><input type="number" className="p-1 border rounded w-16 text-right" value={editItem.volume} onChange={e => setEditItem({...editItem, volume: parseFloat(e.target.value)})} /></td>
                                        <td className="p-2 text-slate-400">Editing</td>
                                        <td className="p-2 text-right">
                                            <button onClick={saveEdit} className="text-green-600 mr-2"><i className="fas fa-check"></i></button>
                                            <button onClick={() => setEditItem(null)} className="text-red-500"><i className="fas fa-times"></i></button>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="p-2 text-slate-600 font-medium">{entry.date}</td>
                                        <td className="p-2 font-mono">{entry.fromCh.toFixed(2)}</td>
                                        <td className="p-2 font-mono">{entry.toCh.toFixed(2)}</td>
                                        <td className="p-2 font-bold text-slate-700">{(entry.toCh - entry.fromCh).toFixed(2)}</td>
                                        <td className="p-2 text-right font-mono">{entry.volume}</td>
                                        <td className="p-2">
                                            {entry.status === 'Conflict' && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded">Conflict</span>}
                                            {entry.status === 'New' && <span className="text-[10px] bg-blue-100 text-blue-600 px-1 rounded">New</span>}
                                            {entry.status === 'Verified' && <i className="fas fa-check-circle text-green-400"></i>}
                                        </td>
                                        <td className="p-2 text-right">
                                            <button onClick={() => setEditItem(entry)} className="text-slate-400 hover:text-indigo-600 mr-2"><i className="fas fa-pen"></i></button>
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
      );
  };

  const chartWidth = Math.max(1000, (viewEnd - viewStart) * 2); // Dynamic width scaling

  return (
    <div className="space-y-6 animate-fade-in pb-20">
        
        {/* Header Actions */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 border-b border-slate-200 pb-4">
            <div>
                <h2 className="text-3xl font-bold text-slate-800">HRT Concrete Lining</h2>
                <p className="text-slate-500 text-sm">Track Invert, Kicker, and Gantry progress.</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <button onClick={handleSystemSync} className="bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg font-bold text-xs hover:bg-indigo-100 flex items-center gap-2 border border-indigo-100">
                    <i className="fas fa-sync"></i> Sync Reports
                </button>
                <button onClick={() => setShowImport(true)} className="bg-slate-50 text-slate-700 px-3 py-2 rounded-lg font-bold text-xs hover:bg-slate-100 flex items-center gap-2 border border-slate-200">
                    <i className="fas fa-file-import"></i> Legacy Import
                </button>
                <button onClick={handleUndo} disabled={undoStack.length === 0} className="bg-slate-50 text-slate-700 px-3 py-2 rounded-lg font-bold text-xs hover:bg-slate-100 flex items-center gap-2 disabled:opacity-50 border border-slate-200">
                    <i className="fas fa-undo"></i> Undo
                </button>
                <button onClick={handleExportChart} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-black flex items-center gap-2 shadow-lg">
                    <i className="fas fa-camera"></i> Save Chart
                </button>
            </div>
        </div>

        {/* View Controls & Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-1 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Chart Focus Range</label>
                <div className="flex items-center gap-2 mb-2">
                    <input 
                        type="number" 
                        value={viewStart} 
                        onChange={e => setViewStart(Number(e.target.value))}
                        className="w-full p-1.5 border rounded text-sm font-bold text-center"
                    />
                    <span className="text-slate-400">-</span>
                    <input 
                        type="number" 
                        value={viewEnd} 
                        onChange={e => setViewEnd(Number(e.target.value))}
                        className="w-full p-1.5 border rounded text-sm font-bold text-center"
                    />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                    <button onClick={() => { setViewStart(0); setViewEnd(TOTAL_LENGTH); }} className="hover:text-indigo-600 underline">Reset Full</button>
                    <button onClick={() => { setViewStart(500); setViewEnd(1500); }} className="hover:text-indigo-600 underline">Focus Middle</button>
                </div>
            </div>
            
            <StatCard label="Invert" color="bg-blue-600" data={stats.invert} />
            <StatCard label="Kicker" color="bg-green-600" data={stats.kicker} />
            <StatCard label="Gantry" color="bg-red-600" data={stats.gantry} />
        </div>

        {/* CHART CONTAINER */}
        <div className="overflow-auto bg-slate-100 rounded-2xl border border-slate-300 shadow-inner p-4">
            <div id="hrt-chart-container" className="bg-white p-6 rounded-xl shadow-sm min-w-full">
                <h3 className="text-center font-bold text-lg mb-8 uppercase tracking-widest text-slate-800">
                    Lining Profile ({viewStart}m - {viewEnd}m) - {getNepaliDate(new Date().toISOString())}
                </h3>
                
                <div style={{ width: '100%', overflowX: 'auto' }}>
                    <div style={{ minWidth: `${chartWidth}px`, height: '300px', position: 'relative' }}>
                        <svg width="100%" height="100%" viewBox={`${viewStart - 20} 0 ${viewEnd - viewStart + 40} 250`} preserveAspectRatio="none" className="overflow-visible">
                            
                            {/* Tunnel Profile Outline */}
                            <rect x={viewStart} y="150" width={viewEnd - viewStart} height="60" fill="#f1f5f9" />
                            <line x1={viewStart} y1="180" x2={viewEnd} y2="180" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="10,5" />

                            {/* Scale / Grid Lines (Every 100m) */}
                            {Array.from({length: Math.ceil(TOTAL_LENGTH / 100) + 1}, (_, i) => i * 100).map(x => {
                                if (x >= viewStart && x <= viewEnd) {
                                    return (
                                        <g key={x}>
                                            <line x1={x} y1="40" x2={x} y2="230" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,4" />
                                            <text x={x} y="30" fontSize="14" textAnchor="middle" fill="#64748b" fontWeight="bold">{x}m</text>
                                        </g>
                                    );
                                }
                                return null;
                            })}

                            {/* DATA BARS - Filtered by View Range */}
                            
                            {/* 1. Invert (Bottom Layer) */}
                            <g>
                                {entries.filter(e => e.stage === 'Invert' && e.toCh > viewStart && e.fromCh < viewEnd).map(e => (
                                    <rect 
                                        key={e.id}
                                        x={Math.max(viewStart, e.fromCh)}
                                        y="180"
                                        width={Math.max(0.5, Math.min(e.toCh, viewEnd) - Math.max(viewStart, e.fromCh))}
                                        height="30"
                                        fill="#2563eb" // Blue
                                        stroke="white"
                                        strokeWidth="0.5"
                                        opacity="0.9"
                                    >
                                        <title>Invert: {e.fromCh}-{e.toCh} ({e.date})</title>
                                    </rect>
                                ))}
                                <text x={viewStart} y="200" textAnchor="end" fontSize="16" fontWeight="bold" fill="#2563eb" dx="-10">Invert</text>
                            </g>

                            {/* 2. Kicker (Middle Layer) */}
                            <g>
                                {entries.filter(e => e.stage === 'Kicker' && e.toCh > viewStart && e.fromCh < viewEnd).map(e => (
                                    <rect 
                                        key={e.id}
                                        x={Math.max(viewStart, e.fromCh)}
                                        y="150"
                                        width={Math.max(0.5, Math.min(e.toCh, viewEnd) - Math.max(viewStart, e.fromCh))}
                                        height="30"
                                        fill="#16a34a" // Green
                                        stroke="white"
                                        strokeWidth="0.5"
                                        opacity="0.9"
                                    >
                                        <title>Kicker: {e.fromCh}-{e.toCh} ({e.date})</title>
                                    </rect>
                                ))}
                                <text x={viewStart} y="170" textAnchor="end" fontSize="16" fontWeight="bold" fill="#16a34a" dx="-10">Kicker</text>
                            </g>

                            {/* 3. Gantry (Top Layer) */}
                            <g>
                                {entries.filter(e => e.stage === 'Gantry' && e.toCh > viewStart && e.fromCh < viewEnd).map(e => (
                                    <rect 
                                        key={e.id}
                                        x={Math.max(viewStart, e.fromCh)}
                                        y="90"
                                        width={Math.max(0.5, Math.min(e.toCh, viewEnd) - Math.max(viewStart, e.fromCh))}
                                        height="60"
                                        fill="#dc2626" // Red
                                        stroke="white"
                                        strokeWidth="0.5"
                                        opacity="0.9"
                                    >
                                        <title>Gantry: {e.fromCh}-{e.toCh} ({e.date})</title>
                                    </rect>
                                ))}
                                <text x={viewStart} y="130" textAnchor="end" fontSize="16" fontWeight="bold" fill="#dc2626" dx="-10">Gantry</text>
                            </g>

                        </svg>
                    </div>
                </div>
            </div>
        </div>

        {/* Separated Data Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {renderStageTable('Gantry')}
            {renderStageTable('Kicker')}
            {renderStageTable('Invert')}
        </div>

        {/* IMPORT MODAL */}
        {showImport && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-scale-in">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-slate-800">Import Legacy Data</h3>
                        <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600"><i className="fas fa-times"></i></button>
                    </div>
                    
                    <div className="flex gap-4 mb-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select Stage</label>
                            <select 
                                value={importStage} 
                                onChange={(e) => setImportStage(e.target.value as any)}
                                className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                            >
                                <option value="Invert">Invert</option>
                                <option value="Kicker">Kicker</option>
                                <option value="Gantry">Gantry (Wall & Arch)</option>
                            </select>
                        </div>
                        <div className="w-32">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Year context</label>
                            <select 
                                value={importYear} 
                                onChange={(e) => setImportYear(e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                            >
                                <option value="2026">2026</option>
                                <option value="2025">2025</option>
                                <option value="2024">2024</option>
                            </select>
                        </div>
                    </div>

                    <p className="text-xs text-slate-500 mb-2">Paste raw text from PDF OCR (Format: StartCH EndCH Volume Date). Date is optional (e.g. 9-Jan).</p>
                    <textarea 
                        className="w-full h-40 border p-3 rounded-lg font-mono text-xs mb-4 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
                        value={importText}
                        onChange={e => setImportText(e.target.value)}
                        placeholder={`0+663.00 0+680.00 36.5 9-Jan\n0+680.00 0+702.50 36.5 9-Jan\n0+702.50 0+722.25 19.75 6-Jan`}
                    />
                    <div className="flex justify-end gap-3">
                        <button onClick={handleLegacyImport} className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-200">
                            Parse & Import
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* CONFLICT RESOLUTION MODAL */}
        {showConflictModal && conflicts.length > 0 && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-scale-in">
                    <div className="flex items-center gap-3 mb-4 text-orange-600">
                        <i className="fas fa-exclamation-triangle text-2xl"></i>
                        <h3 className="text-xl font-bold">Sync Conflicts Found</h3>
                    </div>
                    
                    <p className="text-sm text-slate-600 mb-4">
                        The sync process found {conflicts.length} entries that overlap with existing data but contain different values. 
                        Please resolve the first conflict below:
                    </p>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-white border border-slate-200 rounded-lg opacity-60">
                                <div className="text-xs font-bold text-slate-400 uppercase mb-2">Existing Entry</div>
                                <div className="font-mono text-sm text-slate-700">{conflicts[0].existing.fromCh.toFixed(2)} - {conflicts[0].existing.toCh.toFixed(2)} m</div>
                                <div className="text-sm font-bold">{conflicts[0].existing.volume} m3</div>
                                <div className="text-xs text-slate-500">{conflicts[0].existing.date}</div>
                            </div>
                            <div className="p-3 bg-white border-2 border-indigo-500 rounded-lg relative">
                                <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl">NEW</div>
                                <div className="text-xs font-bold text-indigo-600 uppercase mb-2">Incoming Data</div>
                                <div className="font-mono text-sm text-slate-800">{conflicts[0].new.fromCh.toFixed(2)} - {conflicts[0].new.toCh.toFixed(2)} m</div>
                                <div className="text-sm font-bold text-indigo-700">{conflicts[0].new.volume} m3</div>
                                <div className="text-xs text-slate-500">{conflicts[0].new.date}</div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <button onClick={() => resolveConflict('keep_existing', 0)} className="py-3 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50">
                            Keep Existing
                        </button>
                        <button onClick={() => resolveConflict('keep_both', 0)} className="py-3 rounded-xl border border-orange-300 bg-orange-50 font-bold text-orange-700 hover:bg-orange-100">
                            Keep Both (Flag)
                        </button>
                        <button onClick={() => resolveConflict('overwrite', 0)} className="py-3 rounded-xl bg-indigo-600 font-bold text-white hover:bg-indigo-700 shadow-lg">
                            Overwrite
                        </button>
                    </div>
                    <div className="mt-4 text-center text-xs text-slate-400">
                        {conflicts.length - 1} more conflicts remaining...
                    </div>
                </div>
            </div>
        )}

    </div>
  );
};

const StatCard = ({ label, color, data }: any) => (
    <div className="lg:col-span-1 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl font-bold shadow-md ${color}`}>
            {Math.round(data.pct)}%
        </div>
        <div>
            <div className="text-xs font-bold text-slate-400 uppercase">{label}</div>
            <div className="text-lg font-bold text-slate-800">{data.len.toFixed(1)} m</div>
        </div>
    </div>
);
