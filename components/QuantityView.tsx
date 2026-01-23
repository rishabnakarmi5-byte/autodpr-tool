
import React, { useState, useMemo } from 'react';
import { DailyReport, DPRItem } from '../types';
import { ITEM_PATTERNS } from '../utils/constants';

interface QuantityViewProps {
  reports: DailyReport[];
  user?: any;
  onInspectItem?: (item: DPRItem) => void;
  onHardSync?: () => void;
}

export const QuantityView: React.FC<QuantityViewProps> = ({ reports, onInspectItem, onHardSync }) => {
  const [filterType, setFilterType] = useState('All');
  const [filterLocation, setFilterLocation] = useState('All');
  const [search, setSearch] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  const locations = useMemo(() => {
    const locs = new Set<string>();
    reports.forEach(r => r.entries.forEach(e => locs.add(e.location)));
    return Array.from(locs).sort();
  }, [reports]);

  const quantities = useMemo(() => {
    const list: (DPRItem & { date: string })[] = [];
    reports.forEach(r => {
      r.entries.forEach(e => {
        // Fix: Show even if itemType is "Other" if there's a quantity
        if (e.quantity > 0 || e.itemType !== 'Other') {
          list.push({ ...e, date: r.date });
        }
      });
    });
    return list.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [reports]);

  const filtered = useMemo(() => {
    return quantities.filter(q => {
      const matchType = filterType === 'All' || q.itemType === filterType;
      const matchLoc = filterLocation === 'All' || q.location === filterLocation;
      const matchSearch = q.location.toLowerCase().includes(search.toLowerCase()) || 
                          q.activityDescription.toLowerCase().includes(search.toLowerCase()) ||
                          (q.component || "").toLowerCase().includes(search.toLowerCase());
      const matchDate = (!dateStart || q.date >= dateStart) && (!dateEnd || q.date <= dateEnd);
      
      return matchType && matchLoc && matchSearch && matchDate;
    });
  }, [quantities, filterType, filterLocation, search, dateStart, dateEnd]);

  const exportCSV = () => {
    const headers = "Date,Location,Component,Activity,Item Type,Qty,Unit\n";
    const rows = filtered.map(q => 
      `"${q.date}","${q.location}","${q.component}","${q.activityDescription.replace(/"/g, '""')}","${q.itemType}",${q.quantity},"${q.unit}"`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Quantity_Ledger_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Quantity Ledger</h2>
          <p className="text-sm text-slate-500 font-medium">Synced Master Records ledger.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onHardSync} className="bg-white text-indigo-600 border border-indigo-200 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-50 transition-all">
            <i className="fas fa-sync-alt"></i> Hard Sync
          </button>
          <button onClick={exportCSV} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">
            <i className="fas fa-file-csv"></i> Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 relative">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-bold" placeholder="Search entries..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div>
                <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-bold" value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="All">All Item Types</option>
                    {ITEM_PATTERNS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
            </div>
            <div>
                <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-bold" value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
                    <option value="All">All Locations</option>
                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
            </div>
        </div>
        <div className="flex gap-4 items-center">
            <div className="flex-1 flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">From:</span>
                <input type="date" className="bg-transparent border-none text-sm font-bold outline-none" value={dateStart} onChange={e => setDateStart(e.target.value)} />
            </div>
            <div className="flex-1 flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">To:</span>
                <input type="date" className="bg-transparent border-none text-sm font-bold outline-none" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
            </div>
            <button onClick={() => { setDateStart(''); setDateEnd(''); setSearch(''); setFilterType('All'); setFilterLocation('All'); }} className="text-xs font-bold text-slate-400 hover:text-red-500 px-4 uppercase tracking-wider">Clear Filters</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="bg-slate-50 border-b-2 border-slate-200">
            <tr>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Activity</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Item Type</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Qty</th>
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Unit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(q => (
              <tr key={q.id} onClick={() => onInspectItem?.(q)} className="hover:bg-indigo-50/50 cursor-pointer transition-colors group">
                <td className="p-4 text-sm font-mono text-slate-500">{q.date}</td>
                <td className="p-4">
                  <div className="text-sm font-bold text-slate-800">{q.location}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-medium">{q.component}</div>
                </td>
                <td className="p-4 text-sm text-slate-600 leading-snug">{q.activityDescription}</td>
                <td className="p-4">
                  <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${q.itemType === 'Other' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                    {q.itemType}
                  </span>
                </td>
                <td className="p-4 text-right font-black text-indigo-600 text-lg">{q.quantity || '-'}</td>
                <td className="p-4 text-[10px] font-black text-slate-400 uppercase">{q.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
