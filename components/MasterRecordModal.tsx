
import React, { useState, useEffect, useMemo } from 'react';
import { DailyReport, DPRItem, BackupEntry, ItemTypeDefinition, Photo } from '../types';
import { getBackupById, getBackups } from '../services/firebaseService';
import { uploadPhoto, getPhotosByIds } from '../services/photoService';
import { ITEM_PATTERNS, toTitleCase } from '../utils/constants';
import { parseConstructionData, autofillItemData } from '../services/geminiService';
import { PhotoInspectionModal } from './PhotoInspectionModal';

interface MasterRecordModalProps {
  item: DPRItem;
  reports: DailyReport[];
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<DPRItem>) => void;
  onSplit: (item: DPRItem) => void;
  onDelete: (id: string) => void;
  hierarchy: Record<string, string[]>;
  customItemTypes?: ItemTypeDefinition[];
  user: any;
}

export const MasterRecordModal: React.FC<MasterRecordModalProps> = ({ item, reports, isOpen, onClose, onUpdate, onSplit, onDelete, hierarchy, customItemTypes, user }) => {
  const [localItem, setLocalItem] = useState<DPRItem>(item);
  const [sourceBackup, setSourceBackup] = useState<BackupEntry | null>(null);
  const [activeTab, setActiveTab] = useState<'source' | 'history' | 'photos'>('source');
  const [loadingSource, setLoadingSource] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [mobileTab, setMobileTab] = useState<'form' | 'context' | 'photos'>('form');
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  useEffect(() => {
    setLocalItem(item);
    if (isOpen) {
      loadSourceData();
      if (item.photoIds && item.photoIds.length > 0) {
        getPhotosByIds(item.photoIds).then(setPhotos);
      }
      // Auto-repair inconsistent chainageOrArea
      const expected = `${item.chainage || ''} ${item.structuralElement || ''}`.trim();
      if (item.chainageOrArea !== expected) {
        onUpdate(item.id, { chainageOrArea: expected });
      }
    }
  }, [item, isOpen]);

  const loadSourceData = async () => {
    setLoadingSource(true);
    setSourceBackup(null);
    try {
      if (item.sourceBackupId) {
        const b = await getBackupById(item.sourceBackupId);
        if (b) { setSourceBackup(b); setLoadingSource(false); return; }
      }
      const recentBackups = await getBackups(30);
      const found = recentBackups.find(b => {
          // 1. Precise ID match (Gold standard)
          if (b.parsedItems?.some(p => p.id === item.id)) return true;
          
          // 2. Fuzzy match on description keywords
          const rawLC = b.rawInput.toLowerCase();
          const descLC = item.activityDescription.toLowerCase();
          
          // Extract meaningful keywords (words > 3 chars)
          const keywords = descLC.split(/[\s,()]+/).filter(w => w.length > 3);
          const matchesKeywords = keywords.length > 0 && keywords.every(k => rawLC.includes(k));
          
          // Fallback: Check if location and component match the context headers usually used (--- CONTEXT: Loc > Comp ---)
          const locLC = item.location.toLowerCase();
          const compLC = (item.component || '').toLowerCase();
          const matchesContext = rawLC.includes(locLC) && (compLC ? rawLC.includes(compLC) : true);
          
          return matchesKeywords || matchesContext || rawLC.includes(descLC.substring(0, 15));
      });
      if (found) setSourceBackup(found);
    } catch (e) {
      console.error("Source fetch failed:", e);
    } finally {
      setLoadingSource(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsUploading(true);
      try {
        const photo = await uploadPhoto(e.target.files[0], user.uid, item); 
        const newPhotoIds = [...(localItem.photoIds || []), photo.id];
        setLocalItem(prev => ({ ...prev, photoIds: newPhotoIds }));
        setPhotos(prev => [...prev, photo]);
        onUpdate(item.id, { photoIds: newPhotoIds });
      } catch (error) {
        console.error("Photo upload failed:", error);
        alert("Photo upload failed.");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const allItemTypes = useMemo(() => {
      const types = [...ITEM_PATTERNS.map(p => p.name)];
      if (customItemTypes) {
          customItemTypes.forEach(t => { 
              const isDuplicate = types.some(existing => 
                  existing.toLowerCase() === t.name.toLowerCase() ||
                  existing.toLowerCase() + 's' === t.name.toLowerCase() ||
                  existing.toLowerCase() === t.name.toLowerCase() + 's'
              );
              if(!isDuplicate) types.push(t.name); 
          });
      }
      return types.sort();
  }, [customItemTypes]);

  const handleBlur = (field: keyof DPRItem) => {
    // Check if value changed
    if (localItem[field] !== (item as any)[field]) {
      const updates: Partial<DPRItem> = { [field]: localItem[field] };

      // Specific logic for fields that affect the composite 'chainageOrArea'
      if (field === 'structuralElement' || field === 'chainage') {
         // Auto-capitalize Structure
         if (field === 'structuralElement' && typeof localItem.structuralElement === 'string') {
             const titled = toTitleCase(localItem.structuralElement);
             updates.structuralElement = titled;
             setLocalItem(prev => ({ ...prev, structuralElement: titled }));
         }

         // Reconstruct chainageOrArea using localItem state to avoid stale data from 'item' prop
         const currentCh = localItem.chainage;
         const currentStruc = updates.structuralElement || localItem.structuralElement;
         
         updates.chainageOrArea = `${currentCh || ''} ${currentStruc || ''}`.trim();
         setLocalItem(prev => ({ ...prev, chainageOrArea: updates.chainageOrArea! }));
      }

      // Ensure Gantry is included in activityDescription if structuralElement is Gantry
      if (field === 'structuralElement' && localItem.structuralElement?.toLowerCase().includes('gantry')) {
          if (!localItem.activityDescription.toLowerCase().includes('gantry')) {
              updates.activityDescription = `Gantry: ${localItem.activityDescription}`;
              setLocalItem(prev => ({ ...prev, activityDescription: updates.activityDescription! }));
          }
      }

      onUpdate(item.id, updates);
    }
  };

  const handleChange = (field: keyof DPRItem, value: any) => {
    setLocalItem(prev => ({ ...prev, [field]: value }));
  };

  const handleRotatePhoto = async (photoId: string, currentRotation: number = 0) => {
    const newRotation = (currentRotation + 90) % 360;
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, rotation: newRotation } : p));
    const { updatePhotoRotation } = await import('../services/photoService');
    await updatePhotoRotation(photoId, newRotation);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center md:p-4 bg-slate-900/90 backdrop-blur-sm animate-fade-in">
      <div className="bg-white md:rounded-2xl shadow-2xl w-full max-w-6xl h-full md:h-[85vh] flex flex-col overflow-hidden border border-slate-700">
        
        {/* Header */}
        <div className="bg-slate-900 p-4 md:p-5 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/50">
              <i className="fas fa-database text-xl md:text-2xl"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl font-bold tracking-wide uppercase">Master Record</h2>
                {item.sourceBackupId && (
                    <span className="text-[9px] bg-amber-500 text-white font-black px-1.5 py-0.5 rounded shadow-sm">BATCH IMPORT</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 md:gap-3 text-[10px] md:text-xs text-slate-400 font-mono mt-1">
                <span className="bg-slate-800 px-2 py-0.5 rounded text-indigo-300">ID: {item.id.split('-')[0]}...</span>
                {item.date && (
                    <span className="bg-slate-800 px-2 py-0.5 rounded text-emerald-300"><i className="fas fa-calendar-day mr-1"></i> {item.date}</span>
                )}
                <span className="hidden md:inline"><i className="fas fa-user-circle mr-1"></i> {item.createdBy}</span>
                <span className="hidden md:inline"><i className="fas fa-clock mr-1"></i> {new Date(item.lastModifiedAt || new Date().toISOString()).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 md:gap-3 shrink-0 ml-2">
              <button onClick={() => onSplit(item)} className="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-500 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border border-indigo-500/20">
                  <i className="fas fa-columns"></i> <span className="hidden sm:inline">Split</span>
              </button>
              <button onClick={() => onDelete(item.id)} className="bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border border-red-500/20">
                  <i className="fas fa-trash-alt"></i> <span className="hidden sm:inline">Delete</span>
              </button>
              <button onClick={onClose} className="w-9 h-9 md:w-10 md:h-10 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors">
                <i className="fas fa-times"></i>
              </button>
          </div>
        </div>

        {/* Mobile View Toggle */}
        <div className="md:hidden flex border-b border-slate-200 bg-slate-50 shrink-0">
           <button onClick={() => setMobileTab('form')} className={`flex-1 py-3 text-sm font-bold uppercase transition-colors ${mobileTab === 'form' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}>Edit Record</button>
           <button onClick={() => setMobileTab('context')} className={`flex-1 py-3 text-sm font-bold uppercase transition-colors ${mobileTab === 'context' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}>Audit</button>
           <button onClick={() => setMobileTab('photos')} className={`flex-1 py-3 text-sm font-bold uppercase transition-colors ${mobileTab === 'photos' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}>Photos</button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* LEFT: FORM */}
          <div className={`w-full md:w-3/5 p-4 md:p-8 overflow-y-auto bg-slate-50 space-y-6 md:space-y-8 ${mobileTab === 'form' ? 'block' : 'hidden md:block'}`}>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
              <div className="absolute -top-3 left-4 bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Location context</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Chainage / EL</label>
                  <input className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-mono" value={localItem.chainage || ''} onChange={e => handleChange('chainage', e.target.value)} onBlur={() => handleBlur('chainage')} placeholder="e.g. 0+100 or EL. 1241" />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
              <div className="absolute -top-3 left-4 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Classification & Quantity</div>
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Item Classification (Type)</label>
                  <select 
                    className="w-full p-3 border border-slate-200 rounded-lg text-sm font-bold bg-white outline-none focus:ring-2 focus:ring-indigo-500" 
                    value={localItem.itemType} 
                    onChange={e => { 
                      const newType = e.target.value;
                      handleChange('itemType', newType); 
                      
                      // Auto-update unit based on default unit for the type
                      const pattern = ITEM_PATTERNS.find(p => p.name === newType);
                      if (pattern && pattern.defaultUnit) {
                        handleChange('unit', pattern.defaultUnit);
                        onUpdate(item.id, { itemType: newType, unit: pattern.defaultUnit });
                      } else {
                        onUpdate(item.id, { itemType: newType });
                      }
                    }}
                  >
                    <option value="Other">Unclassified / Other</option>
                    {allItemTypes.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-4 gap-4">
                   <div className="col-span-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Quantity</label>
                      <input type="number" step="any" className="w-full p-3 border border-slate-200 rounded-lg text-3xl font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500" value={localItem.quantity || ''} onChange={e => handleChange('quantity', parseFloat(e.target.value) || 0)} onBlur={() => handleBlur('quantity')} />
                   </div>
                   <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Unit</label>
                      <select className="w-full h-[58px] p-2 border border-slate-200 rounded-lg font-black outline-none focus:ring-2 focus:ring-indigo-500" value={localItem.unit} onChange={e => { handleChange('unit', e.target.value); onUpdate(item.id, {unit: e.target.value}); }}>
                         <option value="m3">m3</option>
                         <option value="m2">m2</option>
                         <option value="Ton">Ton</option>
                         <option value="nos">nos</option>
                         <option value="rm">rm</option>
                      </select>
                   </div>
                </div>

                <div>
                   <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Activity Description</label>
                   <textarea className="w-full p-3 border border-slate-200 rounded-lg text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-all" value={localItem.activityDescription} onChange={e => handleChange('activityDescription', e.target.value)} onBlur={() => handleBlur('activityDescription')} />
                </div>

                <div>
                   <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Next Plan</label>
                   <textarea className="w-full p-3 border border-slate-200 rounded-lg text-sm min-h-[60px] outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-all" value={localItem.plannedNextActivity || ''} onChange={e => handleChange('plannedNextActivity', e.target.value)} onBlur={() => handleBlur('plannedNextActivity')} />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: TABS */}
          <div className={`w-full md:w-2/5 border-t md:border-l border-slate-200 bg-white flex flex-col ${mobileTab === 'context' || mobileTab === 'photos' ? 'block' : 'hidden md:block'}`}>
            <div className="flex border-b border-slate-200 shrink-0">
              <button onClick={() => setActiveTab('source')} className={`flex-1 py-4 text-xs font-bold uppercase ${activeTab === 'source' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-400'}`}>Context</button>
              <button onClick={() => setActiveTab('history')} className={`flex-1 py-4 text-xs font-bold uppercase ${activeTab === 'history' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-400'}`}>History</button>
              <button onClick={() => setActiveTab('photos')} className={`flex-1 py-4 text-xs font-bold uppercase ${activeTab === 'photos' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-400'}`}>Photos</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'source' ? (
                <div className="space-y-4">
                  {loadingSource ? (
                    <div className="flex items-center justify-center p-12 text-slate-400 italic">
                       <i className="fas fa-circle-notch fa-spin mr-2"></i> Fetching context...
                    </div>
                  ) : sourceBackup ? (
                    <>
                       <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-xs leading-relaxed whitespace-pre-wrap shadow-inner">{sourceBackup.rawInput}</div>
                       <div className="text-[10px] text-slate-400 font-bold uppercase p-2 border border-slate-100 rounded bg-slate-50 mt-2">Source Session ID: {item.sourceBackupId || 'Direct Entry'}</div>
                    </>
                  ) : <div className="text-center p-12 text-slate-300 italic">No source context found.</div>}
                </div>
              ) : activeTab === 'history' ? (
                <div className="space-y-4">
                  {item.editHistory?.slice().reverse().map((log, i) => (
                    <div key={`${log.timestamp}-${i}`} className="pl-4 border-l-2 border-slate-100 pb-4 relative">
                      <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-indigo-500"></div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">{log.user} • {new Date(log.timestamp).toLocaleTimeString()}</div>
                      <div className="text-xs text-slate-700 mt-1">Changed <span className="font-bold">{log.field}</span> from <span className="font-bold text-red-600">{log.oldValue}</span> to <span className="font-bold text-indigo-600">{log.newValue}</span></div>
                    </div>
                  )) || <div className="text-center p-12 text-slate-300 italic">No history found.</div>}
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block w-full p-4 border-2 border-dashed border-slate-300 rounded-xl text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all">
                    <i className="fas fa-camera text-3xl text-slate-400 mb-2"></i>
                    <div className="text-sm font-bold text-slate-600">{isUploading ? 'Uploading...' : 'Add Photos'}</div>
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isUploading} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {photos.map(photo => (
                        <div key={photo.id} className="aspect-square bg-slate-100 rounded-lg relative overflow-hidden border border-slate-200 flex items-center justify-center group">
                           <img 
                              src={photo.url} 
                              alt="Photo" 
                              referrerPolicy="no-referrer" 
                              className="max-w-full max-h-full object-contain transition-transform cursor-zoom-in" 
                              style={{ transform: `rotate(${photo.rotation || 0}deg)` }}
                              onClick={() => setSelectedPhoto(photo)}
                           />
                           <button 
                              onClick={() => handleRotatePhoto(photo.id, photo.rotation)}
                              className="absolute top-1 right-1 w-7 h-7 bg-white/90 backdrop-blur-md rounded-full shadow-sm flex items-center justify-center text-xs text-slate-900 hover:bg-white transition-all z-10"
                           >
                              <i className="fas fa-rotate"></i>
                           </button>
                        </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedPhoto && (
            <PhotoInspectionModal 
               photo={selectedPhoto}
               reports={reports}
               onClose={() => setSelectedPhoto(null)}
               onInspectItem={(item) => {
                   if (item.id === localItem.id) {
                       setSelectedPhoto(null);
                   } else {
                       setSelectedPhoto(null);
                   }
               }}
               onUpdatePhoto={(updated) => {
                   setPhotos(prev => prev.map(p => p.id === updated.id ? updated : p));
                   if (selectedPhoto?.id === updated.id) setSelectedPhoto(updated);
               }}
               onUpdateReport={onUpdate}
            />
        )}

      </div>
    </div>
  );
};
