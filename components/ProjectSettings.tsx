
import React, { useState } from 'react';
import { ProjectSettings } from '../types';
import { LOCATION_HIERARCHY } from '../utils/constants';

interface ProjectSettingsProps {
  currentSettings: ProjectSettings | null;
  onSave: (settings: ProjectSettings) => void;
}

export const ProjectSettingsView: React.FC<ProjectSettingsProps> = ({ currentSettings, onSave }) => {
  
  const [hierarchy, setHierarchy] = useState(currentSettings?.locationHierarchy || LOCATION_HIERARCHY);
  const [projName, setProjName] = useState(currentSettings?.projectName || 'Bhotekoshi Hydroelectric Project');
  const [newLocName, setNewLocName] = useState('');
  const [newCompLoc, setNewCompLoc] = useState('');
  const [newCompName, setNewCompName] = useState('');

  const handleSave = () => {
    onSave({
        projectName: projName,
        projectDescription: 'Construction Management',
        locationHierarchy: hierarchy,
        customItems: []
    });
    alert("Settings Saved!");
  };

  const addLocation = () => {
      if(newLocName && !hierarchy[newLocName]) {
          setHierarchy({ ...hierarchy, [newLocName]: [] });
          setNewLocName('');
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

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
        <div className="flex justify-between items-center border-b border-slate-200 pb-4">
            <h2 className="text-3xl font-bold text-slate-800">Project Settings</h2>
            <button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-bold">
                Save Changes
            </button>
        </div>

        {/* Project Info */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Project Details</h3>
            <div className="grid gap-4">
                <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Project Name</label>
                    <input className="w-full p-3 border rounded-xl" value={projName} onChange={e => setProjName(e.target.value)} />
                </div>
            </div>
        </div>

        {/* Hierarchy Editor */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Site Hierarchy</h3>
            <p className="text-sm text-slate-500 mb-6">Manage locations and components available in input and reports.</p>

            <div className="grid md:grid-cols-2 gap-8">
                {/* Locations */}
                <div>
                    <h4 className="font-bold text-indigo-600 mb-2">1. Main Locations</h4>
                    <div className="flex gap-2 mb-4">
                        <input className="flex-1 p-2 border rounded-lg text-sm" placeholder="New Location Name" value={newLocName} onChange={e => setNewLocName(e.target.value)} />
                        <button onClick={addLocation} className="bg-indigo-100 text-indigo-700 px-3 rounded-lg font-bold text-xs">Add</button>
                    </div>
                    <ul className="space-y-2 max-h-60 overflow-y-auto">
                        {Object.keys(hierarchy).map(loc => (
                            <li key={loc} className="p-2 bg-slate-50 rounded border border-slate-100 text-sm font-medium flex justify-between">
                                {loc}
                                <span className="text-xs text-slate-400">{(hierarchy[loc] || []).length} Components</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Components */}
                <div>
                    <h4 className="font-bold text-indigo-600 mb-2">2. Components</h4>
                    <div className="flex flex-col gap-2 mb-4">
                        <select className="p-2 border rounded-lg text-sm" value={newCompLoc} onChange={e => setNewCompLoc(e.target.value)}>
                            <option value="">Select Parent Location...</option>
                            {Object.keys(hierarchy).map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <div className="flex gap-2">
                             <input className="flex-1 p-2 border rounded-lg text-sm" placeholder="New Component Name" value={newCompName} onChange={e => setNewCompName(e.target.value)} />
                             <button onClick={addComponent} disabled={!newCompLoc} className="bg-indigo-100 text-indigo-700 px-3 rounded-lg font-bold text-xs disabled:opacity-50">Add</button>
                        </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4 min-h-[150px]">
                        {newCompLoc ? (
                            <ul className="space-y-1">
                                {hierarchy[newCompLoc]?.map((c, i) => (
                                    <li key={i} className="text-sm text-slate-600 border-b border-slate-100 pb-1">{c}</li>
                                ))}
                                {hierarchy[newCompLoc]?.length === 0 && <li className="text-xs italic text-slate-400">No components yet.</li>}
                            </ul>
                        ) : (
                            <p className="text-xs text-slate-400 text-center mt-8">Select a location to view/add components.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};
