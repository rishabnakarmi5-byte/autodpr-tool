
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
  const [isLoadingBackup, setIsLoadingBackup] = useState(false);

  useEffect(() => {
    setLocalItem(item);
    if (isOpen && item.sourceBackupId) {
        setIsLoadingBackup(true);
        getBackupById(item.sourceBackupId).then(b => {
            setSourceBackup(b);
            setIsLoadingBackup(false);
        });
    } else {
        setSourceBackup(null);
    }
  }, [item, isOpen]);

  const handleChange = (field: keyof DPRItem, value: any) => {
      setLocalItem(prev => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: keyof DPRItem) => {
      if (localItem[field] !== item[field]) {
          onUpdate(item.id, { [field]: localItem[field] });
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full h-[85vh] flex flex-col overflow-hidden relative border border-slate-700">
            
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
                <div className="flex gap-3">
                    <button 
                        onClick={() => onSplit(item)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-900/50"
                    >
                        <i className="fas fa-columns"></i> Split Activity
                    </button>
                    <button onClick={onClose} className="w-9 h-9 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors">
                        <i className="fas fa-times text-slate-300"></i>
                    </button>
                </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 flex overflow-hidden">
                
                {/* LEFT: EDITABLE FORM */}
                <div className="w-3/5 p-8 overflow-y-auto bg-slate-50">
                    <div className="max-w-3xl mx-auto space-y-8">
                        
                        {/* Section 1: Location Context */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative group hover:border-indigo-300 transition-colors">
                            <div className="absolute -top-3 left-4 bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Location Context</div>
                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Main Location</label>
                                    <select 
                                        className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={localItem.location}
                                        onChange={(e) => {
                                            handleChange('location', e.target.value);
                                            onUpdate(item.id, { location: e.target.value });
                                        }}
                                    >
                                        {Object.keys(hierarchy).map(k => <option key={k} value={k}>{k}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Component</label>
                                    <select 
                                        className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={localItem.component}
                                        onChange={(e) => {
                                            handleChange('component', e.target.value);
                                            onUpdate(item.id, { component: e.target.value });
                                        }}
                                    >
                                        <option value="">Select...</option>
                                        {(hierarchy[localItem.location] || []).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Structure / Area</label>
                                    <input 
                                        className="w-full p-2.5 border border-slate-200 rounded-lg text-sm"
                                        value={localItem.structuralElement || ''}
                                        onChange={(e) => handleChange('structuralElement', e.target.value)}
                                        onBlur={() => handleBlur('structuralElement')}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Chainage / Elevation</label>
                                    <input 
                                        className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-mono"
                                        value={localItem.chainage || ''}
                                        onChange={(e) => handleChange('chainage', e.target.value)}
                                        onBlur={() => handleBlur('chainage')}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Work Specification */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative group hover:border-indigo-300 transition-colors">
                            <div className="absolute -top-3 left-4 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Work Specs & Quantity</div>
                            
                            <div className="mb-4">
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Item Type Classification</label>
                                <select 
                                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50"
                                    value={localItem.itemType || 'Other'}
                                    onChange={(e) => {
                                        handleChange('itemType', e.target.value);
                                        onUpdate(item.id, { itemType: e.target.value });
                                    }}
                                >
                                    {ITEM_PATTERNS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            <div className="flex gap-4 mb-4">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Quantity</label>
                                    <input 
                                        type="number"
                                        className="w-full p-3 border border-slate-200 rounded-lg text-2xl font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={localItem.quantity}
                                        onChange={(e) => handleChange('quantity', parseFloat(e.target.value))}
                                        onBlur={() => handleBlur('quantity')}
                                    />
                                </div>
                                <div className="w-1/3">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Unit</label>
                                    <select 
                                        className="w-full p-3 border border-slate-200 rounded-lg text-lg font-bold text-slate-600 h-[58px]"
                                        value={localItem.unit}
                                        onChange={(e) => {
                                            handleChange('unit', e.target.value);
                                            onUpdate(item.id, { unit: e.target.value });
                                        }}
                                    >
                                        <option value="">-</option>
                                        <option value="m3">m3</option>
                                        <option value="m2">m2</option>
                                        <option value="nos">nos</option>
                                        <option value="rm">rm</option>
                                        <option value="ton">ton</option>
                                        <option value="kg">kg</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Activity Description</label>
                                <textarea 
                                    className="w-full p-3 border border-slate-200 rounded-lg text-sm text-slate-700 min-h-[80px] focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={localItem.activityDescription}
                                    onChange={(e) => handleChange('activityDescription', e.target.value)}
                                    onBlur={() => handleBlur('activityDescription')}
                                />
                            </div>
                        </div>

                        {/* Section 3: Planning */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative group hover:border-indigo-300 transition-colors">
                            <div className="absolute -top-3 left-4 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Planning</div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Next Day Plan</label>
                            <input 
                                className="w-full p-2.5 border border-slate-200 rounded-lg text-sm"
                                value={localItem.plannedNextActivity}
                                onChange={(e) => handleChange('plannedNextActivity', e.target.value)}
                                onBlur={() => handleBlur('plannedNextActivity')}
                            />
                        </div>

                    </div>
                </div>

                {/* RIGHT: CONTEXT TABS */}
                <div className="w-2/5 border-l border-slate-200 bg-white flex flex-col">
                    <div className="flex border-b border-slate-200">
                        <button 
                            onClick={() => setActiveTab('source')}
                            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'source' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <i className="fas fa-code mr-2"></i> Source Data
                        </button>
                        <button 
                            onClick={() => setActiveTab('history')}
                            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'history' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <i className="fas fa-history mr-2"></i> Audit Trail
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        {activeTab === 'source' && (
                            <div className="space-y-4">
                                {isLoadingBackup ? (
                                    <div className="p-8 text-center text-slate-400"><i className="fas fa-circle-notch fa-spin"></i> Retrieving...</div>
                                ) : sourceBackup ? (
                                    <>
                                        <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-xs leading-relaxed whitespace-pre-wrap shadow-inner border border-slate-800">
                                            {sourceBackup.rawInput}
                                        </div>
                                        <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-xs text-yellow-800 flex items-start gap-2">
                                            <i className="fas fa-info-circle mt-0.5"></i>
                                            <p>This entry was parsed from the raw text above. Splitting this entry will clone this source reference to the new items.</p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center p-10 border-2 border-dashed border-slate-200 rounded-xl">
                                        <i className="fas fa-keyboard text-3xl text-slate-200 mb-2"></i>
                                        <p className="text-slate-400 text-sm">Manual Entry (No Source Backup)</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'history' && (
                            <div className="space-y-4 relative pl-4 border-l border-slate-100 ml-2">
                                {!item.editHistory || item.editHistory.length === 0 ? (
                                    <div className="text-slate-400 text-xs italic">No edits recorded.</div>
                                ) : (
                                    [...item.editHistory].reverse().map((log, i) => (
                                        <div key={i} className="relative">
                                            <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 bg-white border-2 border-indigo-400 rounded-full"></div>
                                            <div className="text-[10px] text-slate-400 mb-1">
                                                {new Date(log.timestamp).toLocaleString()} • <span className="font-bold text-slate-600">{log.user}</span>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded border border-slate-100 text-xs">
                                                <span className="font-bold text-slate-500 uppercase text-[10px]">{log.field}</span>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-red-400 line-through bg-red-50 px-1 rounded">{log.oldValue || '∅'}</span>
                                                    <i className="fas fa-arrow-right text-slate-300 text-[10px]"></i>
                                                    <span className="text-green-600 bg-green-50 px-1 rounded font-medium">{log.newValue}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};
