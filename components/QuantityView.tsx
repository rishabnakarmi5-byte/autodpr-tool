
import React, { useState, useEffect, useMemo } from 'react';
import { DailyReport, QuantityEntry, ProjectSettings } from '../types';
import { subscribeToQuantities, updateQuantity, deleteQuantity } from '../services/firebaseService';

interface QuantityViewProps {
  reports: DailyReport[];
  user?: any;
  settings: ProjectSettings;
}

export const QuantityView: React.FC<QuantityViewProps> = ({ reports, user, settings }) => {
  const [quantities, setQuantities] = useState<QuantityEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<QuantityEntry>>({});

  useEffect(() => subscribeToQuantities(setQuantities), []);

  const handleSave = async () => {
    if (!editingId) return;
    const original = quantities.find(q => q.id === editingId);
    await updateQuantity({ ...original, ...editForm }, original, user.displayName);
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
       <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100">
          <h2 className="text-2xl font-bold">Quantity Collection Ledger</h2>
          <p className="text-sm text-slate-400 mt-1">Central database for all extracted volumes and items.</p>
       </div>

       <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden relative">
          <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead className="bg-slate-50 border-b">
                   <tr className="text-xs font-bold text-slate-500 uppercase">
                      <th className="p-4 sticky left-0 bg-slate-50 z-10 w-32 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Date</th>
                      <th className="p-4">Location</th>
                      <th className="p-4">Structure</th>
                      <th className="p-4">Area</th>
                      <th className="p-4">Chainage/EL</th>
                      <th className="p-4">Item Type</th>
                      <th className="p-4">Quantity</th>
                      <th className="p-4 text-center sticky right-0 bg-slate-50 z-10 w-32 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">Actions</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                   {quantities.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                         <td className="p-4 sticky left-0 bg-white group-hover:bg-slate-50 font-mono z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">{item.date}</td>
                         <td className="p-4">{editingId === item.id ? <input value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} className="border p-1 rounded" /> : item.location}</td>
                         <td className="p-4">{editingId === item.id ? <input value={editForm.structure} onChange={e => setEditForm({...editForm, structure: e.target.value})} className="border p-1 rounded" /> : item.structure}</td>
                         <td className="p-4">{editingId === item.id ? <input value={editForm.detailElement} onChange={e => setEditForm({...editForm, detailElement: e.target.value})} className="border p-1 rounded" /> : item.detailElement}</td>
                         <td className="p-4">{editingId === item.id ? <input value={editForm.detailLocation} onChange={e => setEditForm({...editForm, detailLocation: e.target.value})} className="border p-1 rounded" /> : item.detailLocation}</td>
                         <td className="p-4">
                            {editingId === item.id ? (
                               <select value={editForm.itemType} onChange={e => setEditForm({...editForm, itemType: e.target.value})} className="border p-1 rounded">
                                  {settings.itemTypes.map(t => <option key={t} value={t}>{t}</option>)}
                               </select>
                            ) : <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full font-bold text-[10px]">{item.itemType}</span>}
                         </td>
                         <td className="p-4 font-bold text-indigo-600">{item.quantityValue} {item.quantityUnit}</td>
                         <td className="p-4 sticky right-0 bg-white group-hover:bg-slate-50 z-10 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] flex justify-center gap-2">
                            {editingId === item.id ? (
                               <>
                                  <button onClick={handleSave} className="bg-green-600 text-white w-8 h-8 rounded-lg shadow-lg"><i className="fas fa-check"></i></button>
                                  <button onClick={() => setEditingId(null)} className="bg-slate-200 text-slate-600 w-8 h-8 rounded-lg"><i className="fas fa-times"></i></button>
                               </>
                            ) : (
                               <>
                                  <button onClick={() => { setEditingId(item.id); setEditForm(item); }} className="text-indigo-600 hover:bg-indigo-50 w-8 h-8 rounded-lg"><i className="fas fa-pen"></i></button>
                                  <button onClick={() => deleteQuantity(item, user.displayName)} className="text-red-500 hover:bg-red-50 w-8 h-8 rounded-lg"><i className="fas fa-trash"></i></button>
                               </>
                            )}
                         </td>
                      </tr>
                   ))}
                </tbody>
             </table>
          </div>
       </div>
    </div>
  );
};
