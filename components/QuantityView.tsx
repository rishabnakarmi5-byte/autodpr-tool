
import React, { useState, useEffect, useMemo } from 'react';
import { DailyReport, QuantityEntry } from '../types';
import { ITEM_PATTERNS } from '../utils/constants';
import { subscribeToQuantities, updateQuantity, deleteQuantity } from '../services/firebaseService';

interface QuantityViewProps {
  reports: DailyReport[];
  user?: any;
}

type SubTab = 'ledger' | 'analysis';

export const QuantityView: React.FC<QuantityViewProps> = ({ reports, user }) => {
  const [quantities, setQuantities] = useState<QuantityEntry[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('ledger');
  
  // Filters
  const [filterLocation, setFilterLocation] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<QuantityEntry>>({});

  useEffect(() => {
    return subscribeToQuantities((data) => setQuantities(data));
  }, []);

  const handleEditClick = (item: QuantityEntry) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const originalItem = quantities.find(q => q.id === editingId);
    if (!originalItem) return;
    try {
      await updateQuantity({ ...originalItem, ...editForm } as QuantityEntry, originalItem, user?.displayName);
      setEditingId(null);
    } catch (e) { alert("Failed to update."); }
  };

  const handleDeleteClick = async (item: QuantityEntry) => {
    if (window.confirm(`Delete ${item.itemType}?`)) {
      await deleteQuantity(item, user?.displayName);
    }
  };

  const filteredLedgerItems = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return quantities.filter(item => {
       const d = new Date(item.date);
       return d >= start && d <= end && (filterLocation === 'All' || item.location === filterLocation);
    });
  }, [quantities, startDate, endDate, filterLocation]);

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 flex justify-between items-center">
         <h2 className="text-2xl font-bold text-slate-800">Quantities</h2>
         <div className="flex border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setActiveSubTab('ledger')} className={`px-4 py-2 text-xs font-bold ${activeSubTab === 'ledger' ? 'bg-slate-800 text-white' : 'bg-white'}`}>Ledger</button>
            <button onClick={() => setActiveSubTab('analysis')} className={`px-4 py-2 text-xs font-bold ${activeSubTab === 'analysis' ? 'bg-slate-800 text-white' : 'bg-white'}`}>Analysis</button>
         </div>
      </div>

      <div className="bg-white rounded-2xl shadow border border-slate-200 flex-1 overflow-x-auto relative">
         <table className="w-full text-left border-collapse min-w-[1000px]">
             <thead className="bg-slate-100 sticky top-0 z-10">
               <tr>
                 <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b">Date</th>
                 <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b">Location</th>
                 <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b">Component</th>
                 <th className="p-3 text-xs font-bold text-indigo-700 uppercase border-b">Area</th>
                 <th className="p-3 text-xs font-bold text-indigo-700 uppercase border-b">CH/EL</th>
                 <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b w-40">Item Type</th>
                 <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b">Description</th>
                 <th className="p-3 text-xs font-bold text-right uppercase border-b">Qty</th>
                 <th className="p-3 text-xs font-bold uppercase border-b">Unit</th>
                 <th className="p-3 text-xs font-bold uppercase border-b text-center sticky right-0 bg-slate-100 shadow-l">Actions</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100 text-sm">
               {filteredLedgerItems.map((item) => (
                 <tr key={item.id} className="hover:bg-indigo-50/30 group">
                   {editingId === item.id ? (
                     <>
                       <td className="p-2"><input className="input-edit" type="date" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} /></td>
                       <td className="p-2"><input className="input-edit" value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} /></td>
                       <td className="p-2"><input className="input-edit" value={editForm.structure} onChange={e => setEditForm({...editForm, structure: e.target.value})} /></td>
                       <td className="p-2"><input className="input-edit" value={editForm.detailElement || ''} onChange={e => setEditForm({...editForm, detailElement: e.target.value})} /></td>
                       <td className="p-2"><input className="input-edit" value={editForm.detailLocation || ''} onChange={e => setEditForm({...editForm, detailLocation: e.target.value})} /></td>
                       <td className="p-2">
                          <select className="input-edit" value={editForm.itemType} onChange={e => setEditForm({...editForm, itemType: e.target.value})}>
                              {ITEM_PATTERNS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                              <option value="Other">Other</option>
                          </select>
                       </td>
                       <td className="p-2"><input className="input-edit" value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} /></td>
                       <td className="p-2 text-right"><input className="input-edit text-right" type="number" value={editForm.quantityValue} onChange={e => setEditForm({...editForm, quantityValue: parseFloat(e.target.value)})} /></td>
                       <td className="p-2"><input className="input-edit" value={editForm.quantityUnit} onChange={e => setEditForm({...editForm, quantityUnit: e.target.value})} /></td>
                       <td className="p-2 text-center sticky right-0 bg-white shadow-l z-20 flex justify-center gap-2">
                          <button onClick={handleSaveEdit} className="text-green-600 bg-green-50 p-1.5 rounded hover:bg-green-100"><i className="fas fa-check"></i></button>
                          <button onClick={() => setEditingId(null)} className="text-red-500 bg-red-50 p-1.5 rounded hover:bg-red-100"><i className="fas fa-times"></i></button>
                       </td>
                     </>
                   ) : (
                     <>
                       <td className="p-3 text-slate-500 whitespace-nowrap">{item.date}</td>
                       <td className="p-3 font-medium text-slate-800">{item.location}</td>
                       <td className="p-3 text-slate-600">{item.structure}</td>
                       <td className="p-3 text-indigo-700 font-medium">{item.detailElement}</td>
                       <td className="p-3 text-slate-600 font-mono text-xs">{item.detailLocation}</td>
                       <td className="p-3"><span className="bg-slate-100 px-2 py-1 rounded text-xs">{item.itemType}</span></td>
                       <td className="p-3 text-slate-700">{item.description}</td>
                       <td className="p-3 text-right font-bold text-indigo-600">{item.quantityValue}</td>
                       <td className="p-3 text-slate-500">{item.quantityUnit}</td>
                       <td className="p-3 text-center sticky right-0 bg-white group-hover:bg-indigo-50/30 shadow-l transition-colors">
                          <button onClick={() => handleEditClick(item)} className="text-blue-500 hover:text-blue-700 mr-3"><i className="fas fa-pen"></i></button>
                          <button onClick={() => handleDeleteClick(item)} className="text-red-400 hover:text-red-600"><i className="fas fa-trash-alt"></i></button>
                       </td>
                     </>
                   )}
                 </tr>
               ))}
             </tbody>
         </table>
      </div>
      <style>{`
        .input-edit { @apply w-full p-1.5 border border-indigo-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 outline-none bg-white; }
        .shadow-l { box-shadow: -4px 0 10px -2px rgba(0, 0, 0, 0.05); }
      `}</style>
    </div>
  );
};
