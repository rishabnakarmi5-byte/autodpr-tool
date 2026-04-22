
import React, { useState } from 'react';
import { Photo, DailyReport, DPRItem } from '../types';
import { updatePhotoRotation, updatePhotoCaption, deletePhotoAssociation, updatePhotoMetadata } from '../services/photoService';

interface PhotoInspectionModalProps {
  photo: Photo;
  reports: DailyReport[];
  onClose: () => void;
  onInspectItem: (item: DPRItem) => void;
  onUpdatePhoto?: (photo: Photo) => void;
  onUpdateReport?: (reportId: string, updates: Partial<DPRItem>) => void;
}

export const PhotoInspectionModal: React.FC<PhotoInspectionModalProps> = ({ 
  photo, 
  reports, 
  onClose, 
  onInspectItem,
  onUpdatePhoto,
  onUpdateReport
}) => {
  const [localPhoto, setLocalPhoto] = useState<Photo>(photo);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRotate = async () => {
    const newRotation = ((localPhoto.rotation || 0) + 90) % 360;
    const updated = { ...localPhoto, rotation: newRotation };
    setLocalPhoto(updated);
    if (onUpdatePhoto) onUpdatePhoto(updated);
    await updatePhotoRotation(photo.id, newRotation);
  };

  const handleCaptionBlur = async (caption: string) => {
    await updatePhotoCaption(photo.id, caption);
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(localPhoto.url, { mode: 'cors' });
      if (!response.ok) throw new Error("CORS or fetch blocked");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Photo_${localPhoto.date || 'Site'}_${localPhoto.id.substring(0, 8)}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.warn("Direct blob download failed due to CORS. Falling back to simple link.", err);
      // Fallback: Normal download behavior (open in new tab for the user to save)
      const link = document.createElement('a');
      link.href = localPhoto.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.download = `Photo_${localPhoto.id.substring(0, 8)}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDeletePhoto = async () => {
    if (!confirm("PERMANENTLY DELETE this photo from the database and storage? This cannot be undone.")) return;
    
    setIsDeleting(true);
    try {
      // Use the photoService to delete it completely
      const { deletePhotoCompletely } = await import('../services/photoService');
      await deletePhotoCompletely(photo.id, photo.url);
      
      // Update local state by closing the modal
      onClose();
    } catch (err) {
      console.error("Critical error during photo deletion:", err);
      alert("Failed to delete photo. It might already be removed or you may have insufficient permissions.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Robust association lookup: Search all reports for this photo ID
  // This ensures that even if photo.associatedMasterRecordIds is out of sync, we find them.
  const associations = reports.reduce((acc, report) => {
    const items = report.entries.filter(e => e.photoIds?.includes(photo.id));
    items.forEach(item => {
       if (!acc.find(a => a.id === item.id)) {
          acc.push({ id: item.id, item, date: report.date });
       }
    });
    return acc;
  }, [] as {id: string, item: DPRItem, date: string}[]);

  // Also include IDs from the photo document itself if not already found
  photo.associatedMasterRecordIds?.forEach(id => {
      if (!associations.find(a => a.id === id)) {
          // Try to find it in reports
          let found = false;
          for (const report of reports) {
              const item = report.entries.find(e => e.id === id);
              if (item) {
                  associations.push({ id, item, date: report.date });
                  found = true;
                  break;
              }
          }
          if (!found) {
              // Not found in currently loaded reports
              // We'll leave it out or mark as unknown
          }
      }
  });

  const handleSyncWithFirstAssociation = async () => {
    const firstAssociation = associations[0];
    if (!firstAssociation) return;
    
    setIsSyncing(true);
    const updates: Partial<Photo> = {
      caption: firstAssociation.item.activityDescription,
      location: firstAssociation.item.location,
      component: firstAssociation.item.component
    };
    
    try {
      await updatePhotoMetadata(photo.id, updates);
      const updated = { ...localPhoto, ...updates };
      setLocalPhoto(updated);
      if (onUpdatePhoto) onUpdatePhoto(updated);
    } catch (err) {
      console.error("Failed to sync metadata:", err);
      alert("Failed to sync metadata. Please try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRemoveAssociation = async (masterRecordId: string, reportIdContext?: string) => {
    if (!confirm("Remove this photo association? The photo will NOT be deleted from storage.")) return;
    
    // 1. Update Photo document
    await deletePhotoAssociation(photo.id, masterRecordId);
    
    // 2. Update the specific DPRItem in its report
    const targetReport = reports.find(r => r.entries.some(e => e.id === masterRecordId));
    if (targetReport && onUpdateReport) {
        const item = targetReport.entries.find(e => e.id === masterRecordId);
        if (item) {
            const newPhotoIds = (item.photoIds || []).filter(id => id !== photo.id);
            onUpdateReport(masterRecordId, { photoIds: newPhotoIds });
        }
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col md:flex-row overflow-hidden relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        
        {/* Left: Enhanced Photo Viewer */}
        <div className="flex-1 bg-slate-950 flex flex-col min-h-[400px]">
          <div className="flex-1 relative flex items-center justify-center p-4">
             <img 
               src={localPhoto.url} 
               alt="Site View" 
               className="max-w-full max-h-[70vh] object-contain transition-transform duration-300"
               style={{ transform: `rotate(${localPhoto.rotation || 0}deg)` }}
               referrerPolicy="no-referrer"
             />
             
             {/* Overlay Actions */}
             <div className="absolute top-6 right-6 flex flex-col gap-3">
               <button 
                 onClick={handleRotate}
                 className="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all border border-white/20 shadow-xl"
                 title="Rotate 90°"
               >
                 <i className="fas fa-rotate text-lg"></i>
               </button>
               <button 
                 onClick={handleDownload}
                 className="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all border border-white/20 shadow-xl"
                 title="Download Original"
               >
                 <i className="fas fa-download text-lg"></i>
               </button>
               <button 
                 onClick={handleDeletePhoto}
                 disabled={isDeleting}
                 className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-all backdrop-blur-md border shadow-xl ${isDeleting ? 'bg-slate-500/50 border-white/10' : 'bg-red-500/20 hover:bg-red-500/80 border-red-500/30'}`}
                 title="Delete Photo Permanently"
               >
                 <i className={`fas ${isDeleting ? 'fa-spinner fa-spin' : 'fa-trash-alt'} text-lg`}></i>
               </button>
             </div>
          </div>
          
          <div className="p-6 bg-white/5 backdrop-blur-xl border-t border-white/10">
             <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 bg-indigo-500 text-white text-[10px] font-black rounded uppercase">Source</span>
                  <span className="text-white/60 text-xs font-mono">{localPhoto.date || 'Unknown Date'}</span>
                </div>
                {associations.length > 0 && (
                  <button 
                    onClick={handleSyncWithFirstAssociation}
                    disabled={isSyncing}
                    className="text-[10px] font-black uppercase text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <i className={`fas ${isSyncing ? 'fa-spinner fa-spin' : 'fa-magic'}`}></i>
                    {isSyncing ? 'Syncing...' : 'Auto-fill from Master'}
                  </button>
                )}
             </div>
             <input 
                type="text"
                value={localPhoto.caption || ''}
                onChange={e => setLocalPhoto({...localPhoto, caption: e.target.value})}
                onBlur={e => handleCaptionBlur(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="Add a permanent caption..."
             />
          </div>
        </div>

        {/* Right: Associations & Info */}
        <div className="w-full md:w-96 bg-white flex flex-col border-l border-slate-100">
           <div className="p-6 border-b border-slate-100 shrink-0">
              <h3 className="text-xl font-black text-slate-800">Associations</h3>
              <p className="text-slate-500 text-xs font-medium">Master records linked to this photo</p>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {associations.length === 0 ? (
                <div className="text-center py-12 px-6">
                   <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                      <i className="fas fa-link-slash text-xl"></i>
                   </div>
                   <p className="text-slate-400 text-sm italic">No active associations found. This photo might be orphaned.</p>
                </div>
              ) : (
                associations.map(({ id, item, date }) => (
                  <div 
                    key={id} 
                    className="group bg-slate-50 border border-slate-100 rounded-2xl p-4 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all cursor-pointer relative"
                    onClick={() => onInspectItem(item)}
                  >
                     <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider bg-indigo-50 px-2 py-0.5 rounded-lg">{item.itemType || 'Unclassified'}</span>
                        <span className="text-[10px] font-bold text-slate-400">{date}</span>
                     </div>
                     <h4 className="text-sm font-black text-slate-800 leading-tight mb-1">{item.location}</h4>
                     <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{item.activityDescription}</p>
                     
                     <button 
                        onClick={(e) => { e.stopPropagation(); handleRemoveAssociation(id); }}
                        className="absolute -top-2 -right-2 w-7 h-7 bg-white text-red-500 border border-slate-100 rounded-full shadow-lg items-center justify-center hidden group-hover:flex hover:bg-red-50 transition-colors"
                     >
                        <i className="fas fa-trash-alt text-[10px]"></i>
                     </button>
                  </div>
                ))
              )}
           </div>

           <div className="p-6 bg-slate-50 border-t border-slate-100 space-y-3 shrink-0">
              <button 
                onClick={onClose}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 shadow-lg"
              >
                Done
              </button>
           </div>
        </div>

        {/* Floating Close */}
        <button onClick={onClose} className="absolute top-4 right-4 md:hidden bg-white/20 backdrop-blur-md w-10 h-10 rounded-full flex items-center justify-center text-white z-50">
           <i className="fas fa-times"></i>
        </button>
      </div>
    </div>
  );
};
