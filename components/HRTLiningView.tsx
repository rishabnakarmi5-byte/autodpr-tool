
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
  const [importMode, setImportMode] = useState<'legacy' | 'smart'>('legacy');
  const [importText, setImportText] = useState('');
  const [importStage, setImportStage] = useState<'Invert' | 'Kicker' | 'Gantry'>('Invert');
  const [importYear, setImportYear] = useState<string>(new Date().getFullYear().toString());

  // Conflict State
  const [conflicts, setConflicts] = useState<{existing: LiningEntry, new: LiningEntry}[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);

  const [editItem, setEditItem] = useState<LiningEntry | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  
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
          const overlapping = entries.find(e => 
              e.stage === newEntry.stage && 
              newEntry.fromCh < e.toCh && 
              newEntry.toCh > e.fromCh
          );

          if (overlapping) {
              const isSame = 
                  Math.abs(overlapping.fromCh - newEntry.fromCh) < 0.1 && 
                  Math.abs(overlapping.toCh - newEntry.toCh) < 0.1 &&
                  overlapping.date === newEntry.date &&
                  Math.abs(overlapping.volume - newEntry.volume) < 0.1;

              if (!isSame) {
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
          await deleteLiningEntry(conflict.existing.id);
          await saveLiningBatch([{ ...conflict.new, status: 'Verified' }]);
      } else if (resolution === 'keep_both') {
          await saveLiningBatch([{ ...conflict.new, status: 'Conflict' }]); 
      }
      
      if (newConflicts.length === 0) {
          setShowConflictModal(false);
      }
  };

  // --- IMPORT PARSERS ---

  const handleImport = async () => {
      if (!importText) return;
      saveStateForUndo();

      const lines = importText.split('\n');
      const newEntries: LiningEntry[] = [];
      const chPattern = /\d+\+\d+\.?\d*|\b\d{3,4}\b(\.\d+)?/; // Matches 0+100 or 1000
      
      lines.forEach(line => {
          let start = 0, end = 0, vol = 0;
          let dateStr = new Date().toISOString().split('T')[0];

          // Smart Parser logic
          if (importMode === 'smart') {
              // 1. Find Date
              // Matches: 2025-01-01, 9-Jan, 9/1, Jan 9
              const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2}[-/\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-/\s]?\d{0,4})|(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
              
              if (dateMatch) {
                  const rawDate = dateMatch[0];
                  // Simple Date Parse
                  const d = new Date(rawDate);
                  if(!isNaN(d.getTime())) {
                      dateStr = d.toISOString().split('T')[0];
                  } else {
                      // Try adding year if missing (e.g. 9-Jan)
                      const d2 = new Date(`${rawDate} ${importYear}`);
                      if(!isNaN(d2.getTime())) dateStr = d2.toISOString().split('T')[0];
                  }
                  // Remove date from line to avoid numeric confusion
                  line = line.replace(rawDate, '');
              } else {
                  // If no date in line, use today or prompt? Defaults to today.
              }

              // 2. Find Numbers (Chainages & Volume)
              // Remove + signs for easier parsing
              const cleanLine = line.replace(/\+/g, '');
              const numbers = cleanLine.match(/\d+(\.\d+)?/g)?.map(Number) || [];
              
              if (numbers.length >= 2) {
                  // Heuristic: Two largest numbers are chainages. Smaller one is Volume (if 3 numbers)
                  // Sort descending
                  const sorted = [...numbers].sort((a,b) => b-a);
                  
                  // Usually chainages are the biggest numbers in the line for HRT (0-2600) vs Volume (10-100)
                  // But volume could be 200...
                  // Let's assume input order is typically From - To - Vol or From - To
                  
                  // Let's rely on input order for Chainages as they are usually grouped
                  // Re-scan line for pattern "Num ... Num"
                  // Actually, let's use the sorted logic for From/To (start < end)
                  
                  // Take top 2 as chainages
                  const ch1 = sorted[0];
                  const ch2 = sorted[1];
                  
                  start = Math.min(ch1, ch2);
                  end = Math.max(ch1, ch2);
                  
                  // If there is a 3rd number, it's likely volume
                  if (numbers.length > 2) {
                      vol = numbers.find(n => n !== ch1 && n !== ch2) || 0;
                  }
              }

          } else {
              // Legacy Fixed Format: StartCH EndCH Volume [Date]
              const parts = line.trim().split(/\s+/);
              if (parts.length >= 2) {
                  const p1 = parseFloat(parts[0].replace('+',''));
                  const p2 = parseFloat(parts[1].replace('+',''));
                  if (!isNaN(p1) && !isNaN(p2)) {
                      start = Math.min(p1, p2);
                      end = Math.max(p1, p2);
                      if(parts[2] && !isNaN(parseFloat(parts[2]))) vol = parseFloat(parts[2]);
                      
                      // Check for date at end
                      const datePart = parts.slice(3).join(' ');
                      if(datePart) {
                           const d = new Date(`${datePart} ${importYear}`);
                           if(!isNaN(d.getTime())) dateStr = d.toISOString().split('T')[0];
                      }
                  }
              }
          }

          if (start < end && end <= TOTAL_LENGTH + 500) { // Sanity check
              newEntries.push({
                  id: crypto.randomUUID(),
                  date: dateStr,
                  stage: importStage,
                  fromCh: start,
                  toCh: end,
                  volume: vol,
                  remarks: "Imported",
                  source: 'Manual',
                  status: 'Verified',
                  lastUpdated: new Date().toISOString()
              });
          }
      });

      if (newEntries.length > 0) {
          if(window.confirm(`Parsed ${newEntries.length} entries. Import?`)) {
              await saveLiningBatch(newEntries);
              setImportText('');
              setShowImport(false);
          }
      } else {
          alert("No valid data found. Check format.");
      }
  };

  const handleExportChart = async () => {
      const el = document.getElementById('hrt-chart-container');
      if (el && window.html2canvas) {
          const canvas = await window.html2canvas(el, { scrollX: 0, scrollY: 0, scale: 2 });
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/jpeg', 0.9);
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
      setShowEditModal(false);
  };

  const handleBlockClick = (entry: LiningEntry) => {
      setEditItem(entry);
      setShowEditModal(true);
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
                            <th className="p-2">Chainage</th>
                            <th className="p-2 text-right">Vol (m3)</th>
                            <th className="p-2 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {stageEntries.map(entry => (
                            <tr key={entry.id} className={`hover:bg-slate-50 ${entry.status === 'Conflict' ? 'bg-red-50' : ''}`}>
                                <td className="p-2 text-slate-600 font-medium">{entry.date}</td>
                                <td className="p-2 font-mono text-slate-700">{entry.fromCh.toFixed(2)} - {entry.toCh.toFixed(2)}</td>
                                <td className="p-2 text-right font-mono">{entry.volume}</td>
                                <td className="p-2 text-right">
                                    <button onClick={() => handleBlockClick(entry)} className="text-slate-400 hover:text-indigo-600 mr-2"><i className="fas fa-pen"></i></button>
                                    <button onClick={() => deleteEntry(entry.id)} className="text-slate-400 hover:text-red-600"><i className="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
        
        {/* Header Actions */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 border-b border-slate-200 pb-4">
            <div>
                <h2 className="text-3xl font-bold text-slate-800">HRT Concrete Lining</h2>
                <p className="text-slate-500 text-sm">Longitudinal Profile (0 - {TOTAL_LENGTH}m)</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <button onClick={handleSystemSync} className="bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg font-bold text-xs hover:bg-indigo-100 flex items-center gap-2 border border-indigo-100">
                    <i className="fas fa-sync"></i> Sync Reports
                </button>
                <button onClick={() => setShowImport(true)} className="bg-slate-50 text-slate-700 px-3 py-2 rounded-lg font-bold text-xs hover:bg-slate-100 flex items-center gap-2 border border-slate-200">
                    <i className="fas fa-file-import"></i> Smart Import
                </button>
                <button onClick={handleUndo} disabled={undoStack.length === 0} className="bg-slate-50 text-slate-700 px-3 py-2 rounded-lg font-bold text-xs hover:bg-slate-100 flex items-center gap-2 disabled:opacity-50 border border-slate-200">
                    <i className="fas fa-undo"></i> Undo
                </button>
                <button onClick={handleExportChart} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-black flex items-center gap-2 shadow-lg">
                    <i className="fas fa-camera"></i> Chart JPG
                </button>
            </div>
        </div>

        {/* View Controls & Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-1 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Zoom & Focus</label>
                <div className="flex items-center gap-2 mb-2">
                    <input 
                        type="number" 
                        value={viewStart} 
                        onChange={e => setViewStart(Number(e.target.value))}
                        className="w-full p-1.5 border rounded text-sm font-bold text-center"
                        step={10}
                    />
                    <span className="text-slate-400">-</span>
                    <input 
                        type="number" 
                        value={viewEnd} 
                        onChange={e => setViewEnd(Number(e.target.value))}
                        className="w-full p-1.5 border rounded text-sm font-bold text-center"
                        step={10}
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
        <div className="bg-slate-100 rounded-2xl border border-slate-300 shadow-inner p-4 overflow-hidden">
            <div id="hrt-chart-container" className="bg-white p-6 rounded-xl shadow-sm w-full">
                <h3 className="text-center font-bold text-lg mb-8 uppercase tracking-widest text-slate-800">
                    Profile: {viewStart}m to {viewEnd}m ({getNepaliDate(new Date().toISOString())})
                </h3>
                
                {/* SVG CHART - Scalable Vector Graphics handle the Zoom */}
                <div style={{ width: '100%', height: '300px' }}>
                    <svg 
                        width="100%" 
                        height="100%" 
                        viewBox={`${viewStart} 0 ${viewEnd - viewStart} 250`} 
                        preserveAspectRatio="none" 
                        className="overflow-hidden cursor-crosshair"
                    >
                        
                        {/* Background */}
                        <rect x={viewStart} y="0" width={viewEnd - viewStart} height="250" fill="white" />

                        {/* Tunnel Profile Outline */}
                        <rect x={viewStart} y="150" width={viewEnd - viewStart} height="60" fill="#f8fafc" />
                        <line x1={viewStart} y1="180" x2={viewEnd} y2="180" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="10,5" vectorEffect="non-scaling-stroke" />

                        {/* Scale / Grid Lines (Dynamic based on zoom level) */}
                        {Array.from({length: Math.ceil(TOTAL_LENGTH / 10) + 1}, (_, i) => i * 10).map(x => {
                            // Determine grid density based on view width
                            const range = viewEnd - viewStart;
                            const step = range > 2000 ? 100 : range > 1000 ? 50 : range > 500 ? 25 : 10;
                            
                            if (x >= viewStart && x <= viewEnd && x % step === 0) {
                                return (
                                    <g key={x}>
                                        <line x1={x} y1="40" x2={x} y2="230" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,4" vectorEffect="non-scaling-stroke" />
                                        <text x={x} y="30" fontSize={range / 30} textAnchor="middle" fill="#64748b" fontWeight="bold">{x}</text>
                                    </g>
                                );
                            }
                            return null;
                        })}

                        {/* DATA BARS - We render ALL and let viewBox clip them */}
                        
                        {/* 1. Invert (Bottom Layer) */}
                        <g>
                            {entries.filter(e => e.stage === 'Invert').map(e => (
                                <rect 
                                    key={e.id}
                                    x={e.fromCh}
                                    y="180"
                                    width={e.toCh - e.fromCh}
                                    height="30"
                                    fill="#2563eb" // Blue
                                    stroke="white"
                                    strokeWidth="0.5"
                                    vectorEffect="non-scaling-stroke"
                                    className="hover:opacity-80 cursor-pointer"
                                    onClick={() => handleBlockClick(e)}
                                >
                                    <title>Invert: {e.fromCh}-{e.toCh} ({e.date})</title>
                                </rect>
                            ))}
                            {/* Label follows scroll */}
                            <text x={viewStart + (viewEnd - viewStart)*0.02} y="200" fontSize={(viewEnd-viewStart)/40} fontWeight="bold" fill="#2563eb" opacity="0.5">Invert</text>
                        </g>

                        {/* 2. Kicker (Middle Layer) */}
                        <g>
                            {entries.filter(e => e.stage === 'Kicker').map(e => (
                                <rect 
                                    key={e.id}
                                    x={e.fromCh}
                                    y="150"
                                    width={e.toCh - e.fromCh}
                                    height="30"
                                    fill="#16a34a" // Green
                                    stroke="white"
                                    strokeWidth="0.5"
                                    vectorEffect="non-scaling-stroke"
                                    className="hover:opacity-80 cursor-pointer"
                                    onClick={() => handleBlockClick(e)}
                                >
                                    <title>Kicker: {e.fromCh}-{e.toCh} ({e.date})</title>
                                </rect>
                            ))}
                            <text x={viewStart + (viewEnd - viewStart)*0.02} y="170" fontSize={(viewEnd-viewStart)/40} fontWeight="bold" fill="#16a34a" opacity="0.5">Kicker</text>
                        </g>

                        {/* 3. Gantry (Top Layer) */}
                        <g>
                            {entries.filter(e => e.stage === 'Gantry').map(e => (
                                <rect 
                                    key={e.id}
                                    x={e.fromCh}
                                    y="90"
                                    width={e.toCh - e.fromCh}
                                    height="60"
                                    fill="#dc2626" // Red
                                    stroke="white"
                                    strokeWidth="0.5"
                                    vectorEffect="non-scaling-stroke"
                                    className="hover:opacity-80 cursor-pointer"
                                    onClick={() => handleBlockClick(e)}
                                >
                                    <title>Gantry: {e.fromCh}-{e.toCh} ({e.date})</title>
                                </rect>
                            ))}
                            <text x={viewStart + (viewEnd - viewStart)*0.02} y="130" fontSize={(viewEnd-viewStart)/40} fontWeight="bold" fill="#dc2626" opacity="0.5">Gantry</text>
                        </g>

                    </svg>
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
                        <h3 className="text-lg font-bold text-slate-800">Import Data</h3>
                        <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600"><i className="fas fa-times"></i></button>
                    </div>
                    
                    <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setImportMode('legacy')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${importMode === 'legacy' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
                        >
                            Strict Format
                        </button>
                        <button 
                            onClick={() => setImportMode('smart')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${importMode === 'smart' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
                        >
                            Smart Unstructured
                        </button>
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
                                <option value="Gantry">Gantry</option>
                            </select>
                        </div>
                        <div className="w-32">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Year</label>
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

                    <p className="text-xs text-slate-500 mb-2">
                        {importMode === 'legacy' 
                            ? 'Format: StartCH EndCH Volume [Date]' 
                            : 'Paste any text containing Chainages (e.g. 100-120) and Date (e.g. 9 Jan). Volume is optional.'}
                    </p>
                    <textarea 
                        className="w-full h-40 border p-3 rounded-lg font-mono text-xs mb-4 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
                        value={importText}
                        onChange={e => setImportText(e.target.value)}
                        placeholder={importMode === 'legacy' ? `0+663.00 0+680.00 36.5` : `Done invert from ch 100 to 120 on 12 Jan with 30m3`}
                    />
                    <div className="flex justify-end gap-3">
                        <button onClick={handleImport} className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-200">
                            Process Data
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* EDIT MODAL */}
        {showEditModal && editItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-scale-in">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Edit Entry</h3>
                    
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Stage</label>
                            <select className="w-full p-2 border rounded" value={editItem.stage} onChange={e => setEditItem({...editItem, stage: e.target.value as any})}>
                                <option>Invert</option><option>Kicker</option><option>Gantry</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Start</label>
                                <input type="number" className="w-full p-2 border rounded" value={editItem.fromCh} onChange={e => setEditItem({...editItem, fromCh: parseFloat(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">End</label>
                                <input type="number" className="w-full p-2 border rounded" value={editItem.toCh} onChange={e => setEditItem({...editItem, toCh: parseFloat(e.target.value)})} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Volume</label>
                                <input type="number" className="w-full p-2 border rounded" value={editItem.volume} onChange={e => setEditItem({...editItem, volume: parseFloat(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                                <input type="date" className="w-full p-2 border rounded" value={editItem.date} onChange={e => setEditItem({...editItem, date: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 font-bold text-sm">Cancel</button>
                        <button onClick={saveEdit} className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-bold shadow-lg">Save</button>
                    </div>
                </div>
            </div>
        )}

        {/* CONFLICT MODAL */}
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
