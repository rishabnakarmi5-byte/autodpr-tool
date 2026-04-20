import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { Photo, DailyReport, DPRItem } from '../types';
import { PhotoInspectionModal } from './PhotoInspectionModal';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const db = getFirestore();

interface PhotoGalleryViewProps {
  reports: DailyReport[];
  onInspectItem: (item: DPRItem) => void;
  onUpdateReport?: (itemId: string, updates: Partial<DPRItem>) => void;
}

export const PhotoGalleryView: React.FC<PhotoGalleryViewProps> = ({ reports, onInspectItem, onUpdateReport }) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  
  // Batch download states
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedComponent, setSelectedComponent] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'photos'), orderBy('uploadedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const photosData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Photo));
      setPhotos(photosData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Extract unique values for filters
  const locations = Array.from(new Set(photos.map(p => p.location))).filter(Boolean).sort();
  const components = Array.from(new Set(photos.map(p => p.component))).filter(Boolean).sort();
  const users = Array.from(new Set(photos.map(p => p.metadataSnapshot?.creationDetails?.userName || p.uploaderId))).filter(Boolean).sort();
  const dates = Array.from(new Set(photos.map(p => p.date))).filter(Boolean).sort((a: any, b: any) => String(b).localeCompare(String(a)));

  const filteredPhotos = photos.filter(p => {
    const matchesSearch = !searchTerm || 
      (p.caption?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.metadataSnapshot?.activityDescription?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.location?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.component?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesLocation = !selectedLocation || p.location === selectedLocation;
    const matchesComponent = !selectedComponent || p.component === selectedComponent;
    const matchesUser = !selectedUser || (p.metadataSnapshot?.creationDetails?.userName === selectedUser || p.uploaderId === selectedUser);
    const matchesDate = !selectedDate || p.date === selectedDate;

    return matchesSearch && matchesLocation && matchesComponent && matchesUser && matchesDate;
  });

  const handleDownloadAll = async () => {
    if (filteredPhotos.length === 0) return;
    setIsDownloadingAll(true);
    setDownloadProgress(0);
    const zip = new JSZip();
    const folder = zip.folder(`DPR_Gallery_Export_${new Date().toISOString().split('T')[0]}`);

    try {
      for (let i = 0; i < filteredPhotos.length; i++) {
        const photo = filteredPhotos[i];
        const res = await fetch(photo.url);
        const blob = await res.blob();
        folder?.file(`Photo_${photo.location}_${photo.date}_${photo.id.split('-')[1] || photo.id.split('-')[0]}.jpg`, blob);
        setDownloadProgress(Math.round(((i + 1) / filteredPhotos.length) * 100));
      }
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `Photos_Batch_${filteredPhotos.length}_items.zip`);
    } catch (error) {
      console.error("Batch download failed:", error);
      alert("Failed to download some images.");
    } finally {
      setIsDownloadingAll(false);
      setDownloadProgress(0);
    }
  };

  const findMasterRecord = (id: string): DPRItem | undefined => {
    for (const report of reports) {
        const item = report.entries.find(e => e.id === id);
        if (item) return item;
    }
    return undefined;
  };

  const associatedItems = selectedPhoto 
      ? selectedPhoto.associatedMasterRecordIds.map(id => ({ id, item: findMasterRecord(id) }))
      : [];

  if (loading) return <div className="p-8 text-center text-slate-500">Loading gallery...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Photo Gallery</h2>
          <p className="text-slate-500 text-sm font-medium">Visual archive of all site activities</p>
        </div>
        <div className="flex items-center gap-3">
          {filteredPhotos.length > 0 && (
            <button 
              onClick={handleDownloadAll}
              disabled={isDownloadingAll}
              className={`px-4 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 transition-all ${isDownloadingAll ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-green-600 border-green-600 text-white hover:bg-green-700'}`}
            >
              {isDownloadingAll ? (
                <>
                  <i className="fas fa-circle-notch fa-spin"></i>
                  {downloadProgress}%
                </>
              ) : (
                <>
                  <i className="fas fa-download"></i>
                  Download ({filteredPhotos.length})
                </>
              )}
            </button>
          )}
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 transition-all ${showFilters ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <i className="fas fa-filter"></i>
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Keywords Search */}
              <div className="lg:col-span-1">
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest leading-none">Keywords</label>
                <div className="relative">
                  <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                  <input 
                    type="text" 
                    placeholder="Search caption..." 
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {/* Location Filter */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest leading-none">Location</label>
                <select 
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold appearance-none cursor-pointer"
                  value={selectedLocation}
                  onChange={e => setSelectedLocation(e.target.value)}
                >
                  <option value="">All Locations</option>
                  {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
              </div>

              {/* Component Filter */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest leading-none">Component</label>
                <select 
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold appearance-none cursor-pointer"
                  value={selectedComponent}
                  onChange={e => setSelectedComponent(e.target.value)}
                >
                  <option value="">All Components</option>
                  {components.map(comp => <option key={comp} value={comp}>{comp}</option>)}
                </select>
              </div>

              {/* User Filter */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest leading-none">Uploaded By</label>
                <select 
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold appearance-none cursor-pointer"
                  value={selectedUser}
                  onChange={e => setSelectedUser(e.target.value)}
                >
                  <option value="">All Users</option>
                  {users.map(user => <option key={user} value={user}>{user}</option>)}
                </select>
              </div>

              {/* Date Filter */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest leading-none">Activity Date</label>
                <select 
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold appearance-none cursor-pointer"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                >
                  <option value="">All Dates</option>
                  {dates.map(date => <option key={date} value={date}>{date}</option>)}
                </select>
              </div>
           </div>

           {(searchTerm || selectedLocation || selectedComponent || selectedUser || selectedDate) && (
             <div className="flex justify-between items-center pt-2">
                <button 
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedLocation('');
                    setSelectedComponent('');
                    setSelectedUser('');
                    setSelectedDate('');
                  }}
                  className="text-xs font-bold text-red-500 hover:text-red-700"
                >
                  <i className="fas fa-times-circle mr-1"></i> Clear all filters
                </button>
                <div className="text-[10px] font-black uppercase text-slate-400">
                  Showing {filteredPhotos.length} of {photos.length} photos
                </div>
             </div>
           )}
        </div>
      )}

      {filteredPhotos.length === 0 ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center space-y-4">
           <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mx-auto">
             <i className="fas fa-images text-2xl text-slate-400"></i>
           </div>
           <div>
             <h3 className="text-xl font-bold text-slate-700">No matching photos</h3>
             <p className="text-slate-400 text-sm">Try adjusting your filters or search terms</p>
           </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {filteredPhotos.map(photo => (
            <div 
              key={photo.id} 
              className="group relative flex flex-col space-y-2"
              onClick={() => setSelectedPhoto(photo)}
            >
              <div className="aspect-square bg-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer relative border border-slate-100 flex items-center justify-center">
                <img 
                  src={photo.url} 
                  alt="DPR Photo" 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                  style={{ transform: `rotate(${photo.rotation || 0}deg)` }}
                  referrerPolicy="no-referrer" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                    <span className="text-white text-[10px] font-bold uppercase tracking-widest">{photo.date}</span>
                    <span className="text-white text-xs font-black truncate">{photo.location}</span>
                </div>
                <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md w-8 h-8 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all">
                    <i className="fas fa-expand text-[10px] text-slate-800"></i>
                </div>
              </div>
              <div className="px-1">
                <p className="text-[10px] font-black uppercase text-slate-400 truncate tracking-tight">{photo.component}</p>
                <p className="text-xs font-bold text-slate-700 truncate leading-tight">{photo.caption || photo.metadataSnapshot?.activityDescription || 'Untitled Site Photo'}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedPhoto && (
        <PhotoInspectionModal 
            photo={selectedPhoto}
            reports={reports}
            onClose={() => setSelectedPhoto(null)}
            onInspectItem={onInspectItem}
            onUpdatePhoto={(updated) => setPhotos(prev => prev.map(p => p.id === updated.id ? updated : p))}
            onUpdateReport={onUpdateReport}
        />
      )}
    </div>
  );
};
