import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { Photo, DailyReport, DPRItem } from '../types';

const db = getFirestore();

interface PhotoGalleryViewProps {
  reports: DailyReport[];
  onInspectItem: (item: DPRItem) => void;
}

export const PhotoGalleryView: React.FC<PhotoGalleryViewProps> = ({ reports, onInspectItem }) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'photos'), orderBy('uploadedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const photosData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Photo));
      setPhotos(photosData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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
    <div className="p-6">
      <h2 className="text-2xl font-black text-slate-800 mb-6">Photo Gallery</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {photos.map(photo => (
          <div 
            key={photo.id} 
            className="aspect-square bg-slate-100 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer relative group"
            onClick={() => setSelectedPhoto(photo)}
          >
            <img src={photo.url} alt="DPR Photo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <i className="fas fa-search-plus text-white text-xl"></i>
            </div>
          </div>
        ))}
      </div>

      {selectedPhoto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedPhoto(null)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
                <img src={selectedPhoto.url} alt="Selected" className="w-full h-auto rounded-lg mb-4" referrerPolicy="no-referrer" />
                <h3 className="text-lg font-black text-slate-800 mb-4">{selectedPhoto.metadataSnapshot?.activityDescription || 'Untitled'}</h3>
                
                <h4 className="font-bold text-slate-700 mb-2">Associated Master Records:</h4>
                <div className="space-y-2 mb-6">
                    {associatedItems.map(({ id, item }) => (
                        <button 
                            key={id}
                            className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${item ? 'bg-indigo-50 border-indigo-200 hover:border-indigo-400' : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'}`}
                            disabled={!item}
                            onClick={() => { if (item) { onInspectItem(item); setSelectedPhoto(null); }}}
                        >
                            {item ? (
                                <>
                                    <span className="font-bold text-indigo-700">{item.itemType || 'Untitled'}</span>
                                    <span className="block text-slate-500 text-xs">{item.location} - {item.component}</span>
                                </>
                            ) : 'Master record not found (may have been deleted)'}
                        </button>
                    ))}
                </div>

                <button 
                  className="w-full bg-slate-900 text-white font-bold py-3 rounded-lg hover:bg-slate-700 transition"
                  onClick={() => setSelectedPhoto(null)}
                >
                    Close
                </button>
            </div>
        </div>
      )}
    </div>
  );
};
