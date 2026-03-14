
import React, { useState, useEffect } from 'react';
import { ProjectSettings, DailyReport, QuantityEntry, ItemTypeDefinition, SystemCheckpoint, TrainingExample, SubContractor } from '../types';
import { LOCATION_HIERARCHY, ITEM_PATTERNS } from '../utils/constants';
import { createSystemCheckpoint, getCheckpoints, restoreSystemCheckpoint, saveTrainingExample, deleteTrainingExample, subscribeToTrainingExamples, exportAllData, subscribeToSubContractors, saveSubContractor, deleteSubContractor } from '../services/firebaseService';

interface ProjectSettingsProps {
  currentSettings: ProjectSettings | null;
  onSave: (settings: ProjectSettings) => void;
  reports: DailyReport[];
  quantities: QuantityEntry[];
  user: any;
}

export const ProjectSettingsView: React.FC<ProjectSettingsProps> = ({ currentSettings, onSave, reports, quantities, user }) => {
  const [activeTab, setActiveTab] = useState<'config' | 'snapshots' | 'training' | 'subcontractors'>('config');
  
  // Config State
  const [hierarchy, setHierarchy] = useState(currentSettings?.locationHierarchy || LOCATION_HIERARCHY);
  const [projName, setProjName] = useState(currentSettings?.projectName || 'Bhotekoshi Hydroelectric Project');
  const [compName, setCompName] = useState(currentSettings?.companyName || '');
  const [itemTypes, setItemTypes] = useState<ItemTypeDefinition[]>(currentSettings?.itemTypes || ITEM_PATTERNS.map(p => ({
      name: p.name,
      pattern: p.pattern.toString().slice(1, -2),
      defaultUnit: p.defaultUnit,
      description: ''
  })));

  const [snapshots, setSnapshots] = useState<SystemCheckpoint[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Training State
  const [trainingExamples, setTrainingExamples] = useState<TrainingExample[]>([]);
  const [newExRaw, setNewExRaw] = useState('');
  const [newExExpected, setNewExExpected] = useState('');
  const [newExCategory, setNewExCategory] = useState<'location' | 'quantity' | 'general'>('general');

  // Subcontractor State
  const [subcontractors, setSubcontractors] = useState<SubContractor[]>([]);
  const [newScName, setNewScName] = useState('');
  const [selectedScId, setSelectedScId] = useState<string | null>(null);

  // --- CONFIG HANDLERS ---
  const [newLocName, setNewLocName] = useState('');
  const [newCompLoc, setNewCompLoc] = useState('');
  const [newCompName, setNewCompName] = useState('');
  
  const [newItemName, setNewItemName] = useState('');
  const [newItemPattern, setNewItemPattern] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('m3');
  const [newItemDesc, setNewItemDesc] = useState('');

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
          if (hierarchy[newCompLoc].includes(newCompName)) {
              alert("Component already exists.");
              return;
          }
          setHierarchy(prev => ({
              ...prev,
              [newCompLoc]: [...(prev[newCompLoc] || []), newCompName]
          }));
          setNewCompName('');
      }
  };

  const deleteComponent = (loc: string, comp: string) => {
      if (window.confirm(`Remove component "${comp}" from "${loc}"?`)) {
          setHierarchy(prev => ({
              ...prev,
              [loc]: prev[loc].filter(c => c !== comp)
          }));
      }
  };

  const addItemType = () => {
      if (!newItemName) return;
      setItemTypes([...itemTypes, { 
        name: newItemName, 
        pattern: newItemPattern || newItemName, 
        defaultUnit: newItemUnit,
        description: newItemDesc
      }]);
      setNewItemName('');
      setNewItemPattern('');
      setNewItemDesc('');
  };

  const deleteItemType = (index: number) => {
      if (window.confirm("Delete this item type?")) {
        setItemTypes(itemTypes.filter((_, i) => i !== index));
      }
  };

  // --- TRAINING HANDLERS ---
  useEffect(() => {
    if (activeTab === 'training') {
        const unsub = subscribeToTrainingExamples(setTrainingExamples);
        return () => unsub();
    }
  }, [activeTab]);

  const handleAddTrainingExample = async () => {
      if (!newExRaw || !newExExpected) return;
      try {
          // Validate JSON
          JSON.parse(newExExpected);
          await saveTrainingExample({
              id: crypto.randomUUID(),
              rawInput: newExRaw,
              expectedOutput: newExExpected,
              category: newExCategory,
              createdAt: new Date().toISOString()
          });
          setNewExRaw('');
          setNewExExpected('');
      } catch (e) {
          alert("Expected output must be valid JSON.");
      }
  };

  // --- SUBCONTRACTOR HANDLERS ---
  useEffect(() => {
    if (activeTab === 'subcontractors') {
        const unsub = subscribeToSubContractors(setSubcontractors);
        return () => unsub();
    }
  }, [activeTab]);

  const handleAddSc = async () => {
      if (!newScName) return;
      await saveSubContractor({
          id: crypto.randomUUID(),
          name: newScName,
          assignedComponents: [],
          rates: {},
          createdAt: new Date().toISOString()
      });
      setNewScName('');
  };

  const handleUpdateSc = async (sc: SubContractor) => {
      await saveSubContractor(sc);
  };

  const handleDeleteSc = async (id: string) => {
      if (window.confirm("Delete this sub-contractor?")) {
          await deleteSubContractor(id);
          if (selectedScId === id) setSelectedScId(null);
      }
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

  const handleExportDatabase = async () => {
    setIsExporting(true);
    try {
        const data = await exportAllData();
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DPR_FULL_DATABASE_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error(e);
        alert("Export failed: " + (e as any).message);
    } finally {
        setIsExporting(false);
    }
  };

  useEffect(() => {
      if (activeTab === 'snapshots') loadSnapshots();
  }, [activeTab]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
        <div className="flex justify-between items-center border-b border-slate-200 pb-4">
            <div>
                <h2 className="text-3xl font-bold text-slate-800 tracking-tight uppercase">System Management</h2>
                <p className="text-sm text-slate-500 font-medium">Project settings, AI training, and recovery snapshots.</p>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl">
                <button onClick={() => setActiveTab('config')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'config' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Configuration</button>
                <button onClick={() => setActiveTab('subcontractors')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'subcontractors' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Sub-Contractors</button>
                <button onClick={() => setActiveTab('training')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'training' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>AI Training</button>
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
                        <div className="space-y-4">
                            <h4 className="font-bold text-indigo-600 text-xs uppercase tracking-wider">1. Main Locations</h4>
                            <div className="flex gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <input className="flex-1 p-2 bg-transparent text-sm font-bold outline-none" placeholder="Add new location..." value={newLocName} onChange={e => setNewLocName(e.target.value)} />
                                <button onClick={addLocation} className="bg-indigo-600 text-white px-4 rounded-lg font-bold text-xs">Add</button>
                            </div>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                {Object.keys(hierarchy).map(loc => (
                                    <div key={loc} className="p-3 bg-white border border-slate-100 rounded-lg flex justify-between items-center group">
                                        <span className="text-sm font-bold text-slate-700">{loc}</span>
                                        <button onClick={() => deleteLocation(loc)} className="text-slate-300 hover:text-red-500 transition-colors"><i className="fas fa-trash-alt text-xs"></i></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h4 className="font-bold text-indigo-600 text-xs uppercase tracking-wider">2. Components Management</h4>
                            <select className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold bg-slate-50" value={newCompLoc} onChange={e => setNewCompLoc(e.target.value)}>
                                <option value="">Select Parent Location...</option>
                                {Object.keys(hierarchy).map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                            
                            {newCompLoc && (
                                <>
                                    <div className="flex gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                        <input className="flex-1 p-2 bg-transparent text-sm font-bold outline-none" placeholder="New component name..." value={newCompName} onChange={e => setNewCompName(e.target.value)} />
                                        <button onClick={addComponent} className="bg-indigo-600 text-white px-4 rounded-lg font-bold text-xs">Add</button>
                                    </div>
                                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 mt-4">
                                        {hierarchy[newCompLoc].length === 0 ? (
                                            <div className="text-center text-slate-400 py-4 italic text-sm">No components defined yet.</div>
                                        ) : hierarchy[newCompLoc].map(comp => (
                                            <div key={comp} className="p-2.5 bg-white border border-slate-100 rounded-lg flex justify-between items-center group">
                                                <span className="text-sm font-medium text-slate-700">{comp}</span>
                                                <button onClick={() => deleteComponent(newCompLoc, comp)} className="text-slate-300 hover:text-red-500 transition-colors"><i className="fas fa-trash-alt text-xs"></i></button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-indigo-50 p-3 rounded-xl text-xs text-indigo-600 border border-indigo-100 font-bold">
                                        {hierarchy[newCompLoc].length} components defined for {newCompLoc}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><i className="fas fa-tags text-indigo-500"></i> Construction Item Types</h3>
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h4 className="font-bold text-indigo-600 text-xs uppercase tracking-wider">Add New Item Type</h4>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Display Name</label>
                                    <input className="w-full p-2 border rounded-lg text-sm font-bold" placeholder="e.g. C25 Concrete" value={newItemName} onChange={e => setNewItemName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Regex Pattern (Keywords)</label>
                                    <input className="w-full p-2 border rounded-lg text-sm font-mono" placeholder="e.g. c25|concrete|rcc" value={newItemPattern} onChange={e => setNewItemPattern(e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Default Unit</label>
                                        <select className="w-full p-2 border rounded-lg text-sm font-bold" value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)}>
                                            <option value="m3">m3</option>
                                            <option value="m2">m2</option>
                                            <option value="Ton">Ton</option>
                                            <option value="nos">nos</option>
                                            <option value="rm">rm</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Internal Description</label>
                                    <textarea className="w-full p-2 border rounded-lg text-sm" placeholder="Purpose of this item..." value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} />
                                </div>
                                <button onClick={addItemType} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm">Add Item Type</button>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h4 className="font-bold text-indigo-600 text-xs uppercase tracking-wider">Existing Classifications</h4>
                            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                                {itemTypes.map((type, idx) => (
                                    <div key={idx} className="p-4 bg-white border border-slate-100 rounded-xl hover:shadow-md transition-all group border-l-4 border-l-indigo-500">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h5 className="font-bold text-slate-800 text-sm">{type.name}</h5>
                                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">{type.pattern}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{type.defaultUnit}</span>
                                                <button onClick={() => deleteItemType(idx)} className="text-slate-300 hover:text-red-500 transition-colors"><i className="fas fa-trash-alt text-xs"></i></button>
                                            </div>
                                        </div>
                                        {type.description && <p className="text-xs text-slate-500 mt-2 italic border-t border-slate-50 pt-2">{type.description}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'subcontractors' && (
            <div className="space-y-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <i className="fas fa-users-cog text-indigo-500"></i> Manage Sub-Contractors
                    </h3>
                    
                    <div className="flex gap-4 mb-8">
                        <input 
                            className="flex-1 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold bg-slate-50" 
                            placeholder="New Sub-Contractor Name..." 
                            value={newScName} 
                            onChange={e => setNewScName(e.target.value)} 
                        />
                        <button 
                            onClick={handleAddSc} 
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 rounded-xl font-bold shadow-md transition-all flex items-center gap-2"
                        >
                            <i className="fas fa-plus"></i> Add SC
                        </button>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {/* SC List */}
                        <div className="col-span-1 border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                            <div className="bg-slate-100 p-3 border-b border-slate-200 font-bold text-slate-600 text-sm uppercase tracking-wider">
                                Sub-Contractors
                            </div>
                            <div className="max-h-[500px] overflow-y-auto">
                                {subcontractors.length === 0 ? (
                                    <div className="p-6 text-center text-slate-400 italic text-sm">No sub-contractors added yet.</div>
                                ) : subcontractors.map(sc => (
                                    <div 
                                        key={sc.id} 
                                        onClick={() => setSelectedScId(sc.id)}
                                        className={`p-4 border-b border-slate-100 cursor-pointer transition-all flex justify-between items-center group ${selectedScId === sc.id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'hover:bg-white'}`}
                                    >
                                        <div>
                                            <div className={`font-bold ${selectedScId === sc.id ? 'text-indigo-800' : 'text-slate-700'}`}>{sc.name}</div>
                                            <div className="text-xs text-slate-400 mt-1">{sc.assignedComponents?.length || 0} components assigned</div>
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteSc(sc.id); }}
                                            className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <i className="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* SC Details */}
                        <div className="col-span-2">
                            {selectedScId ? (() => {
                                const sc = subcontractors.find(s => s.id === selectedScId);
                                if (!sc) return null;
                                
                                // Flatten hierarchy for selection
                                const allComponents: string[] = [];
                                Object.entries(hierarchy).forEach(([loc, comps]) => {
                                    if (comps.length === 0) {
                                        allComponents.push(loc);
                                    } else {
                                        comps.forEach(comp => allComponents.push(`${loc} - ${comp}`));
                                    }
                                });

                                const toggleComponent = (compStr: string) => {
                                    const current = sc.assignedComponents || [];
                                    const updated = current.includes(compStr) 
                                        ? current.filter(c => c !== compStr)
                                        : [...current, compStr];
                                    handleUpdateSc({ ...sc, assignedComponents: updated });
                                };

                                const updateRate = (itemType: string, rate: number) => {
                                    const updatedRates = { ...(sc.rates || {}), [itemType]: rate };
                                    handleUpdateSc({ ...sc, rates: updatedRates });
                                };

                                return (
                                    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm h-full flex flex-col">
                                        <h4 className="text-xl font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">
                                            {sc.name} Settings
                                        </h4>
                                        
                                        <div className="space-y-8 flex-1 overflow-y-auto pr-2">
                                            {/* Component Assignment */}
                                            <div>
                                                <h5 className="font-bold text-indigo-600 text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                                                    <i className="fas fa-map-marker-alt"></i> Assigned Components
                                                </h5>
                                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-[250px] overflow-y-auto grid grid-cols-2 gap-2">
                                                    {allComponents.map(compStr => {
                                                        const isAssigned = (sc.assignedComponents || []).includes(compStr);
                                                        return (
                                                            <label key={compStr} className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-all border ${isAssigned ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                                                                <input 
                                                                    type="checkbox" 
                                                                    className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                                    checked={isAssigned}
                                                                    onChange={() => toggleComponent(compStr)}
                                                                />
                                                                <span className={`text-sm font-medium ${isAssigned ? 'text-indigo-900' : 'text-slate-600'}`}>{compStr}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Rates Assignment */}
                                            <div>
                                                <h5 className="font-bold text-emerald-600 text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                                                    <i className="fas fa-tags"></i> Item Rates
                                                </h5>
                                                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                                                    <table className="w-full text-left text-sm">
                                                        <thead className="bg-slate-100 text-slate-500 border-b border-slate-200">
                                                            <tr>
                                                                <th className="p-3 font-bold uppercase tracking-wider">Item Type</th>
                                                                <th className="p-3 font-bold uppercase tracking-wider">Unit</th>
                                                                <th className="p-3 font-bold uppercase tracking-wider w-40">Rate</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {itemTypes.map(type => (
                                                                <tr key={type.name} className="bg-white hover:bg-slate-50 transition-colors">
                                                                    <td className="p-3 font-bold text-slate-700">{type.name}</td>
                                                                    <td className="p-3 text-slate-500 font-medium">{type.defaultUnit}</td>
                                                                    <td className="p-3">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-slate-400 font-bold">Rs.</span>
                                                                            <input 
                                                                                type="number" 
                                                                                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800"
                                                                                value={(sc.rates || {})[type.name] || ''}
                                                                                onChange={e => updateRate(type.name, parseFloat(e.target.value) || 0)}
                                                                                placeholder="0.00"
                                                                            />
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })() : (
                                <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl h-full flex flex-col items-center justify-center text-slate-400 p-10">
                                    <i className="fas fa-hand-pointer text-4xl mb-4 text-slate-300"></i>
                                    <p className="font-medium">Select a sub-contractor from the list to manage assignments and rates.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'training' && (
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <i className="fas fa-graduation-cap text-indigo-500"></i> AI Training & Few-Shot Correction
                    </h3>
                    <p className="text-sm text-slate-500 mb-6">
                        Provide examples of problematic raw text and the correct structured JSON. The AI will use these examples to improve parsing for similar future inputs.
                    </p>
                    
                    <div className="grid md:grid-cols-2 gap-6 mb-6">
                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Raw Input Text</label>
                            <textarea 
                                className="w-full h-32 p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                placeholder='Example: "Rebar works at apron: 0.458 ton"'
                                value={newExRaw}
                                onChange={e => setNewExRaw(e.target.value)}
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Expected JSON Output (Single Item or Array)</label>
                            <textarea 
                                className="w-full h-32 p-3 bg-slate-900 text-green-400 border border-slate-700 rounded-xl font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                placeholder='{"location": "Headworks", "component": "Barrage", "structuralElement": "Apron", "itemType": "Rebar", "quantity": 0.458, "unit": "Ton"}'
                                value={newExExpected}
                                onChange={e => setNewExExpected(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                        <select 
                            className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold outline-none"
                            value={newExCategory}
                            onChange={(e: any) => setNewExCategory(e.target.value)}
                        >
                            <option value="general">General</option>
                            <option value="location">Location Context</option>
                            <option value="quantity">Quantity Accuracy</option>
                        </select>
                        <button 
                            onClick={handleAddTrainingExample}
                            className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-200 flex items-center gap-2"
                        >
                            <i className="fas fa-plus"></i> Save Training Example
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-4 bg-slate-50 border-b border-slate-200">
                        <h4 className="text-sm font-bold text-slate-700 uppercase">Stored Training Knowledge</h4>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {trainingExamples.length === 0 ? (
                            <div className="p-12 text-center text-slate-400 italic">No training examples stored yet.</div>
                        ) : trainingExamples.map(ex => (
                            <div key={ex.id} className="p-6 flex gap-6 hover:bg-slate-50 transition-colors relative group">
                                <div className="flex-1 space-y-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 uppercase">{ex.category}</span>
                                        <span className="text-[10px] text-slate-400 font-medium">{new Date(ex.createdAt).toLocaleString()}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 bg-white border border-slate-100 rounded-lg text-xs font-mono line-clamp-4">
                                            {ex.rawInput}
                                        </div>
                                        <div className="p-3 bg-slate-900 text-green-400 rounded-lg text-xs font-mono line-clamp-4 overflow-hidden">
                                            {ex.expectedOutput}
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => deleteTrainingExample(ex.id)}
                                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all h-fit"
                                >
                                    <i className="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'snapshots' && (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-800">System Snapshots</h3>
                    <button 
                      onClick={() => createSystemCheckpoint(user?.displayName || 'Admin').then(loadSnapshots)}
                      className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-200"
                    >
                        <i className="fas fa-camera"></i> Create Snapshot
                    </button>
                </div>
                <div className="space-y-4">
                    {loadingSnapshots ? (
                        <div className="p-10 text-center"><i className="fas fa-circle-notch fa-spin text-2xl text-slate-300"></i></div>
                    ) : snapshots.length === 0 ? (
                        <div className="text-center text-slate-400 p-10 italic">No snapshots found.</div>
                    ) : snapshots.map(snap => (
                        <div key={snap.id} className="p-4 border border-slate-100 rounded-xl flex justify-between items-center bg-slate-50/50 hover:bg-white transition-all shadow-sm">
                            <div>
                                <div className="font-bold text-slate-800">{snap.name}</div>
                                <div className="text-xs text-slate-400 font-medium">{new Date(snap.timestamp).toLocaleString()} by {snap.createdBy}</div>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => { if(window.confirm("Restore this snapshot? CURRENT DATA WILL BE OVERWRITTEN.")) restoreSystemCheckpoint(snap); }} className="text-xs font-bold bg-white border border-slate-200 px-4 py-2 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors">Restore</button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="border-t border-slate-100 mt-8 pt-6">
                    <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 flex justify-between items-center">
                        <div>
                             <h3 className="text-lg font-bold text-indigo-900">Full Database Export</h3>
                             <p className="text-sm text-indigo-700 mt-1">Download a complete JSON dump of all Firebase collections (Reports, Logs, Config, etc).</p>
                        </div>
                        <button 
                            onClick={handleExportDatabase} 
                            disabled={isExporting}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all disabled:opacity-50"
                        >
                            {isExporting ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-download"></i>}
                            Export Data
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
