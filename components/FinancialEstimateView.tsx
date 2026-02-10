import React, { useState, useMemo, useEffect } from 'react';
import { DailyReport, DPRItem, ProjectSettings } from '../types';
import { ITEM_PATTERNS } from '../utils/constants';

interface FinancialEstimateViewProps {
  reports: DailyReport[];
  settings: ProjectSettings | null;
  onSaveSettings: (settings: ProjectSettings) => void;
}

interface FinancialGroup {
  items: (DPRItem & { date: string })[];
  totalQty: number;
  rate: number;
  totalAmount: number;
  unit: string;
}

export const FinancialEstimateView: React.FC<FinancialEstimateViewProps> = ({ reports, settings, onSaveSettings }) => {
  const [activeTab, setActiveTab] = useState<'estimate' | 'rates'>('estimate');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  
  // Filters
  const [filterLocation, setFilterLocation] = useState('All');
  const [filterComponent, setFilterComponent] = useState('All');
  const [filterItemType, setFilterItemType] = useState('All');

  // Rates State (initialized from settings, or empty)
  const [rates, setRates] = useState<Record<string, number>>({});
  
  useEffect(() => {
    if (settings?.itemRates) {
        setRates(settings.itemRates);
    }
  }, [settings]);

  // Derived Data: All relevant items flattened
  const allItems = useMemo(() => {
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

  // Extract Lists for Dropdowns
  const locations = useMemo(() => {
    const s = new Set<string>();
    allItems.forEach(i => i.location && s.add(i.location));
    return Array.from(s).sort();
  }, [allItems]);

  const components = useMemo(() => {
    const s = new Set<string>();
    allItems.forEach(i => {
        if(filterLocation === 'All' || i.location === filterLocation) {
            if(i.component) s.add(i.component);
        }
    });
    return Array.from(s).sort();
  }, [allItems, filterLocation]);

  const allTypes = useMemo(() => {
      const s = new Set<string>();
      ITEM_PATTERNS.forEach(p => s.add(p.name));
      if(settings?.itemTypes) settings.itemTypes.forEach(t => s.add(t.name));
      allItems.forEach(i => i.itemType && s.add(i.itemType));
      return Array.from(s).sort();
  }, [allItems, settings]);

  // Filtered Data
  const filteredItems = useMemo(() => {
    return allItems.filter(i => {
        const matchLoc = filterLocation === 'All' || i.location === filterLocation;
        const matchComp = filterComponent === 'All' || i.component === filterComponent;
        const matchType = filterItemType === 'All' || i.itemType === filterItemType;
        const matchDate = (!dateStart || i.date >= dateStart) && (!dateEnd || i.date <= dateEnd);
        return matchLoc && matchComp && matchType && matchDate;
    });
  }, [allItems, filterLocation, filterComponent, filterItemType, dateStart, dateEnd]);

  // Group by Item Type for Financial Summary
  const groupedData = useMemo<Record<string, FinancialGroup>>(() => {
      const groups: Record<string, FinancialGroup> = {};

      filteredItems.forEach(item => {
          const type = item.itemType || 'Unclassified';
          if (!groups[type]) {
              groups[type] = { 
                  items: [], 
                  totalQty: 0, 
                  rate: rates[type] || 0, 
                  totalAmount: 0,
                  unit: item.unit || 'm3' // Take first unit encountered
              };
          }
          groups[type].items.push(item);
          groups[type].totalQty += (item.quantity || 0);
      });

      // Calculate totals
      Object.keys(groups).forEach(key => {
          groups[key].totalAmount = groups[key].totalQty * groups[key].rate;
      });

      return groups;
  }, [filteredItems, rates]);

  const grandTotal = (Object.values(groupedData) as FinancialGroup[]).reduce((sum, g) => sum + g.totalAmount, 0);

  // Handlers
  const handleRateChange = (type: string, val: string) => {
      const num = parseFloat(val) || 0;
      setRates(prev => ({ ...prev, [type]: num }));
  };

  const saveRates = () => {
      if (settings) {
          onSaveSettings({
              ...settings,
              itemRates: rates
          });
          alert("Rates saved successfully!");
      } else {
          alert("Project settings not loaded yet.");
      }
  };

  const formatCurrency = (val: number) => {
      return val.toLocaleString('en-US', { style: 'currency', currency: 'NPR' }).replace('NPR', 'Rs.');
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex justify-between items-center border-b border-slate-200 pb-4">
        <div>
           <h2 className="text-3xl font-bold text-slate-800 tracking-tight uppercase">Financial Estimate</h2>
           <p className="text-sm text-slate-500 font-medium">Project cost estimation based on daily quantities.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
             <button onClick={() => setActiveTab('estimate')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'estimate' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>
                <i className="fas fa-calculator mr-2"></i> Estimate
             </button>
             <button onClick={() => setActiveTab('rates')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'rates' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>
                <i className="fas fa-tags mr-2"></i> Set Item Rates
             </button>
        </div>
      </div>

      {activeTab === 'rates' && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
             <div className="flex justify-between items-center mb-6">
                 <div>
                    <h3 className="text-xl font-bold text-slate-800">Item Rate Configuration</h3>
                    <p className="text-sm text-slate-500">Set the unit rate for each item type to calculate totals.</p>
                 </div>
                 <button onClick={saveRates} className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-all flex items-center gap-2">
                     <i className="fas fa-save"></i> Save Rates
                 </button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {allTypes.map(type => (
                     <div key={type} className="flex flex-col gap-1 p-3 bg-slate-50 border border-slate-100 rounded-xl hover:shadow-md transition-all">
                         <label className="text-xs font-black text-slate-500 uppercase">{type}</label>
                         <div className="flex items-center gap-2">
                             <span className="text-slate-400 font-bold">Rs.</span>
                             <input 
                                type="number" 
                                className="flex-1 bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                                value={rates[type] || ''}
                                onChange={e => handleRateChange(type, e.target.value)}
                                placeholder="0.00"
                             />
                         </div>
                     </div>
                 ))}
             </div>
          </div>
      )}

      {activeTab === 'estimate' && (
          <div className="space-y-6">
              {/* Filters */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">From Date</label>
                          <input type="date" className="w-full p-2 border border-slate-200 rounded-lg text-sm font-bold" value={dateStart} onChange={e => setDateStart(e.target.value)} />
                      </div>
                      <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">To Date</label>
                          <input type="date" className="w-full p-2 border border-slate-200 rounded-lg text-sm font-bold" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
                      </div>
                      <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Location</label>
                          <select className="w-full p-2 border border-slate-200 rounded-lg text-sm font-bold" value={filterLocation} onChange={e => { setFilterLocation(e.target.value); setFilterComponent('All'); }}>
                              <option value="All">All Locations</option>
                              {locations.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Component</label>
                          <select className="w-full p-2 border border-slate-200 rounded-lg text-sm font-bold" value={filterComponent} onChange={e => setFilterComponent(e.target.value)}>
                              <option value="All">All Components</option>
                              {components.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Item Type</label>
                          <select className="w-full p-2 border border-slate-200 rounded-lg text-sm font-bold" value={filterItemType} onChange={e => setFilterItemType(e.target.value)}>
                              <option value="All">All Item Types</option>
                              {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                      </div>
                  </div>
              </div>

              {/* Summary Cards */}
              <div className="grid md:grid-cols-3 gap-6">
                 <div className="bg-indigo-600 text-white p-6 rounded-2xl shadow-lg shadow-indigo-200">
                    <h4 className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">Grand Total Estimate</h4>
                    <div className="text-3xl font-black">{formatCurrency(grandTotal)}</div>
                    <div className="text-indigo-300 text-sm mt-2">{filteredItems.length} records included</div>
                 </div>
              </div>

              {/* Grouped Table */}
              <div className="space-y-8">
                  {Object.keys(groupedData).sort().map(type => {
                      const group = groupedData[type] as FinancialGroup;
                      if (group.items.length === 0) return null;

                      return (
                          <div key={type} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                              <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                                  <div>
                                      <h3 className="text-lg font-black text-slate-800 uppercase">{type}</h3>
                                      <div className="flex gap-4 text-xs mt-1">
                                          <span className="text-slate-500 font-bold">Total Qty: {group.totalQty.toFixed(2)} {group.unit}</span>
                                          <span className="text-slate-500 font-bold">Rate: {formatCurrency(group.rate)}</span>
                                      </div>
                                  </div>
                                  <div className="text-right">
                                      <div className="text-xs font-bold text-slate-400 uppercase">Subtotal</div>
                                      <div className="text-xl font-black text-indigo-600">{formatCurrency(group.totalAmount)}</div>
                                  </div>
                              </div>
                              <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse">
                                      <thead className="bg-white border-b border-slate-100">
                                          <tr>
                                              <th className="p-3 text-[10px] font-black text-slate-400 uppercase">Date</th>
                                              <th className="p-3 text-[10px] font-black text-slate-400 uppercase">Location</th>
                                              <th className="p-3 text-[10px] font-black text-slate-400 uppercase">Details</th>
                                              <th className="p-3 text-[10px] font-black text-slate-400 uppercase text-right">Qty</th>
                                              <th className="p-3 text-[10px] font-black text-slate-400 uppercase text-right">Amount</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50">
                                          {group.items.map(item => (
                                              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                                  <td className="p-3 text-xs font-mono text-slate-500 whitespace-nowrap">{item.date}</td>
                                                  <td className="p-3 text-xs font-bold text-slate-700">
                                                      <div>{item.location}</div>
                                                      <div className="text-[10px] text-indigo-500 uppercase">{item.component}</div>
                                                  </td>
                                                  <td className="p-3 text-xs text-slate-600 max-w-md truncate" title={item.activityDescription}>
                                                      {item.chainageOrArea && <span className="font-mono bg-slate-100 px-1 rounded mr-2">{item.chainageOrArea}</span>}
                                                      {item.activityDescription}
                                                  </td>
                                                  <td className="p-3 text-xs font-bold text-slate-800 text-right">
                                                      {item.quantity} <span className="text-[10px] text-slate-400">{item.unit}</span>
                                                  </td>
                                                  <td className="p-3 text-xs font-bold text-slate-800 text-right">
                                                      {formatCurrency(item.quantity * group.rate)}
                                                  </td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              </div>
                          </div>
                      );
                  })}
                  
                  {filteredItems.length === 0 && (
                      <div className="text-center p-12 text-slate-400 italic bg-white rounded-2xl border border-slate-200">
                          No items match the selected filters.
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};