
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
  const [itemTypes, setItemTypes] = useState<ItemTypeDefinition[]>(currentSettings?.itemTypes || ITEM_PATTERNS.map(p => ({
      name: p.name,
      pattern: p.pattern.toString().slice(1, -2),
      defaultUnit: p.defaultUnit
  })));

  // Snapshot State
  const [snapshots, setSnapshots] = useState<SystemCheckpoint[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);

  // --- CONFIG HANDLERS ---
  const [newLocName, setNewLocName] = useState('');
  const [newCompLoc, setNewCompLoc] = useState('');
  const [newCompName, setNewCompName] = useState('');
  
  const [newItemName, setNewItemName] = useState('');
  const [newItemPattern, setNewItemPattern] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('m3');

  const [editingLoc, setEditingLoc] = useState<string | null>(null);
  const [editLocName, setEditLocName] = useState('');

  const [editingComp, setEditingComp] = useState<{loc: string, index: number} | null>(null);
  const [editCompName, setEditCompName] = useState('');

  const handleSave = () => {
    onSave({
        projectName: projName,
        projectDescription: 'Construction Management',
        locationHierarchy: hierarchy,
        itemTypes: itemTypes
    });
    alert("Project Settings Updated Successfully!");
  };

  const checkUsage = (type: 'location' | 'component' | 'itemType', value: string, parentLoc?: string) => {
    if (type === 'location') {
        const inReports = reports.some(r => r.entries.some(e => e.location === value));
        const inLedger = quantities.some(q => q.location === value);
        return inReports || inLedger;
    }
    if (type === 'component') {
        const inReports = reports.some(r => r.entries.some(e => e.location === parentLoc && e.component === value));
        const inLedger = quantities.some(q => q.location === parentLoc && q.structure === value);
        return inReports || inLedger;
    }
    if (type === 'itemType') {
        return quantities.some(q => q.itemType === value);
    }
    return false;
  };

  const addLocation = () => {
      if(newLocName && !hierarchy[newLocName]) {
          setHierarchy({ ...hierarchy, [newLocName]: [] });
          setNewLocName('');
      }
  };

  const deleteLocation = (loc: string) => {
      if (checkUsage('location', loc)) {
          if (!confirm(`WARNING: Location "${loc}" is currently used in existing reports or ledger entries. Deleting it might cause data to show as "Needs Fix". Proceed anyway?`)) return;
      } else {
          if (!confirm(`Delete Location "${loc}"?`)) return;
      }
      const newHierarchy = { ...hierarchy };
      delete newHierarchy[loc];
      setHierarchy(newHierarchy);
  };

  const startEditLoc = (loc: string) => {
      setEditingLoc(loc);
      setEditLocName(loc);
  };

  const saveEditLoc = (oldLoc: string) => {
      if (!editLocName || oldLoc === editLocName) {
          setEditingLoc(null);
          return;
      }
      const newHierarchy = { ...hierarchy };
      newHierarchy[editLocName] = newHierarchy[oldLoc];
      delete newHierarchy[oldLoc];
      setHierarchy(newHierarchy);
      setEditingLoc(null);
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

  const deleteComponent = (loc: string, comp: string) => {
      if (checkUsage('component', comp, loc)) {
          if (!confirm(`WARNING: Component "${comp}" is currently used in existing records. Proceed?`)) return;
      } else {
          if (!confirm(`Delete Component "${comp}"?`)) return;
      }
      setHierarchy(prev => ({
          ...prev,
          [loc]: prev[loc].filter(c => c !== comp)
      }));
  };

  const startEditComp = (loc: string, comp: string, index: number) => {
      setEditingComp({ loc, index });
      setEditCompName(comp);
  };

  const saveEditComp = (loc: string, index: number) => {
      if (!editCompName) {
          setEditingComp(null);
          return;
      }
      setHierarchy(prev => {
          const newList = [...prev[loc]];
          newList[index] = editCompName;
          return { ...prev, [loc]: newList };
      });
      setEditingComp(null);
  };

  const addItemType = () => {
      if (!newItemName) return;
      setItemTypes([...itemTypes, { name: newItemName, pattern: newItemPattern || newItemName, defaultUnit: newItemUnit }]);
      setNewItemName('');
      setNewItemPattern('');
  };

  const deleteItemType = (name: string) => {
      if (checkUsage('itemType', name)) {
          if (!confirm(`WARNING: Item Type "${name}" has recorded quantities. Deleting it will keep data but disconnect the auto-parsing. Proceed?`)) return;
      } else {
          if (!confirm(`Delete Item Type "${name}"?`)) return;
      }
      setItemTypes(itemTypes.filter(it => it.name !== name));
  };

  // --- SNAPSHOT HANDLERS ---
  const loadSnapshots = async () => {
      setLoadingSnapshots(true);
      try {
          const data = await getCheckpoints();
          setSnapshots(data);
      } catch (e) {
          console.error(e);
      }
      setLoadingSnapshots(false);
  };

  useEffect(() => {
      if (activeTab === 'snapshots') {
          loadSnapshots();
      }
  }, [activeTab]);

  const handleCreateSnapshot = async () => {
      if(!confirm("Create a full system checkpoint? This saves the current state of Reports, Quantities, Lining, and Settings.")) return;
      
      setCreatingSnapshot(true);
      try {
          await createSystemCheckpoint(user?.displayName || 'System');
          await loadSnapshots(); // Refresh
          alert("Checkpoint Created Successfully.");
      } catch (e) {
          alert("Failed to create checkpoint.");
      }
      setCreatingSnapshot(false);
  };

  const handleRestoreSnapshot = async (cp: SystemCheckpoint) => {
      const confirmation = prompt(`WARNING: You are about to restore the system state to "${cp.name}" (${new Date(cp.timestamp).toLocaleString()}).\n\nALL DATA created after this point will be overwritten.\n\nType "RESTORE" to confirm:`);
      
      if (confirmation === 'RESTORE') {
          try {
              await restoreSystemCheckpoint(cp);
              alert("System Restored. Reloading...");
              window.location.reload();
          } catch(e) {
              alert("Restore Failed. Please check console.");
              console.error(e);
          }
      }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20">
        <div className="flex justify-between items-center border-b border-slate-200 pb-4">
            <div>
                <h2 className="text-3xl font-bold text-slate-800">System Management</h2>
                <p className="text-sm text-slate-500">Configure project details and manage data snapshots.</p>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-xl">
                <button 
                    onClick={() => setActiveTab('config')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'config' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
                >
                    Configuration
                </button>
                <button 
                    onClick={() => setActiveTab('snapshots')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'snapshots' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
                >
                    Snapshots & Restore
                </button>
            </div>
        </div>

        {activeTab === 'config' && (
            <>
                <div className="flex justify-end">
                    <button onClick={handleSave} className="bg-slate-900 hover:bg-black text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-slate-200 transition-all transform hover:-translate-y-0.5 flex items-center gap-2">
                        <i className="fas fa-save"></i> Save Settings
                    </button>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <i className="fas fa-info-circle text-indigo-500"></i> Project Details
                    </h3>
                    <div className="grid gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Project Name</label>
                            <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium" value={projName} onChange={e => setProjName(e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <i className="fas fa-sitemap text-indigo-500"></i> Site Hierarchy
                    </h3>

                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Locations */}
                        <div className="space-y-4">
                            <h4 className="font-bold text-indigo-600 text-sm uppercase tracking-wider flex justify-between">
                                <span>1. Main Locations</span>
                                <span className="text-slate-400 font-normal normal-case">{Object.keys(hierarchy).length} Total</span>
                            </h4>
                            <div className="flex gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <input className="flex-1 p-2 bg-transparent text-sm focus:outline-none" placeholder="New Location..." value={newLocName} onChange={e => setNewLocName(e.target.value)} />
                                <button onClick={addLocation} className="bg-white text-indigo-600 px-4 rounded-lg font-bold text-xs shadow-sm border border-slate-200 hover:bg-indigo-50">Add</button>
                            </div>
                            <ul className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {Object.keys(hierarchy).map(loc => (
                                    <li key={loc} className={`p-3 rounded-xl border transition-all flex justify-between items-center group ${editingLoc === loc ? 'border-indigo-400 bg-indigo-50' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                                        {editingLoc === loc ? (
                                            <input autoFocus className="bg-transparent text-sm font-bold w-full outline-none" value={editLocName} onChange={e => setEditLocName(e.target.value)} onBlur={() => saveEditLoc(loc)} onKeyDown={e => e.key === 'Enter' && saveEditLoc(loc)} />
                                        ) : (
                                            <div className="flex-1">
                                                <span className="text-sm font-bold text-slate-700">{loc}</span>
                                                <span className="ml-2 text-[10px] text-slate-400 uppercase">{(hierarchy[loc] || []).length} Components</span>
                                            </div>
                                        )}
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => startEditLoc(loc)} className="text-slate-400 hover:text-blue-500"><i className="fas fa-pen text-xs"></i></button>
                                            <button onClick={() => deleteLocation(loc)} className="text-slate-400 hover:text-red-500"><i className="fas fa-trash-alt text-xs"></i></button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Components */}
                        <div className="space-y-4">
                            <h4 className="font-bold text-indigo-600 text-sm uppercase tracking-wider">2. Components Management</h4>
                            <div className="flex flex-col gap-2">
                                <select className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-medium bg-slate-50" value={newCompLoc} onChange={e => setNewCompLoc(e.target.value)}>
                                    <option value="">Select Location...</option>
                                    {Object.keys(hierarchy).map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                                <div className="flex gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                    <input className="flex-1 p-2 bg-transparent text-sm focus:outline-none" placeholder="New Component Name..." value={newCompName} onChange={e => setNewCompName(e.target.value)} />
                                    <button onClick={addComponent} disabled={!newCompLoc} className="bg-white text-indigo-600 px-4 rounded-lg font-bold text-xs shadow-sm border border-slate-200 hover:bg-indigo-50 disabled:opacity-50">Add</button>
                                </div>
                            </div>
                            <div className="bg-slate-50/50 rounded-2xl p-4 min-h-[300px] border border-dashed border-slate-200">
                                {newCompLoc ? (
                                    <ul className="space-y-2">
                                        {hierarchy[newCompLoc]?.map((c, i) => (
                                            <li key={i} className="flex justify-between items-center p-2.5 bg-white rounded-lg shadow-sm border border-slate-100 group">
                                                {editingComp?.loc === newCompLoc && editingComp?.index === i ? (
                                                    <input autoFocus className="bg-transparent text-sm font-medium w-full outline-none" value={editCompName} onChange={e => setEditCompName(e.target.value)} onBlur={() => saveEditComp(newCompLoc, i)} onKeyDown={e => e.key === 'Enter' && saveEditComp(newCompLoc, i)} />
                                                ) : (
                                                    <span className="text-sm text-slate-600">{c}</span>
                                                )}
                                                <div className="flex gap-3 opacity-0 group-hover:opacity-100">
                                                    <button onClick={() => startEditComp(newCompLoc, c, i)} className="text-slate-300 hover:text-blue-500"><i className="fas fa-edit text-xs"></i></button>
                                                    <button onClick={() => deleteComponent(newCompLoc, c)} className="text-slate-300 hover:text-red-500"><i className="fas fa-times text-xs"></i></button>
                                                </div>
                                            </li>
                                        ))}
                                        {hierarchy[newCompLoc]?.length === 0 && <li className="text-xs italic text-slate-400 text-center py-10">No components in this location.</li>}
                                    </ul>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
                                        <i className="fas fa-mouse-pointer text-2xl mb-2 opacity-20"></i>
                                        <p className="text-xs">Select a location to manage its structures.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                        <i className="fas fa-tags text-indigo-500"></i> Work Item Types
                    </h3>
                    <p className="text-sm text-slate-500 mb-6">These items are used for automatic quantity tracking and drop-down menus.</p>

                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Item Name</label>
                            <input className="w-full p-2 border rounded-lg text-sm" placeholder="e.g. C25 Concrete" value={newItemName} onChange={e => setNewItemName(e.target.value)} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Search Pattern (Regex/Text)</label>
                            <input className="w-full p-2 border rounded-lg text-sm" placeholder="e.g. concrete|conc" value={newItemPattern} onChange={e => setNewItemPattern(e.target.value)} />
                        </div>
                        <div className="md:col-span-1 flex items-end gap-2">
                            <div className="flex-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Unit</label>
                                <select className="w-full p-2 border rounded-lg text-sm" value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)}>
                                    <option value="m3">m3</option>
                                    <option value="m2">m2</option>
                                    <option value="Ton">Ton</option>
                                    <option value="nos">nos</option>
                                    <option value="rm">rm</option>
                                </select>
                            </div>
                            <button onClick={addItemType} className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-bold text-xs h-[38px]">Add</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {itemTypes.map(item => (
                            <div key={item.name} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col justify-between group relative">
                                <button onClick={() => deleteItemType(item.name)} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <i className="fas fa-trash-alt text-[10px]"></i>
                                </button>
                                <div>
                                    <div className="text-sm font-bold text-slate-800 mb-1">{item.name}</div>
                                    <div className="text-[10px] font-mono text-slate-400 truncate" title={item.pattern}>Pattern: {item.pattern}</div>
                                </div>
                                <div className="mt-2 flex justify-between items-center">
                                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded uppercase">{item.defaultUnit}</span>
                                    {checkUsage('itemType', item.name) && <span className="text-[10px] text-emerald-500 font-bold"><i className="fas fa-check-double"></i> Active</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </>
        )}

        {activeTab === 'snapshots' && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 min-h-[600px] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <i className="fas fa-history text-indigo-500"></i> System Checkpoints
                        </h3>
                        <p className="text-sm text-slate-500">Create daily snapshots or restore to a previous state.</p>
                    </div>
                    <button 
                        onClick={handleCreateSnapshot}
                        disabled={creatingSnapshot}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
                    >
                        {creatingSnapshot ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-camera"></i>}
                        Create Checkpoint
                    </button>
                </div>

                <div className="flex-1 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                    <div className="grid grid-cols-5 bg-white p-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <div className="col-span-2">Checkpoint Name</div>
                        <div>Timestamp</div>
                        <div>Created By</div>
                        <div className="text-right">Action</div>
                    </div>
                    
                    {loadingSnapshots ? (
                        <div className="p-10 text-center text-slate-400">Loading snapshots...</div>
                    ) : snapshots.length === 0 ? (
                        <div className="p-10 text-center text-slate-400">No checkpoints found.</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {snapshots.map(cp => (
                                <div key={cp.id} className="grid grid-cols-5 p-4 items-center hover:bg-white transition-colors">
                                    <div className="col-span-2 font-bold text-slate-700 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                                            <i className="fas fa-archive"></i>
                                        </div>
                                        {cp.name}
                                    </div>
                                    <div className="text-sm text-slate-500 font-mono">{new Date(cp.timestamp).toLocaleString()}</div>
                                    <div className="text-sm text-slate-500">{cp.createdBy}</div>
                                    <div className="text-right">
                                        <button 
                                            onClick={() => handleRestoreSnapshot(cp)}
                                            className="text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-200 hover:border-indigo-400 transition-all"
                                        >
                                            <i className="fas fa-undo-alt mr-1"></i> Restore
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}

        <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 4px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        `}</style>
    </div>
  );
};
