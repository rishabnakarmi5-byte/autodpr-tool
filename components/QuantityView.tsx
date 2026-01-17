import React, { useState, useEffect, useMemo } from 'react';
import { DailyReport, QuantityEntry, DPRItem } from '../types';
import { LOCATION_HIERARCHY } from '../utils/constants';
import { subscribeToQuantities, addQuantity, updateQuantity, deleteQuantity } from '../services/firebaseService';
import { User } from 'firebase/auth';

interface QuantityViewProps {
  reports: DailyReport[];
  user?: User | null;
}

export const QuantityView: React.FC<QuantityViewProps> = ({ reports, user }) => {
  // State
  const [quantities, setQuantities] = useState<QuantityEntry[]>([]);
  const [filterLocation, setFilterLocation] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
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

  // --- Helper Functions ---

  const extractQuantityData = (text: string): { val: number, unit: string, raw: string } => {
    // Matches number followed optionally by unit
    const regex = /(\d+(\.\d+)?)\s*(m3|cum|sqm|sq\.m|m|mtr|nos|t|ton)/i;
    const match = text.match(regex);
    if (match) {
      return {
        val: parseFloat(match[1]),
        unit: match[3],
        raw: match[0]
      };
    }
    return { val: 0, unit: '-', raw: '-' };
  };

  const handleSyncFromReports = async () => {
    setIsSyncing(true);
    let addedCount = 0;

    // Create a Set of existing Report Item IDs already in Quantities to prevent dupes
    const existingRefIds = new Set(quantities.map(q => q.originalReportItemId).filter(Boolean));

    try {
      // Iterate all reports
      for (const report of reports) {
        for (const entry of report.entries) {
          // If we haven't synced this item yet
          if (!existingRefIds.has(entry.id)) {
            const qtyData = extractQuantityData(entry.activityDescription);
            
            // Only add if we found a valid quantity (value > 0 and unit exists)
            // OR if user forces it (but auto-sync should only pick actual quantities)
            if (qtyData.val > 0) {
              const newQty: QuantityEntry = {
                id: crypto.randomUUID(),
                date: report.date,
                location: entry.location,
                structure: entry.chainageOrArea,
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
      if (addedCount > 0) {
        alert(`Successfully synced ${addedCount} new quantity entries from reports.`);
      } else {
        alert("No new quantities found in reports.");
      }
    } catch (e) {
      console.error(e);
      alert("Sync failed. Check console.");
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
      // Keep track of what changed
      const updatedItem: QuantityEntry = {
        ...originalItem,
        ...editForm,
        lastUpdated: new Date().toISOString(),
        updatedBy: user?.displayName || 'Unknown'
      } as QuantityEntry;

      await updateQuantity(updatedItem, originalItem, user?.displayName || 'Unknown');
      setEditingId(null);
      setEditForm({});
    } catch (e) {
      alert("Failed to update.");
    }
  };

  const handleDeleteClick = async (item: QuantityEntry) => {
    if (window.confirm(`Are you sure you want to delete this quantity record?\n\n${item.location} - ${item.quantityValue}${item.quantityUnit}\n\nThis will move it to the Recycle Bin.`)) {
      try {
        await deleteQuantity(item, user?.displayName || 'Unknown');
      } catch (e) {
        alert("Failed to delete.");
      }
    }
  };

  // --- Filtering ---
  
  const filteredItems = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    return quantities.filter(item => {
       const d = new Date(item.date);
       const dateMatch = d >= start && d <= end;
       const locMatch = filterLocation === 'All' || item.location.includes(filterLocation);
       return dateMatch && locMatch;
    });
  }, [quantities, startDate, endDate, filterLocation]);


  // --- Export ---
  
  const handleExportCSV = () => {
    const headers = ['Date', 'Location', 'Structure', 'Description', 'Qty', 'Unit', 'Original Ref'];
    const csvRows = [headers.join(',')];

    filteredItems.forEach(item => {
      const row = [
        item.date,
        `"${item.location.replace(/"/g, '""')}"`,
        `"${item.structure.replace(/"/g, '""')}"`,
        `"${item.description.replace(/"/g, '""')}"`,
        item.quantityValue,
        item.quantityUnit,
        `"${item.originalRawString}"`
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Quantities_${startDate}_to_${endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportJPG = async () => {
     setIsExporting(true);
     try {
       const tableEl = document.getElementById('qty-table-container');
       if(tableEl) {
         const canvas = await window.html2canvas(tableEl, { scale: 2, backgroundColor: '#ffffff' });
         const link = document.createElement('a');
         link.href = canvas.toDataURL("image/jpeg", 0.9);
         link.download = `Quantity_Report.jpg`;
         link.click();
       }
     } catch(e) {
       alert("Export failed");
     } finally {
       setIsExporting(false);
     }
  };

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in">
      
      {/* Header & Controls */}
      <div className="bg-white p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
         <div>
            <h2 className="text-2xl font-bold text-slate-800">Quantity Collection</h2>
            <p className="text-sm text-slate-500 mt-1">
                Editable ledger of project quantities. Auto-synced from reports or added manually.
            </p>
         </div>

         <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto items-end">
            
            {/* Sync Button */}
            <button 
                onClick={handleSyncFromReports}
                disabled={isSyncing}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 h-full shadow-md shadow-indigo-200"
                title="Scans all Daily Reports for quantities not yet in this list"
            >
                <i className={`fas fa-sync ${isSyncing ? 'fa-spin' : ''}`}></i> 
                {isSyncing ? 'Scanning...' : 'Sync from Reports'}
            </button>

            {/* Date Filters */}
            <div className="flex gap-2">
               <div className="flex flex-col">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">From</label>
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)}
                    className="border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
               </div>
               <div className="flex flex-col">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">To</label>
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={e => setEndDate(e.target.value)}
                    className="border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
               </div>
            </div>

            {/* Location Filter */}
            <div className="flex flex-col min-w-[150px]">
               <label className="text-[10px] text-slate-400 font-bold uppercase">Filter Location</label>
               <select 
                 value={filterLocation}
                 onChange={e => setFilterLocation(e.target.value)}
                 className="border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
               >
                 <option value="All">All Locations</option>
                 {Object.keys(LOCATION_HIERARCHY).map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                 ))}
               </select>
            </div>
         </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-white rounded-2xl shadow border border-slate-200 flex-1 overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
             <div className="text-sm font-bold text-slate-600">
               Showing {filteredItems.length} records
             </div>
             <div className="flex gap-2">
                <button onClick={handleExportCSV} className="btn-export bg-green-600 hover:bg-green-700 text-white">
                   <i className="fas fa-file-excel mr-1"></i> CSV
                </button>
                <button onClick={handleExportJPG} disabled={isExporting} className="btn-export bg-indigo-600 hover:bg-indigo-700 text-white">
                   {isExporting ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-image mr-1"></i>} JPG
                </button>
             </div>
          </div>

          <div className="overflow-auto flex-1 p-4" id="qty-table-container">
             <table className="w-full text-left border-collapse">
               <thead>
                 <tr className="bg-slate-100 border-b-2 border-slate-300">
                   <th className="p-3 text-xs font-bold text-slate-700 uppercase w-24">Date</th>
                   <th className="p-3 text-xs font-bold text-slate-700 uppercase w-40">Location</th>
                   <th className="p-3 text-xs font-bold text-slate-700 uppercase w-40">Structure</th>
                   <th className="p-3 text-xs font-bold text-slate-700 uppercase">Description</th>
                   <th className="p-3 text-xs font-bold text-indigo-700 uppercase text-right w-24">Qty</th>
                   <th className="p-3 text-xs font-bold text-indigo-700 uppercase w-16">Unit</th>
                   <th className="p-3 text-xs font-bold text-slate-700 uppercase w-20 text-center no-export">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100 text-sm">
                 {filteredItems.length === 0 ? (
                   <tr><td colSpan={7} className="p-8 text-center text-slate-400 italic">No entries found.</td></tr>
                 ) : (
                   filteredItems.map((item) => (
                     <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors group">
                       {editingId === item.id ? (
                         // EDIT MODE
                         <>
                           <td className="p-2"><input className="input-edit" type="date" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} /></td>
                           <td className="p-2"><input className="input-edit" value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} /></td>
                           <td className="p-2"><input className="input-edit" value={editForm.structure} onChange={e => setEditForm({...editForm, structure: e.target.value})} /></td>
                           <td className="p-2"><input className="input-edit" value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} /></td>
                           <td className="p-2 text-right"><input className="input-edit text-right" type="number" value={editForm.quantityValue} onChange={e => setEditForm({...editForm, quantityValue: parseFloat(e.target.value)})} /></td>
                           <td className="p-2"><input className="input-edit" value={editForm.quantityUnit} onChange={e => setEditForm({...editForm, quantityUnit: e.target.value})} /></td>
                           <td className="p-2 text-center flex justify-center gap-1">
                              <button onClick={handleSaveEdit} className="text-green-600 hover:bg-green-100 p-1 rounded"><i className="fas fa-check"></i></button>
                              <button onClick={handleCancelEdit} className="text-red-500 hover:bg-red-100 p-1 rounded"><i className="fas fa-times"></i></button>
                           </td>
                         </>
                       ) : (
                         // VIEW MODE
                         <>
                           <td className="p-3 text-slate-500 whitespace-nowrap">{item.date}</td>
                           <td className="p-3 font-medium text-slate-800">{item.location}</td>
                           <td className="p-3 text-slate-600">{item.structure}</td>
                           <td className="p-3 text-slate-700">{item.description}</td>
                           <td className="p-3 text-right font-mono font-bold text-indigo-600 bg-slate-50/50">{item.quantityValue}</td>
                           <td className="p-3 text-slate-500">{item.quantityUnit}</td>
                           <td className="p-3 text-center no-export opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleEditClick(item)} className="text-blue-500 hover:text-blue-700 mr-2" title="Edit">
                                <i className="fas fa-pen"></i>
                              </button>
                              <button onClick={() => handleDeleteClick(item)} className="text-red-400 hover:text-red-600" title="Delete">
                                <i className="fas fa-trash-alt"></i>
                              </button>
                           </td>
                         </>
                       )}
                     </tr>
                   ))
                 )}
               </tbody>
             </table>
             
             {/* Signature for Export */}
             <div className="mt-8 pt-4 border-t border-slate-300 flex justify-between items-center opacity-0 export-visible">
                <div className="text-xs text-slate-400">Generated via DPR Maker</div>
                <div className="text-xs font-bold text-slate-800">Project Manager / Engineer</div>
             </div>
          </div>
      </div>
      
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