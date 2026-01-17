import React, { useState, useEffect, useMemo } from 'react';
import { DailyReport, QuantityEntry } from '../types';
import { LOCATION_HIERARCHY, identifyItemType, parseQuantityDetails } from '../utils/constants';
import { subscribeToQuantities, addQuantity, updateQuantity, deleteQuantity } from '../services/firebaseService';

interface QuantityViewProps {
  reports: DailyReport[];
  user?: any;
}

type SubTab = 'ledger' | 'analysis';

export const QuantityView: React.FC<QuantityViewProps> = ({ reports, user }) => {
  // --- STATE ---
  const [quantities, setQuantities] = useState<QuantityEntry[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('ledger');
  
  // Undo State
  const [undoSnapshot, setUndoSnapshot] = useState<QuantityEntry[] | null>(null);

  // Filters (Ledger)
  const [filterLocation, setFilterLocation] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Filters (Detailed Analysis)
  const [analysisLocation, setAnalysisLocation] = useState<string>('All');
  const [analysisComponent, setAnalysisComponent] = useState<string>('All');
  const [analysisItemType, setAnalysisItemType] = useState<string>('All');

  // Loading/Exporting
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<QuantityEntry>>({});

  useEffect(() => {
    const unsubscribe = subscribeToQuantities((data) => {
      setQuantities(data);
    });
    return () => unsubscribe();
  }, []);

  const extractQuantityData = (
    location: string,
    component: string | undefined,
    chainageOrArea: string, 
    description: string
  ): { val: number, unit: string, raw: string, type: string, structure: string, element: string, loc: string } => {
    
    // 1. Identify Type
    const type = identifyItemType(description);
    
    // 2. Extract Split Details using Unified Logic
    const details = parseQuantityDetails(location, component, chainageOrArea, description);

    // 3. Extract Number and Unit
    const regex = /(\d+(\.\d+)?)\s*(m3|cum|sqm|sq\.m|m2|m|mtr|nos|t|ton|kg)/i;
    const match = description.match(regex);
    
    if (match) {
      let val = parseFloat(match[1]);
      let unit = match[3].toLowerCase();
      const raw = match[0];

      // Unit Standardization
      if (unit === 'cum') unit = 'm3';
      if (unit === 'sqm' || unit === 'sq.m') unit = 'm2';
      if (unit === 'mtr') unit = 'm';
      if (unit === 't') unit = 'Ton';

      // Rebar Conversion: kg -> Ton
      if (type === 'Rebar' && unit === 'kg') {
        val = val / 1000;
        unit = 'Ton';
      }

      return { val, unit, raw, type, structure: details.structure, element: details.detailElement, loc: details.detailLocation };
    }

    return { val: 0, unit: '-', raw: '-', type, structure: details.structure, element: details.detailElement, loc: details.detailLocation };
  };

  // --- HANDLER: Sync ---

  const handleSyncFromReports = async () => {
    // Capture Snapshot before Sync
    setUndoSnapshot([...quantities]);
    
    setIsSyncing(true);
    let addedCount = 0;
    let updatedCount = 0;

    const existingRefIds = new Set(quantities.map(q => q.originalReportItemId).filter(Boolean));

    try {
      // 1. SCAN FOR NEW ITEMS
      for (const report of reports) {
        for (const entry of report.entries) {
          if (!existingRefIds.has(entry.id)) {
            const qtyData = extractQuantityData(entry.location, entry.component, entry.chainageOrArea, entry.activityDescription);
            
            if (qtyData.val > 0) {
              const newQty: QuantityEntry = {
                id: crypto.randomUUID(),
                date: report.date,
                location: entry.location, // Main Location
                structure: qtyData.structure, // Component (inferred or explicit)
                detailElement: qtyData.element, // Area (e.g. Raft, Wall)
                detailLocation: qtyData.loc, // Chainage/EL formatted
                itemType: qtyData.type,
                description: entry.activityDescription,
                quantityValue: qtyData.val,
                quantityUnit: qtyData.unit,
                originalRawString: qtyData.raw,
                originalReportItemId: entry.id,
                reportId: report.id,
                lastUpdated: new Date().toISOString(),
                updatedBy: user?.displayName || 'System Sync'
              };
              await addQuantity(newQty);
              addedCount++;
            }
          }
        }
      }

      // 2. REPAIR/UPDATE EXISTING ITEMS 
      for (const qty of quantities) {
        let needsUpdate = false;
        let updates: Partial<QuantityEntry> = {};

        // Find source report entry to verify latest Location/Component
        const sourceReport = reports.find(r => r.id === qty.reportId);
        const sourceEntry = sourceReport?.entries.find(e => e.id === qty.originalReportItemId);
        
        if (sourceEntry) {
            // Check if Location Changed (Normalized from "Tailrace" -> "Powerhouse")
            if (sourceEntry.location !== qty.location) {
                updates.location = sourceEntry.location;
                needsUpdate = true;
            }

            // Check if Component Changed (Normalized to "Tailrace Tunnel")
            // Note: If sourceEntry.component is set, it overrides local inference
            const sourceComponent = sourceEntry.component;
            
            // Re-run parsing with latest source info
            const details = parseQuantityDetails(sourceEntry.location, sourceComponent, qty.structure, qty.description);
            
            // Logic: If source has strict component, use it. Otherwise rely on parser.
            const strictStructure = sourceComponent || details.structure;

            if (strictStructure !== qty.structure) {
                 updates.structure = strictStructure;
                 needsUpdate = true;
            }

            // Also check details updates
            if (qty.detailElement !== details.detailElement) {
               updates.detailElement = details.detailElement;
               needsUpdate = true;
            }
            if (qty.detailLocation !== details.detailLocation) {
               updates.detailLocation = details.detailLocation;
               needsUpdate = true;
            }
        }
        
        // Recalculate Item Type if needed
        if (!qty.itemType || qty.itemType === 'Other') {
           const newType = identifyItemType(qty.description);
           if (newType !== 'Other') {
             updates.itemType = newType;
             needsUpdate = true;
           }
        }

        if (needsUpdate) {
             await updateQuantity(
               { ...qty, ...updates }, 
               qty, 
               user?.displayName || 'System Splitter'
             );
             updatedCount++;
        }
      }

      let msg = "";
      if (addedCount > 0) msg += `Added ${addedCount} new items. `;
      if (updatedCount > 0) msg += `Updated ${updatedCount} items based on latest report corrections. `;
      if (!msg) msg = "Everything is up to date.";
      
      alert(msg);

    } catch (e) {
      console.error(e);
      alert("Sync failed. Check console.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUndoSync = async () => {
    if (!undoSnapshot) return;
    if (!window.confirm("Are you sure you want to undo the last sync? This will revert changes made to quantities.")) return;

    setIsSyncing(true);
    try {
        const snapshotIds = new Set(undoSnapshot.map(q => q.id));
        
        // 1. Delete items added during sync (Present in Current but Missing in Snapshot)
        const addedItems = quantities.filter(q => !snapshotIds.has(q.id));
        for (const item of addedItems) {
            await deleteQuantity(item, user?.displayName || 'Undo System');
        }

        // 2. Restore items from Snapshot (Overwrite current state to revert updates)
        for (const oldItem of undoSnapshot) {
             // We use addQuantity (setDoc) to force overwrite the document to its old state
             await addQuantity(oldItem);
        }

        setUndoSnapshot(null); // Clear undo stack after use
        alert("Undo successful. Quantities reverted to previous state.");

    } catch (e) {
        console.error("Undo failed", e);
        alert("Undo failed partially. Please check logs.");
    } finally {
        setIsSyncing(false);
    }
  };

  // --- CRUD Handlers ---

  const handleEditClick = (item: QuantityEntry) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm) return;
    
    const originalItem = quantities.find(q => q.id === editingId);
    if (!originalItem) return;

    try {
      const updatedItem: QuantityEntry = {
        ...originalItem,
        ...editForm,
        lastUpdated: new Date().toISOString(),
        updatedBy: user?.displayName || 'Unknown'
      } as QuantityEntry;

      // This will trigger the sync back to the Report via firebaseService
      await updateQuantity(updatedItem, originalItem, user?.displayName || 'Unknown');
      setEditingId(null);
      setEditForm({});
    } catch (e) {
      alert("Failed to update.");
    }
  };

  const handleDeleteClick = async (item: QuantityEntry) => {
    if (window.confirm(`Delete ${item.itemType} at ${item.location} - ${item.structure}?`)) {
      try {
        await deleteQuantity(item, user?.displayName || 'Unknown');
      } catch (e) {
        alert("Failed to delete.");
      }
    }
  };

  // --- MEMO: Filtered Ledger Items ---
  const filteredLedgerItems = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    return quantities.filter(item => {
       const d = new Date(item.date);
       const dateMatch = d >= start && d <= end;
       const locMatch = filterLocation === 'All' || item.location.includes(filterLocation);
       return dateMatch && locMatch;
    });
  }, [quantities, startDate, endDate, filterLocation]);

  // --- MEMO: Analysis Filter Options ---
  const analysisComponents = useMemo(() => {
    if (analysisLocation === 'All') return [];
    if (analysisLocation === 'Unclassified') {
        // Return components of items that have missing or unknown locations/components
        return Array.from(new Set(quantities.filter(q => !q.location || !q.structure).map(q => q.structure || '(Empty)'))).sort();
    }
    return Array.from(new Set(quantities.filter(q => q.location.includes(analysisLocation)).map(q => q.structure))).sort();
  }, [quantities, analysisLocation]);

  const analysisItems = useMemo(() => {
      let filtered = quantities;
      if (analysisLocation === 'Unclassified') {
          filtered = filtered.filter(q => !q.location || !q.structure || !q.itemType || q.itemType === 'Other');
      } else if (analysisLocation !== 'All') {
          filtered = filtered.filter(q => q.location.includes(analysisLocation));
      }
      
      if (analysisComponent !== 'All') filtered = filtered.filter(q => q.structure === analysisComponent);
      return Array.from(new Set(filtered.map(q => q.itemType || 'Other'))).sort();
  }, [quantities, analysisLocation, analysisComponent]);

  // --- MEMO: Analysis Filtered Data ---
  const analysisData = useMemo(() => {
      return quantities.filter(q => {
          if (analysisLocation === 'Unclassified') {
              // Show items that need fixing: Missing Location, Missing Structure, or "Other" type
              if (q.location && q.structure && q.itemType && q.itemType !== 'Other') return false;
          } else if (analysisLocation !== 'All' && !q.location.includes(analysisLocation)) {
              return false;
          }

          if (analysisComponent !== 'All' && q.structure !== analysisComponent) return false;
          if (analysisItemType !== 'All' && (q.itemType || 'Other') !== analysisItemType) return false;
          return true;
      });
  }, [quantities, analysisLocation, analysisComponent, analysisItemType]);

  const analysisTotal = useMemo(() => {
      return analysisData.reduce((sum, item) => sum + item.quantityValue, 0);
  }, [analysisData]);
  
  const analysisUnit = analysisData.length > 0 ? analysisData[0].quantityUnit : '';


  // --- Export ---
  
  const handleExportCSV = () => {
    const dataToExport = activeSubTab === 'ledger' ? filteredLedgerItems : analysisData;
    const filename = activeSubTab === 'ledger' ? 'Quantity_Ledger' : 'Quantity_Analysis';

    const headers = ['Date', 'Location', 'Component', 'Area (Element)', 'Chainage / EL', 'Item Type', 'Description', 'Qty', 'Unit'];
    const csvRows = [headers.join(',')];

    dataToExport.forEach(item => {
      const row = [
        item.date,
        `"${item.location.replace(/"/g, '""')}"`,
        `"${item.structure.replace(/"/g, '""')}"`, // Component
        `"${(item.detailElement || '').replace(/"/g, '""')}"`, // Area
        `"${(item.detailLocation || '').replace(/"/g, '""')}"`, // Chainage/EL
        `"${item.itemType || 'Other'}"`,
        `"${item.description.replace(/"/g, '""')}"`,
        item.quantityValue,
        item.quantityUnit
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportJPG = async () => {
     setIsExporting(true);
     try {
       const tableEl = document.getElementById(activeSubTab === 'ledger' ? 'qty-ledger-table' : 'qty-analysis-table');
       if(tableEl) {
         const canvas = await window.html2canvas(tableEl, { scale: 2, backgroundColor: '#ffffff' });
         const link = document.createElement('a');
         link.href = canvas.toDataURL("image/jpeg", 0.9);
         link.download = `Quantity_${activeSubTab}.jpg`;
         link.click();
       }
     } catch(e) {
       alert("Export failed");
     } finally {
       setIsExporting(false);
     }
  };

  // Helper to determine if we should show the Location column
  const showLocationColumn = analysisLocation === 'All' || analysisLocation === 'Unclassified';

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in">
      
      {/* Header & Controls */}
      <div className="bg-white p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
         <div>
            <h2 className="text-2xl font-bold text-slate-800">Quantity Collection</h2>
            <p className="text-sm text-slate-500 mt-1">
                Centralized database. Sync automatically separates Chainage vs Area (e.g. Wall, Raft).
            </p>
         </div>
         <div className="flex gap-2">
            
            {undoSnapshot && (
                <button
                   onClick={handleUndoSync}
                   disabled={isSyncing}
                   className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-black transition-colors flex items-center gap-2 shadow-md animate-fade-in"
                >
                    <i className="fas fa-undo"></i> Undo Sync
                </button>
            )}

            <button 
                onClick={handleSyncFromReports}
                disabled={isSyncing}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-md"
            >
                <i className={`fas fa-sync ${isSyncing ? 'fa-spin' : ''}`}></i> 
                {isSyncing ? 'Scanning...' : 'Sync & Update'}
            </button>
            <div className="flex border border-slate-200 rounded-lg overflow-hidden">
                <button 
                   onClick={() => setActiveSubTab('ledger')}
                   className={`px-4 py-2 text-xs font-bold transition-colors ${activeSubTab === 'ledger' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                   <i className="fas fa-list mr-1"></i> General Ledger
                </button>
                <button 
                   onClick={() => setActiveSubTab('analysis')}
                   className={`px-4 py-2 text-xs font-bold transition-colors ${activeSubTab === 'analysis' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                   <i className="fas fa-chart-pie mr-1"></i> Detailed Analysis
                </button>
            </div>
         </div>
      </div>

      {/* --- TAB: GENERAL LEDGER --- */}
      {activeSubTab === 'ledger' && (
        <div className="flex flex-col flex-1 space-y-4">
             {/* Ledger Filters */}
             <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap gap-4 items-center">
                 <div className="flex gap-2 items-center">
                   <label className="text-xs font-bold text-slate-500 uppercase">From</label>
                   <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-1.5 border rounded text-xs" />
                   <label className="text-xs font-bold text-slate-500 uppercase">To</label>
                   <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-1.5 border rounded text-xs" />
                 </div>
                 <div className="flex items-center gap-2">
                   <label className="text-xs font-bold text-slate-500 uppercase">Location</label>
                   <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="p-1.5 border rounded text-xs min-w-[120px]">
                     <option value="All">All Locations</option>
                     {Object.keys(LOCATION_HIERARCHY).map(loc => <option key={loc} value={loc}>{loc}</option>)}
                   </select>
                 </div>
                 <div className="ml-auto flex gap-2">
                    <button onClick={handleExportCSV} className="btn-export bg-green-600 text-white"><i className="fas fa-file-excel mr-1"></i> CSV</button>
                    <button onClick={handleExportJPG} className="btn-export bg-indigo-600 text-white"><i className="fas fa-image mr-1"></i> JPG</button>
                 </div>
             </div>

             <div className="bg-white rounded-2xl shadow border border-slate-200 flex-1 overflow-auto" id="qty-ledger-table">
               <table className="w-full text-left border-collapse">
                 <thead className="bg-slate-100 sticky top-0 z-10">
                   <tr>
                     <th className="p-3 text-xs font-bold text-slate-700 uppercase w-24 border-b">Date</th>
                     <th className="p-3 text-xs font-bold text-slate-700 uppercase w-28 border-b">Location</th>
                     <th className="p-3 text-xs font-bold text-slate-700 uppercase w-28 border-b">Component</th>
                     <th className="p-3 text-xs font-bold text-indigo-700 uppercase w-24 border-b">Area</th>
                     <th className="p-3 text-xs font-bold text-indigo-700 uppercase w-24 border-b">Chainage / EL</th>
                     <th className="p-3 text-xs font-bold text-slate-700 uppercase w-20 border-b">Item</th>
                     <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b">Description</th>
                     <th className="p-3 text-xs font-bold text-indigo-700 uppercase text-right w-16 border-b">Qty</th>
                     <th className="p-3 text-xs font-bold text-indigo-700 uppercase w-12 border-b">Unit</th>
                     <th className="p-3 text-xs font-bold text-slate-700 uppercase w-20 text-center no-export border-b">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 text-sm">
                   {filteredLedgerItems.map((item) => (
                     <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors group">
                       {editingId === item.id ? (
                         <>
                           <td className="p-2"><input className="input-edit" type="date" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} /></td>
                           <td className="p-2"><input className="input-edit" value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} /></td>
                           <td className="p-2"><input className="input-edit" value={editForm.structure} onChange={e => setEditForm({...editForm, structure: e.target.value})} /></td>
                           <td className="p-2"><input className="input-edit border-indigo-400" value={editForm.detailElement || ''} onChange={e => setEditForm({...editForm, detailElement: e.target.value})} placeholder="Raft, Wall" /></td>
                           <td className="p-2"><input className="input-edit border-indigo-400" value={editForm.detailLocation || ''} onChange={e => setEditForm({...editForm, detailLocation: e.target.value})} placeholder="0+038" /></td>
                           <td className="p-2"><input className="input-edit" value={editForm.itemType} onChange={e => setEditForm({...editForm, itemType: e.target.value})} /></td>
                           <td className="p-2"><input className="input-edit" value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} /></td>
                           <td className="p-2 text-right"><input className="input-edit text-right" type="number" value={editForm.quantityValue} onChange={e => setEditForm({...editForm, quantityValue: parseFloat(e.target.value)})} /></td>
                           <td className="p-2"><input className="input-edit" value={editForm.quantityUnit} onChange={e => setEditForm({...editForm, quantityUnit: e.target.value})} /></td>
                           <td className="p-2 text-center flex justify-center gap-1">
                              <button onClick={handleSaveEdit} className="text-green-600 hover:bg-green-100 p-1 rounded"><i className="fas fa-check"></i></button>
                              <button onClick={handleCancelEdit} className="text-red-500 hover:bg-red-100 p-1 rounded"><i className="fas fa-times"></i></button>
                           </td>
                         </>
                       ) : (
                         <>
                           <td className="p-3 text-slate-500 whitespace-nowrap">{item.date}</td>
                           <td className="p-3 font-medium text-slate-800 text-xs">{item.location}</td>
                           <td className="p-3 text-slate-600 text-xs">{item.structure}</td>
                           <td className="p-3 text-indigo-700 text-xs font-medium bg-indigo-50/50">{item.detailElement}</td>
                           <td className="p-3 text-slate-600 text-xs font-mono">{item.detailLocation}</td>
                           <td className="p-3 text-slate-600 text-xs">
                              <span className={`px-2 py-0.5 rounded border ${
                                item.itemType && item.itemType !== 'Other' 
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-100' 
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}>
                                {item.itemType || 'Other'}
                              </span>
                           </td>
                           <td className="p-3 text-slate-700 text-xs">{item.description}</td>
                           <td className="p-3 text-right font-mono font-bold text-indigo-600 bg-slate-50/50">{item.quantityValue}</td>
                           <td className="p-3 text-slate-500">{item.quantityUnit}</td>
                           <td className="p-3 text-center no-export opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleEditClick(item)} className="text-blue-500 hover:text-blue-700 mr-2"><i className="fas fa-pen"></i></button>
                              <button onClick={() => handleDeleteClick(item)} className="text-red-400 hover:text-red-600"><i className="fas fa-trash-alt"></i></button>
                           </td>
                         </>
                       )}
                     </tr>
                   ))}
                 </tbody>
               </table>
               {filteredLedgerItems.length === 0 && <div className="p-8 text-center text-slate-400 italic">No entries match your filters.</div>}
             </div>
        </div>
      )}

      {/* ... Analysis Tab ... */}
      {activeSubTab === 'analysis' && (
        <div className="flex flex-col flex-1 space-y-4">
             {/* 3-Level Filter */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-indigo-50 p-6 rounded-2xl border border-indigo-100 shadow-sm">
                
                <div className="flex flex-col gap-2">
                   <label className="text-xs font-bold text-indigo-800 uppercase tracking-wider">1. Select Location</label>
                   <select 
                      value={analysisLocation} 
                      onChange={e => {
                          setAnalysisLocation(e.target.value);
                          setAnalysisComponent('All'); // Reset
                          setAnalysisItemType('All'); // Reset
                      }} 
                      className="p-3 border border-indigo-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                   >
                     <option value="All">All Locations</option>
                     <option value="Unclassified" className="text-red-600 font-bold">Unclassified / Needs Fix</option>
                     {Object.keys(LOCATION_HIERARCHY).map(loc => <option key={loc} value={loc}>{loc}</option>)}
                   </select>
                </div>

                <div className="flex flex-col gap-2">
                   <label className="text-xs font-bold text-indigo-800 uppercase tracking-wider">2. Select Component</label>
                   <select 
                      value={analysisComponent} 
                      onChange={e => {
                          setAnalysisComponent(e.target.value);
                          setAnalysisItemType('All'); // Reset
                      }}
                      disabled={analysisLocation === 'All'}
                      className="p-3 border border-indigo-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm disabled:opacity-50"
                   >
                     <option value="All">All Components</option>
                     {analysisComponents.map(s => <option key={s} value={s}>{s}</option>)}
                   </select>
                </div>

                <div className="flex flex-col gap-2">
                   <label className="text-xs font-bold text-indigo-800 uppercase tracking-wider">3. Select Item</label>
                   <select 
                      value={analysisItemType} 
                      onChange={e => setAnalysisItemType(e.target.value)} 
                      className="p-3 border border-indigo-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                   >
                     <option value="All">All Items</option>
                     {analysisItems.map(i => <option key={i} value={i}>{i}</option>)}
                   </select>
                </div>
             </div>

             {/* Total Summary */}
             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-lg flex justify-between items-center">
                <div>
                   <h3 className="text-sm text-slate-500 uppercase font-bold">Total Quantity Found</h3>
                   <div className="text-xs text-slate-400 mt-1">Based on selected filters above</div>
                </div>
                <div className="text-right">
                   <span className="text-4xl font-bold text-indigo-600 block">{analysisTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-lg text-slate-500 ml-1">{analysisUnit}</span></span>
                </div>
             </div>

             {/* Detailed Table */}
             <div className="bg-white rounded-2xl shadow border border-slate-200 flex-1 overflow-auto" id="qty-analysis-table">
               <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-end gap-2">
                   <button onClick={handleExportCSV} className="btn-export bg-green-600 text-white"><i className="fas fa-file-excel mr-1"></i> CSV</button>
                   <button onClick={handleExportJPG} className="btn-export bg-indigo-600 text-white"><i className="fas fa-image mr-1"></i> JPG</button>
               </div>
               <table className="w-full text-left border-collapse">
                 <thead className="bg-slate-100 sticky top-0 z-10">
                   <tr>
                     {showLocationColumn && (
                       <th className="p-3 text-xs font-bold text-slate-700 uppercase w-32 border-b">Location</th>
                     )}
                     <th className="p-3 text-xs font-bold text-slate-700 uppercase w-32 border-b">Component</th>
                     <th className="p-3 text-xs font-bold text-indigo-700 uppercase w-32 border-b">Area</th>
                     <th className="p-3 text-xs font-bold text-slate-700 uppercase w-32 border-b">Item Type</th>
                     <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b">Detail / Description</th>
                     <th className="p-3 text-xs font-bold text-slate-700 uppercase w-24 border-b">Date</th>
                     <th className="p-3 text-xs font-bold text-indigo-700 uppercase text-right w-24 border-b">Qty</th>
                     <th className="p-3 text-xs font-bold text-indigo-700 uppercase w-12 border-b">Edit</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 text-sm">
                   {analysisData.map((item) => (
                     <tr key={item.id} className="hover:bg-indigo-50/30">
                       {editingId === item.id ? (
                           <>
                              {showLocationColumn && (
                                <td className="p-2"><input className="input-edit" value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} placeholder="Location" /></td>
                              )}
                              <td className="p-2"><input className="input-edit" value={editForm.structure} onChange={e => setEditForm({...editForm, structure: e.target.value})} placeholder="Component" /></td>
                              <td className="p-2"><input className="input-edit" value={editForm.detailElement || ''} onChange={e => setEditForm({...editForm, detailElement: e.target.value})} /></td>
                              <td className="p-2"><input className="input-edit" value={editForm.itemType} onChange={e => setEditForm({...editForm, itemType: e.target.value})} /></td>
                              <td className="p-2"><input className="input-edit" value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} /></td>
                              <td className="p-2 text-xs text-slate-400">{item.date}</td>
                              <td className="p-2 text-right"><input className="input-edit text-right" type="number" value={editForm.quantityValue} onChange={e => setEditForm({...editForm, quantityValue: parseFloat(e.target.value)})} /></td>
                              <td className="p-2 flex gap-1">
                                  <button onClick={handleSaveEdit} className="text-green-600 hover:bg-green-100 p-1 rounded"><i className="fas fa-check"></i></button>
                                  <button onClick={handleCancelEdit} className="text-red-500 hover:bg-red-100 p-1 rounded"><i className="fas fa-times"></i></button>
                              </td>
                           </>
                       ) : (
                           <>
                              {showLocationColumn && (
                                <td className="p-3 text-slate-700 text-xs font-medium">
                                    {item.location || <span className="text-red-500 italic">Missing</span>}
                                </td>
                              )}
                              <td className="p-3 text-slate-700 text-xs font-medium">
                                  {item.structure || <span className="text-red-500 italic">Unknown</span>}
                              </td>
                              <td className="p-3 text-indigo-700 text-xs font-medium">{item.detailElement}</td>
                              <td className="p-3 text-slate-600 text-xs">
                                  <span className={`px-2 py-1 rounded ${!item.itemType || item.itemType === 'Other' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-indigo-50 text-indigo-700'}`}>
                                      {item.itemType || 'Unknown'}
                                  </span>
                              </td>
                              <td className="p-3 text-slate-500 text-xs">{item.description}</td>
                              <td className="p-3 text-slate-400 text-xs">{item.date}</td>
                              <td className="p-3 text-right font-mono font-bold text-slate-800">{item.quantityValue}</td>
                              <td className="p-3">
                                  <button onClick={() => handleEditClick(item)} className="text-blue-500 hover:text-blue-700 px-2">
                                      <i className="fas fa-pen"></i>
                                  </button>
                              </td>
                           </>
                       )}
                     </tr>
                   ))}
                 </tbody>
               </table>
               {analysisData.length === 0 && <div className="p-8 text-center text-slate-400 italic">No items found for this selection.</div>}
             </div>
        </div>
      )}

      {/* Styles */}
      <style>{`
        .btn-export { @apply px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center; }
        .input-edit { @apply w-full p-1 border border-indigo-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 outline-none; }
        .export-visible { display: none; }
        @media print { .no-export { display: none !important; } }
      `}</style>
    </div>
  );
};