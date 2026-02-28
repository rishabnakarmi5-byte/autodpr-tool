import React, { useState, useMemo, useEffect } from 'react';
import { DailyReport, SubContractor, ProjectSettings, DPRItem } from '../types';
import { subscribeToSubContractors } from '../services/firebaseService';

interface SubContractorBillingProps {
  reports: DailyReport[];
  settings: ProjectSettings | null;
  onInspectItem: (item: DPRItem) => void;
}

export const SubContractorBillingView: React.FC<SubContractorBillingProps> = ({ reports, settings, onInspectItem }) => {
  const [subcontractors, setSubcontractors] = useState<SubContractor[]>([]);
  const [selectedScId, setSelectedScId] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'details'>('summary');
  const [selectedItemType, setSelectedItemType] = useState<string | null>(null);
  
  // Default date range: last 30 days
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const unsub = subscribeToSubContractors(setSubcontractors);
    return () => unsub();
  }, []);

  // Auto-select first SC if none selected
  useEffect(() => {
      if (subcontractors.length > 0 && !selectedScId) {
          setSelectedScId(subcontractors[0].id);
      }
  }, [subcontractors, selectedScId]);

  const selectedSc = useMemo(() => subcontractors.find(s => s.id === selectedScId), [subcontractors, selectedScId]);

  const { billData, scItems } = useMemo(() => {
    if (!selectedSc || !selectedSc.assignedComponents || selectedSc.assignedComponents.length === 0) return { billData: [], scItems: [] };

    const from = new Date(fromDate);
    const to = new Date(toDate);
    
    // 1. Filter reports by date range
    const validReports = reports.filter(r => {
        const d = new Date(r.date);
        return d >= from && d <= to;
    });

    // 2. Extract all items from valid reports
    const allItems = validReports.flatMap(r => r.entries);

    // 3. Filter items belonging to the selected SC's assigned components
    const filteredItems = allItems.filter(item => {
        const compStr = `${item.location} - ${item.component}`;
        const locStr = item.location; // Also check if entire location is assigned
        return selectedSc.assignedComponents.includes(compStr) || selectedSc.assignedComponents.includes(locStr);
    });

    // 4. Group by itemType and sum quantities
    const grouped: Record<string, { quantity: number, unit: string }> = {};
    
    filteredItems.forEach(item => {
        const type = item.itemType || 'Unclassified';
        if (!grouped[type]) {
            grouped[type] = { quantity: 0, unit: item.unit || '-' };
        }
        grouped[type].quantity += (item.quantity || 0);
        // Prefer a valid unit if we encountered a blank one previously
        if (grouped[type].unit === '-' && item.unit) {
            grouped[type].unit = item.unit;
        }
    });

    // 5. Calculate amounts based on SC rates
    const calculatedBillData = Object.entries(grouped).map(([itemType, data]) => {
        const rate = (selectedSc.rates || {})[itemType] || 0;
        const amount = data.quantity * rate;
        return {
            itemType,
            quantity: data.quantity,
            unit: data.unit,
            rate,
            amount
        };
    }).filter(item => item.quantity > 0); // Only show items with actual work done

    return { billData: calculatedBillData, scItems: filteredItems };

  }, [reports, selectedSc, fromDate, toDate]);

  const totalAmount = billData.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
        <div className="flex justify-between items-center border-b border-slate-200 pb-4">
            <div>
                <h2 className="text-3xl font-bold text-slate-800 tracking-tight uppercase">Sub-Contractor Billing</h2>
                <p className="text-sm text-slate-500 font-medium">Generate bills based on daily progress reports.</p>
            </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="grid md:grid-cols-3 gap-6">
                <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Select Sub-Contractor</label>
                    <select 
                        className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold bg-slate-50"
                        value={selectedScId}
                        onChange={e => setSelectedScId(e.target.value)}
                    >
                        <option value="" disabled>Select a contractor...</option>
                        {subcontractors.map(sc => (
                            <option key={sc.id} value={sc.id}>{sc.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-2">From Date</label>
                    <input 
                        type="date" 
                        className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold bg-slate-50"
                        value={fromDate}
                        onChange={e => setFromDate(e.target.value)}
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-2">To Date</label>
                    <input 
                        type="date" 
                        className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold bg-slate-50"
                        value={toDate}
                        onChange={e => setToDate(e.target.value)}
                    />
                </div>
            </div>
        </div>

        {selectedSc ? (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-end mb-8 border-b border-slate-100 pb-6">
                    <div>
                        <h3 className="text-2xl font-bold text-slate-800">{selectedSc.name}</h3>
                        <p className="text-slate-500 mt-1">Billing Period: <span className="font-bold text-slate-700">{fromDate}</span> to <span className="font-bold text-slate-700">{toDate}</span></p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Total Bill Amount</p>
                        <p className="text-4xl font-black text-emerald-600">Rs. {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                </div>

                <div className="flex gap-4 mb-6 border-b border-slate-200 pb-2">
                    <button 
                        onClick={() => setActiveSubTab('summary')}
                        className={`px-4 py-2 font-bold text-sm rounded-lg transition-colors ${activeSubTab === 'summary' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <i className="fas fa-table mr-2"></i> Bill Summary
                    </button>
                    <button 
                        onClick={() => setActiveSubTab('details')}
                        className={`px-4 py-2 font-bold text-sm rounded-lg transition-colors ${activeSubTab === 'details' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <i className="fas fa-list mr-2"></i> Detailed Entries
                    </button>
                </div>

                {activeSubTab === 'summary' ? (
                    billData.length === 0 ? (
                        <div className="text-center py-20 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <i className="fas fa-file-invoice-dollar text-4xl mb-4 text-slate-300"></i>
                            <p className="font-medium">No work items found for this contractor in the selected date range.</p>
                            <p className="text-sm mt-2">Ensure components are assigned to this contractor in Project Settings.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 border-y border-slate-200">
                                        <th className="p-4 font-bold uppercase tracking-wider text-sm">Item Description</th>
                                        <th className="p-4 font-bold uppercase tracking-wider text-sm text-right">Total Quantity</th>
                                        <th className="p-4 font-bold uppercase tracking-wider text-sm text-center">Unit</th>
                                        <th className="p-4 font-bold uppercase tracking-wider text-sm text-right">Rate (Rs.)</th>
                                        <th className="p-4 font-bold uppercase tracking-wider text-sm text-right">Amount (Rs.)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {billData.map((item, index) => (
                                        <tr 
                                            key={index} 
                                            className="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                                            onClick={() => {
                                                setSelectedItemType(item.itemType);
                                                setActiveSubTab('details');
                                            }}
                                            title="Click to view detailed entries"
                                        >
                                            <td className="p-4 font-bold text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">
                                                {item.itemType}
                                                <i className="fas fa-external-link-alt text-xs opacity-0 group-hover:opacity-100 text-indigo-400 transition-opacity"></i>
                                            </td>
                                            <td className="p-4 text-right font-mono text-indigo-600 font-bold">
                                                {item.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                                            </td>
                                            <td className="p-4 text-center text-slate-500 font-medium">{item.unit}</td>
                                            <td className="p-4 text-right font-mono text-slate-600">
                                                {item.rate > 0 ? item.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : <span className="text-red-400 italic text-xs">Rate not set</span>}
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold text-slate-800">
                                                {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                                        <td colSpan={4} className="p-4 text-right font-black text-slate-700 uppercase tracking-wider">Total</td>
                                        <td className="p-4 text-right font-black text-emerald-600 text-lg">
                                            {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )
                ) : (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-3">
                                <label className="text-sm font-bold text-slate-500 uppercase">Filter by Item:</label>
                                <select 
                                    className="p-2 border border-slate-200 rounded-lg outline-none font-bold text-sm bg-white"
                                    value={selectedItemType || ''}
                                    onChange={e => setSelectedItemType(e.target.value || null)}
                                >
                                    <option value="">All Items</option>
                                    {billData.map(b => (
                                        <option key={b.itemType} value={b.itemType}>{b.itemType}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="text-sm text-slate-500 font-medium">
                                Click any row to open its master record
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-slate-200 rounded-xl">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-500 border-b border-slate-200">
                                        <th className="p-3 font-bold uppercase tracking-wider">Date</th>
                                        <th className="p-3 font-bold uppercase tracking-wider">Location</th>
                                        <th className="p-3 font-bold uppercase tracking-wider">Component</th>
                                        <th className="p-3 font-bold uppercase tracking-wider">Item Type</th>
                                        <th className="p-3 font-bold uppercase tracking-wider text-right">Quantity</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {scItems
                                        .filter(item => !selectedItemType || item.itemType === selectedItemType)
                                        .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime())
                                        .map((item, index) => (
                                        <tr 
                                            key={item.id || index} 
                                            className="hover:bg-indigo-50 cursor-pointer transition-colors group"
                                            onClick={() => onInspectItem(item)}
                                        >
                                            <td className="p-3 text-slate-600 whitespace-nowrap">{item.date}</td>
                                            <td className="p-3 font-medium text-slate-800">{item.location}</td>
                                            <td className="p-3 text-slate-600">{item.component}</td>
                                            <td className="p-3 font-bold text-slate-700">{item.itemType}</td>
                                            <td className="p-3 text-right font-mono font-bold text-indigo-600">
                                                {item.quantity?.toLocaleString(undefined, { maximumFractionDigits: 3 })} {item.unit}
                                            </td>
                                        </tr>
                                    ))}
                                    {scItems.filter(item => !selectedItemType || item.itemType === selectedItemType).length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                                                No entries found for the selected criteria.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        ) : (
            <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <i className="fas fa-users-cog text-4xl mb-4 text-slate-300"></i>
                <p className="font-medium">Please select a sub-contractor to view their bill.</p>
            </div>
        )}
    </div>
  );
};
