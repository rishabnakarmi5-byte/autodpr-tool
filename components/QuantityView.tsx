
import React, { useState, useMemo } from 'react';
import { DailyReport, DPRItem, ItemTypeDefinition } from '../types';
import { ITEM_PATTERNS } from '../utils/constants';

interface QuantityViewProps {
  reports: DailyReport[];
  user?: any;
  onInspectItem?: (item: DPRItem) => void;
  onHardSync?: () => void;
  customItemTypes?: ItemTypeDefinition[];
}

export const QuantityView: React.FC<QuantityViewProps> = ({ reports, onInspectItem, onHardSync, customItemTypes }) => {
  const [filterType, setFilterType] = useState('All');
  const [filterLocation, setFilterLocation] = useState('All');
  const [filterComponent, setFilterComponent] = useState('All');
  const [search, setSearch] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  const quantities = useMemo(() => {
    const list: (DPRItem & { date: string })[] = [];
    reports.forEach(r => {
      r.entries.forEach(e => {
        if (e.quantity > 0 || e.itemType !== 'Other') {
          list.push({ ...e, date: r.date });
        }
      });
    });
    return list.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [reports]);

  const locations = useMemo(() => {
    const locs = new Set<string>();
    quantities.forEach(q => {
        if (q.location) locs.add(q.location);
    });
    // Filter out component names that might have accidentally leaked into location field in historical data
    return Array.from(locs).filter(l => l !== "HRT from Inlet" && l !== "HRT from Adit").sort();
  }, [quantities]);

  const componentsForLocation = useMemo(() => {
    const comps = new Set<string>();
    quantities.forEach(q => {
        if (filterLocation === 'All' || q.location === filterLocation) {
            if (q.component) comps.add(q.component);
        }
    });
    return Array.from(comps).sort();
  }, [quantities, filterLocation]);

  const availableItemTypes = useMemo(() => {
    const types = new Set<string>();
    ITEM_PATTERNS.forEach(p => types.add(p.name));
    if (customItemTypes) {
      customItemTypes.forEach(t => {
          const isDuplicate = Array.from(types).some(existing => 
              existing.toLowerCase() === t.name.toLowerCase() ||
              existing.toLowerCase() + 's' === t.name.toLowerCase() ||
              existing.toLowerCase() === t.name.toLowerCase() + 's'
          );
          if(!isDuplicate) types.add(t.name);
      });
    }
    quantities.forEach(q => { 
        if(q.itemType) {
            const isDuplicate = Array.from(types).some(existing => 
                existing.toLowerCase() === q.itemType.toLowerCase() ||
                existing.toLowerCase() + 's' === q.itemType.toLowerCase() ||
                existing.toLowerCase() === q.itemType.toLowerCase() + 's'
            );
            if(!isDuplicate) types.add(q.itemType);
        }
    });
    return Array.from(types).sort();
  }, [quantities, customItemTypes]);

  const filtered = useMemo(() => {
    return quantities.filter(q => {
      const matchType = filterType === 'All' || 
          q.itemType === filterType || 
          (q.itemType && (
              q.itemType.toLowerCase() === filterType.toLowerCase() + 's' ||
              q.itemType.toLowerCase() + 's' === filterType.toLowerCase()
          ));
      const matchLoc = filterLocation === 'All' || q.location === filterLocation;
      const matchComp = filterComponent === 'All' || q.component === filterComponent;
      const matchSearch = q.location.toLowerCase().includes(search.toLowerCase()) || 
                          q.activityDescription.toLowerCase().includes(search.toLowerCase()) ||
                          (q.component || "").toLowerCase().includes(search.toLowerCase()) ||
                          (q.structuralElement || "").toLowerCase().includes(search.toLowerCase()) ||
                          (q.chainage || "").toLowerCase().includes(search.toLowerCase());
      const matchDate = (!dateStart || q.date >= dateStart) && (!dateEnd || q.date <= dateEnd);
      
      return matchType && matchLoc && matchComp && matchSearch && matchDate;
    });
  }, [quantities, filterType, filterLocation, filterComponent, search, dateStart, dateEnd]);

  const exportCSV = () => {
    const headers = "Date,Location,Component,Structure/Area,CH/EL,Activity,Item Type,Qty,Unit\n";
    const rows = filtered.map(q => 
      `"${q.date}","${q.location}","${q.component}","${(q.structuralElement || '').replace(/"/g, '""')}","${(q.chainage || '').replace(/"/g, '""')}","${q.activityDescription.replace(/"/g, '""')}","${q.itemType}",${q.quantity},"${q.unit || 'm3'}"`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Quantity_Ledger_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Quantity Ledger</h2>
          <p className="text-sm text-slate-500 font-medium">Filtered Master Records view.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button onClick={onHardSync} className="flex-1 md:flex-none bg-slate-100 text-slate-400 border border-slate-200 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 cursor-not-allowed" title="Paused to prevent AI overload">
            <i className="fas fa-pause-circle"></i> Sync Paused
          </button>
          <button onClick={exportCSV} className="flex-1 md:flex-none bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">
            <i className="fas fa-file-csv"></i> Export
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 relative">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-bold" placeholder="Search structures, elements or activities..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Classification</label>
                <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-bold" value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="All">All Items</option>
                    {availableItemTypes.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Site Location</label>
                <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-bold" value={filterLocation} onChange={e => { setFilterLocation(e.target.value); setFilterComponent('All'); }}>
                    <option value="All">All Locations</option>
                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Component Filter</label>
                <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-bold" value={filterComponent} onChange={e => setFilterComponent(e.target.value)}>
                    <option value="All">All Components</option>
                    {componentsForLocation.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Start Date</label>
                <input type="date" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-bold" value={dateStart} onChange={e => setDateStart(e.target.value)} />
            </div>
            <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">End Date</label>
                <input type="date" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-bold" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
            </div>
            <div className="flex items-end">
                <button 
                  onClick={() => { setFilterType('All'); setFilterLocation('All'); setFilterComponent('All'); setSearch(''); setDateStart(''); setDateEnd(''); }}
                  className="w-full py-3 text-slate-500 text-xs font-bold hover:text-red-500 transition-colors"
                >
                    Clear All Filters
                </button>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead className="bg-slate-50 border-b-2 border-slate-200">
              <tr>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Location / Component</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Structure / Area</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">CH. / EL.</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Activity</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Classification</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Qty</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-400 italic">No matching quantities found.</td>
                </tr>
              ) : filtered.map(q => (
                <tr key={q.id} onClick={() => onInspectItem?.(q)} className="hover:bg-indigo-50/50 cursor-pointer transition-colors group">
                  <td className="p-4 text-sm font-mono text-slate-500">{q.date}</td>
                  <td className="p-4">
                    <div className="text-sm font-bold text-slate-800">{q.location}</div>
                    <div className="text-[10px] text-indigo-500 font-bold uppercase">{q.component || "General"}</div>
                  </td>
                  <td className="p-4 text-xs font-bold text-slate-600 uppercase">{q.structuralElement || '-'}</td>
                  <td className="p-4 text-xs font-mono text-slate-500 uppercase">{q.chainage || '-'}</td>
                  <td className="p-4">
                    <div className="text-sm text-slate-600 leading-snug">{q.activityDescription}</div>
                  </td>
                  <td className="p-4">
                    <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${q.itemType === 'Other' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                      {q.itemType}
                    </span>
                  </td>
                  <td className="p-4 text-right font-black text-indigo-600 text-lg">{q.quantity || '-'}</td>
                  <td className="p-4 text-[10px] font-black text-slate-400 uppercase">{q.unit || 'm3'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
