
import React, { useState, useEffect } from 'react';
import { ProjectSettings, DailyReport, QuantityEntry, ItemTypeDefinition, SystemCheckpoint } from '../types';
import { LOCATION_HIERARCHY, ITEM_PATTERNS } from '../utils/constants';
import { createSystemCheckpoint, getCheckpoints, restoreSystemCheckpoint } from '../services/firebaseService';

interface ProjectSettingsProps {
  currentSettings: ProjectSettings | null;
  onSave: (settings: ProjectSettings) => void;
  reports: DailyReport[];
  quantities: QuantityEntry[];
  user: any;
}

export const ProjectSettingsView: React.FC<ProjectSettingsProps> = ({ currentSettings, onSave, reports, quantities, user }) => {
  const [activeTab, setActiveTab] = useState<'config' | 'snapshots'>('config');
  
  // Config State
  const [hierarchy, setHierarchy] = useState(currentSettings?.locationHierarchy || LOCATION_HIERARCHY);
  const [projName, setProjName] = useState(currentSettings?.projectName || 'Bhotekoshi Hydroelectric Project');
  const [compName, setCompName] = useState(currentSettings?.companyName || '');
  const [itemTypes, setItemTypes] = useState<ItemTypeDefinition[]>(currentSettings?.itemTypes || ITEM_PATTERNS.map(p => ({
      name: p.name,
      pattern: p.pattern.toString().slice(1, -2),
      defaultUnit: p.defaultUnit
  })));

  const [snapshots, setSnapshots] = useState<SystemCheckpoint[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  // --- CONFIG HANDLERS ---
  const [newLocName, setNewLocName] = useState('');
  const [newCompLoc, setNewCompLoc] = useState('');
  const [newCompName, setNewCompName] = useState('');
  
  const [newItemName, setNewItemName] = useState('');
  const [newItemPattern, setNewItemPattern] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('m3');

  const handleSave = () => {
    onSave({
        projectName: projName,
        companyName: compName,
        projectDescription: 'Construction Management',
        locationHierarchy: hierarchy,
        itemTypes: itemTypes
    });
    alert("Settings saved successfully.");
  };

  const addLocation = () => {
      if(newLocName && !hierarchy[newLocName]) {
          setHierarchy({ ...hierarchy, [newLocName]: [] });
          setNewLocName('');
      }
  };

  const deleteLocation = (loc: string) => {
      if(window.confirm(`Delete ${loc}? All components under it will be removed.`)) {
        const newHierarchy = { ...hierarchy };
        delete newHierarchy[loc];
        setHierarchy(newHierarchy);
      }
  };

  const addComponent = () => {
      if(newCompLoc && newCompName) {
          setHierarchy(prev => ({
              ...prev,
              [newCompLoc]: [...(prev[newCompLoc] || []), newCompName]
          }));
          setNewCompName('');
      }
  };

  const addItemType = () => {
      if (!newItemName) return;
      setItemTypes([...itemTypes, { 
        name: newItemName, 
        pattern: newItemPattern || newItemName, 
        defaultUnit: newItemUnit 
      }]);
      setNewItemName('');
      setNewItemPattern('');
  };

  const deleteItemType = (index: number) => {
      setItemTypes(itemTypes.filter((_, i) => i !== index));
  };

  // --- SNAPSHOT HANDLERS ---
  const loadSnapshots = async () => {
      setLoadingSnapshots(true);
      try {
          const data = await getCheckpoints();
          setSnapshots(data);
      } catch (e) { console.error(e); }
      setLoadingSnapshots(false);
  };

  useEffect(() => {
      if (activeTab === 'snapshots') loadSnapshots();
  }, [activeTab]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
        <div className="flex justify-between items-center border-b border-slate-200 pb-4">
            <div>
                <h2 className="text-3xl font-bold text-slate-800">System Management</h2>
                <p className="text-sm text-slate-500">Project settings and recovery snapshots.</p>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl">
                <button onClick={() => setActiveTab('config')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'config' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Configuration</button>
                <button onClick={() => setActiveTab('snapshots')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'snapshots' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Snapshots</button>
            </div>
        </div>

        {activeTab === 'config' && (
            <div className="space-y-8">
                <div className="flex justify-end">
                    <button onClick={handleSave} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 hover:bg-black transition-all">
                        <i className="fas fa-save"></i> Save All Settings
                    </button>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><i className="fas fa-info-circle text-indigo-500"></i> Project Details</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Project Name</label>
                            <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold" value={projName} onChange={e => setProjName(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Company Name</label>
                            <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold" value={compName} placeholder="e.g. Acme Construction Corp" onChange={e => setCompName(e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><i className="fas fa-sitemap text-indigo-500"></i> Site Hierarchy</h3>
                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Locations */}
                        <div className="space-y-4">
                            <h4 className="font-bold text-indigo-600 text-xs uppercase tracking-wider">1. Main Locations</h4>
                            <div className="flex gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <input className="flex-1 p-2 bg-transparent text-sm font-bold outline-none" placeholder="Add new location..." value={newLocName} onChange={e => setNewLocName(e.target.value)} />
                                <button onClick={addLocation} className="bg-indigo-600 text-white px-4 rounded-lg font-bold text-xs">Add</button>
                            </div>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                                {Object.keys(hierarchy).map(loc => (
                                    <div key={loc} className="p-3 bg-white border border-slate-100 rounded-lg flex justify-between items-center group">
                                        <span className="text-sm font-bold text-slate-700">{loc}</span>
                                        <button onClick={() => deleteLocation(loc)} className="text-slate-300 hover:text-red-500 transition-colors"><i className="fas fa-trash-alt text-xs"></i></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Components */}
                        <div className="space-y-4">
                            <h4 className="font-bold text-indigo-600 text-xs uppercase tracking-wider">2. Components Management</h4>
                            <select className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold bg-slate-50" value={newCompLoc} onChange={e => setNewCompLoc(e.target.value)}>
                                <option value="">Select Parent Location...</option>
                                {Object.keys(hierarchy).map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                            <div className="flex gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <input className="flex-1 p-2 bg-transparent text-sm font-bold outline-none" placeholder="New component name..." value={newCompName} onChange={e => setNewCompName(e.target.value)} />
                                <button onClick={addComponent} className="bg-indigo-600 text-white px-4 rounded-lg font-bold text-xs">Add</button>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl text-xs text-slate-500 border border-slate-100">
                                {newCompLoc ? `${hierarchy[newCompLoc]?.length || 0} components currently defined for ${newCompLoc}` : 'Select a location to view counts'}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><i className="fas fa-tags text-indigo-500"></i> Work Item Types (AI Definitions)</h3>
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="md:col-span-1 space-y-4 bg-slate-50 p-6 rounded-xl border border-slate-200">
                            <h4 className="font-bold text-indigo-600 text-xs uppercase tracking-wider">Add New Type</h4>
                            <div className="space-y-3">
                                <input className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-bold" placeholder="Item Name (e.g. C30 Concrete)" value={newItemName} onChange={e => setNewItemName(e.target.value)} />
                                <input className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-mono" placeholder="Keyword Pattern (e.g. shotcrete)" value={newItemPattern} onChange={e => setNewItemPattern(e.target.value)} />
                                <select className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-bold" value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)}>
                                    <option value="m3">m3</option>
                                    <option value="m2">m2</option>
                                    <option value="Ton">Ton</option>
                                    <option value="nos">nos</option>
                                </select>
                                <button onClick={addItemType} className="w-full bg-slate-900 text-white p-3 rounded-lg font-bold text-xs">Add Work Type</button>
                            </div>
                        </div>
                        <div className="md:col-span-2">
                             <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2">
                                {itemTypes.map((type, i) => (
                                    <div key={i} className="p-4 bg-white border border-slate-100 rounded-xl flex justify-between items-center group hover:border-indigo-200 transition-colors">
                                        <div>
                                            <div className="text-sm font-bold text-slate-800">{type.name}</div>
                                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">{type.pattern} • {type.defaultUnit}</div>
                                        </div>
                                        <button onClick={() => deleteItemType(i)} className="text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><i className="fas fa-times"></i></button>
                                    </div>
                                ))}
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'snapshots' && (
            <div className="bg-white p-8 rounded-2xl border border-slate-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-800">System Snapshots</h3>
                    <button 
                      onClick={() => createSystemCheckpoint(user?.displayName || 'Admin').then(loadSnapshots)}
                      className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2"
                    >
                        <i className="fas fa-camera"></i> Create Snapshot
                    </button>
                </div>
                {/* Snapshot list rendering here */}
                <div className="text-center text-slate-400 p-10 italic">Snapshot management is active. Use with caution during data migrations.</div>
            </div>
        )}
    </div>
  );
};
