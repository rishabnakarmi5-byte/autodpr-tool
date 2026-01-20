
import React, { useState } from 'react';
import { ProjectSettings } from '../types';
import { saveProjectSettings } from '../services/firebaseService';

interface SettingsTabProps {
  settings: ProjectSettings;
  user: any;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ settings, user }) => {
  const [form, setForm] = useState<ProjectSettings>(settings);
  const [newLoc, setNewLoc] = useState('');
  const [newComp, setNewComp] = useState('');
  const [selectedLoc, setSelectedLoc] = useState('');

  const handleSave = async () => {
    await saveProjectSettings(form);
    alert("Settings saved successfully.");
  };

  const addLocation = () => {
    if (!newLoc) return;
    setForm(prev => ({ ...prev, hierarchy: { ...prev.hierarchy, [newLoc]: [] } }));
    setNewLoc('');
  };

  const addComponent = () => {
    if (!newComp || !selectedLoc) return;
    setForm(prev => {
       const comps = prev.hierarchy[selectedLoc] || [];
       return { ...prev, hierarchy: { ...prev.hierarchy, [selectedLoc]: [...comps, newComp] } };
    });
    setNewComp('');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
       <div className="border-b border-slate-200 pb-4 flex justify-between items-center">
          <div><h2 className="text-3xl font-bold">Project Configuration</h2><p className="text-slate-500">Global site hierarchy and item definitions.</p></div>
          <button onClick={handleSave} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">Save Changes</button>
       </div>

       <section className="bg-white p-6 rounded-2xl shadow border space-y-4">
          <h3 className="font-bold border-b pb-2">1. Project Metadata</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div><label className="text-[10px] font-bold text-slate-400 uppercase">Project Name</label><input className="w-full p-3 border rounded-xl" value={form.projectName} onChange={e => setForm({...form, projectName: e.target.value})} /></div>
             <div><label className="text-[10px] font-bold text-slate-400 uppercase">Admin Email</label><input className="w-full p-3 border rounded-xl" value={form.adminEmail} onChange={e => setForm({...form, adminEmail: e.target.value})} /></div>
             <div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase">Description</label><textarea className="w-full p-3 border rounded-xl" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
          </div>
       </section>

       <section className="bg-white p-6 rounded-2xl shadow border space-y-4">
          <h3 className="font-bold border-b pb-2">2. Site Hierarchy</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="space-y-4">
                <div className="flex gap-2"><input value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder="New Location..." className="flex-1 p-2 border rounded" /><button onClick={addLocation} className="bg-slate-800 text-white px-3 py-1 rounded">Add</button></div>
                <div className="space-y-1">
                   {Object.keys(form.hierarchy).map(loc => (
                      <div key={loc} onClick={() => setSelectedLoc(loc)} className={`p-2 rounded cursor-pointer transition-colors ${selectedLoc === loc ? 'bg-indigo-50 border-indigo-200 border' : 'bg-slate-50 border-transparent border'}`}>{loc}</div>
                   ))}
                </div>
             </div>
             <div className="space-y-4">
                {selectedLoc ? (
                  <>
                    <h4 className="text-xs font-bold text-indigo-600">Components for {selectedLoc}</h4>
                    <div className="flex gap-2"><input value={newComp} onChange={e => setNewComp(e.target.value)} placeholder="New Component..." className="flex-1 p-2 border rounded" /><button onClick={addComponent} className="bg-slate-800 text-white px-3 py-1 rounded">Add</button></div>
                    <div className="flex flex-wrap gap-2">{form.hierarchy[selectedLoc].map(c => <span key={c} className="bg-slate-100 px-2 py-1 rounded text-xs border">{c}</span>)}</div>
                  </>
                ) : <p className="text-sm text-slate-400 italic">Select a location to manage its components.</p>}
             </div>
          </div>
       </section>
    </div>
  );
};
