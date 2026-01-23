
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
        companyName: compName,
        projectDescription: 'Construction Management',
        locationHierarchy: hierarchy,
        itemTypes: itemTypes
    });
  };

  const addLocation = () => {
      if(newLocName && !hierarchy[newLocName]) {
          setHierarchy({ ...hierarchy, [newLocName]: [] });
          setNewLocName('');
      }
  };

  const deleteLocation = (loc: string) => {
      const newHierarchy = { ...hierarchy };
      delete newHierarchy[loc];
      setHierarchy(newHierarchy);
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
      setItemTypes([...itemTypes, { name: newItemName, pattern: newItemPattern || newItemName, defaultUnit: newItemUnit }]);
      setNewItemName('');
      setNewItemPattern('');
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
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20">
        <div className="flex justify-between items-center border-b border-slate-200 pb-4">
            <div>
                <h2 className="text-3xl font-bold text-slate-800">System Management</h2>
                <p className="text-sm text-slate-500">Project settings and recovery.</p>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl">
                <button onClick={() => setActiveTab('config')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'config' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Configuration</button>
                <button onClick={() => setActiveTab('snapshots')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'snapshots' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Snapshots</button>
            </div>
        </div>

        {activeTab === 'config' && (
            <>
                <div className="flex justify-end">
                    <button onClick={handleSave} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2"><i className="fas fa-save"></i> Save Settings</button>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><i className="fas fa-info-circle text-indigo-500"></i> Project Details</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Project Name</label>
                            <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium" value={projName} onChange={e => setProjName(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Company Name</label>
                            <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium" value={compName} placeholder="e.g. Acme Construction Corp" onChange={e => setCompName(e.target.value)} />
                        </div>
                    </div>
                </div>

                {/* Hierarchy and Items sections remain similar but with updated layouts as per requirement */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><i className="fas fa-sitemap text-indigo-500"></i> Site Hierarchy</h3>
                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Locations */}
                        <div className="space-y-4">
                            <h4 className="font-bold text-indigo-600 text-sm uppercase tracking-wider">1. Main Locations</h4>
                            <div className="flex gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <input className="flex-1 p-2 bg-transparent text-sm outline-none" placeholder="New Location..." value={newLocName} onChange={e => setNewLocName(e.target.value)} />
                                <button onClick={addLocation} className="bg-white text-indigo-600 px-4 rounded-lg font-bold text-xs border border-slate-200">Add</button>
                            </div>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                                {Object.keys(hierarchy).map(loc => (
                                    <div key={loc} className="p-3 bg-white border border-slate-100 rounded-lg flex justify-between items-center group">
                                        <span className="text-sm font-bold text-slate-700">{loc}</span>
                                        <button onClick={() => deleteLocation(loc)} className="text-slate-300 hover:text-red-500"><i className="fas fa-trash-alt text-xs"></i></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Components */}
                        <div className="space-y-4">
                            <h4 className="font-bold text-indigo-600 text-sm uppercase tracking-wider">2. Components Management</h4>
                            <select className="w-full p-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50" value={newCompLoc} onChange={e => setNewCompLoc(e.target.value)}>
                                <option value="">Select Location...</option>
                                {Object.keys(hierarchy).map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                            <div className="flex gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <input className="flex-1 p-2 bg-transparent text-sm outline-none" placeholder="New Component..." value={newCompName} onChange={e => setNewCompName(e.target.value)} />
                                <button onClick={addComponent} className="bg-white text-indigo-600 px-4 rounded-lg font-bold text-xs border border-slate-200">Add</button>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        )}
    </div>
  );
};
