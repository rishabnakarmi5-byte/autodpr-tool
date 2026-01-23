
import React, { useState, useEffect } from 'react';
import { DPRItem, BackupEntry } from '../types';
import { getBackupById } from '../services/firebaseService';
import { ITEM_PATTERNS } from '../utils/constants';

interface MasterRecordModalProps {
  item: DPRItem;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<DPRItem>) => void;
  onSplit: (item: DPRItem) => void;
  hierarchy: Record<string, string[]>;
}

export const MasterRecordModal: React.FC<MasterRecordModalProps> = ({ item, isOpen, onClose, onUpdate, onSplit, hierarchy }) => {
  const [localItem, setLocalItem] = useState<DPRItem>(item);
  const [sourceBackup, setSourceBackup] = useState<BackupEntry | null>(null);
  const [activeTab, setActiveTab] = useState<'source' | 'history'>('source');
  const [loadingSource, setLoadingSource] = useState(false);

  useEffect(() => {
    setLocalItem(item);
    if (isOpen && item.sourceBackupId) {
      setLoadingSource(true);
      getBackupById(item.sourceBackupId).then(b => {
        setSourceBackup(b);
        setLoadingSource(false);
      });
    }
  }, [item, isOpen]);

  const handleChange = (field: keyof DPRItem, value: any) => {
    setLocalItem(prev => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: keyof DPRItem) => {
    if (localItem[field] !== (item as any)[field]) {
      onUpdate(item.id, { [field]: localItem[field] });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full h-[85vh] flex flex-col overflow-hidden border border-slate-700">
        
        {/* Header */}
        <div className="bg-slate-900 p-5 flex justify-between items-center text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/50">
              <i className="fas fa-database text-2xl"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-wide uppercase">Master Record</h2>
              <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-1">
                <span className="bg-slate-800 px-2 py-0.5 rounded text-indigo-300">ID: {item.id.split('-')[0]}...</span>
                <span><i className="fas fa-user-circle mr-1"></i> {item.createdBy}</span>
                <span><i className="fas fa-clock mr-1"></i> {new Date(item.lastModifiedAt || new Date().toISOString()).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: FORM */}
          <div className="w-3/5 p-8 overflow-y-auto bg-slate-50 space-y-8">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
              <div className="absolute -top-3 left-4 bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Location Context</div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Main Location</label>
                  <select className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold" value={localItem.location} onChange={(e) => { handleChange('location', e.target.value); onUpdate(item.id, {location: e.target.value}); }}>
                    {Object.keys(hierarchy).map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Component</label>
                  <select className="w-full p-2.5 border border-slate-200 rounded-lg text-sm" value={localItem.component} onChange={(e) => { handleChange('component', e.target.value); onUpdate(item.id, {component: e.target.value}); }}>
                    <option value="">Select...</option>
                    {(hierarchy[localItem.location] || []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Structure / Area</label>
                  <input className="w-full p-2.5 border border-slate-200 rounded-lg text-sm" value={localItem.structuralElement || ''} onChange={e => handleChange('structuralElement', e.target.value)} onBlur={() => handleBlur('structuralElement')} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Chainage / Elevation</label>
                  <input className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-mono" value={localItem.chainage || ''} onChange={e => handleChange('chainage', e.target.value)} onBlur={() => handleBlur('chainage')} />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
              <div className="absolute -top-3 left-4 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Work Specs & Quantity</div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Classification</label>
                  <select className="w-full p-2.5 border border-slate-200 rounded-lg text-sm" value={localItem.itemType} onChange={e => { handleChange('itemType', e.target.value); onUpdate(item.id, {itemType: e.target.value}); }}>
                    <option value="Other">Unclassified</option>
                    {ITEM_PATTERNS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Quantity</label>
                    <input type="number" className="w-full p-3 border border-slate-200 rounded-lg text-2xl font-bold text-indigo-600" value={localItem.quantity} onChange={e => handleChange('quantity', parseFloat(e.target.value))} onBlur={() => handleBlur('quantity')} />
                  </div>
                  <div className="w-1/4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Unit</label>
                    <select className="w-full p-3 border border-slate-200 rounded-lg text-lg h-[58px]" value={localItem.unit} onChange={e => { handleChange('unit', e.target.value); onUpdate(item.id, {unit: e.target.value}); }}>
                      <option value="m3">m3</option>
                      <option value="m2">m2</option>
                      <option value="Ton">Ton</option>
                      <option value="nos">nos</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Activity Description</label>
                  <textarea className="w-full p-3 border border-slate-200 rounded-lg text-sm min-h-[100px]" value={localItem.activityDescription} onChange={e => handleChange('activityDescription', e.target.value)} onBlur={() => handleBlur('activityDescription')} />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: TABS */}
          <div className="w-2/5 border-l border-slate-200 bg-white flex flex-col">
            <div className="flex border-b border-slate-200">
              <button onClick={() => setActiveTab('source')} className={`flex-1 py-4 text-xs font-bold uppercase ${activeTab === 'source' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-400'}`}>Source Data</button>
              <button onClick={() => setActiveTab('history')} className={`flex-1 py-4 text-xs font-bold uppercase ${activeTab === 'history' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-400'}`}>Audit Trail</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'source' ? (
                loadingSource ? <div className="text-center p-10 text-slate-400">Loading original text...</div> : (
                  sourceBackup ? <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-xs leading-relaxed whitespace-pre-wrap shadow-inner">{sourceBackup.rawInput}</div> : <div className="text-center p-10 text-slate-400 italic">No source backup found for manual entry.</div>
                )
              ) : (
                <div className="space-y-4">
                  {item.editHistory?.slice().reverse().map((log, i) => (
                    <div key={i} className="relative pl-6 border-l-2 border-slate-100 pb-4">
                      <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-indigo-400"></div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">{new Date(log.timestamp).toLocaleString()} • {log.user}</div>
                      <div className="text-xs text-slate-700 mt-1">
                        Changed <span className="font-bold text-indigo-600">{log.field}</span> from 
                        <span className="mx-1 line-through text-slate-400">{log.oldValue || 'none'}</span> to 
                        <span className="ml-1 font-bold text-emerald-600">{log.newValue}</span>
                      </div>
                    </div>
                  )) || <div className="text-center p-10 text-slate-400 italic">No edit history recorded.</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
