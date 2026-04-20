import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirestore, collection, doc, setDoc, updateDoc, arrayUnion, getDoc, getDocs, query, where } from "firebase/firestore";
import { Photo, DPRItem } from "../types";

const storage = getStorage();
const db = getFirestore();
const PHOTO_COLLECTION = "photos";

// Simple compression/resize utility (using canvas)
export const compressImage = async (file: File, maxWidth = 1024, maxHeight = 1024): Promise<Blob> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.7);
            };
        };
    });
};

export const getPhotosByIds = async (photoIds: string[]): Promise<Photo[]> => {
    if (photoIds.length === 0) return [];
    
    // Fetch photos in chunks for Firestore 'in' query limit
    const CHUNK_SIZE = 10;
    const chunks = [];
    for (let i = 0; i < photoIds.length; i += CHUNK_SIZE) {
        chunks.push(photoIds.slice(i, i + CHUNK_SIZE));
    }
    
    let allPhotos: Photo[] = [];
    for (const chunk of chunks) {
        const q = query(collection(db, PHOTO_COLLECTION), where("id", "in", chunk));
        const snap = await getDocs(q);
        allPhotos = [...allPhotos, ...snap.docs.map(doc => doc.data() as Photo)];
    }
    
    return allPhotos;
};

export const deletePhotoAssociation = async (photoId: string, masterRecordId: string) => {
    const photoRef = doc(db, PHOTO_COLLECTION, photoId);
    const photoSnap = await getDoc(photoRef);
    if (!photoSnap.exists()) return;

    const photoData = photoSnap.data() as Photo;
    const newAssociatedIds = photoData.associatedMasterRecordIds.filter(id => id !== masterRecordId);
    
    if (newAssociatedIds.length === 0) {
        // Optionally delete the photo document if no associations left
        // await deleteDoc(photoRef);
    } else {
        await updateDoc(photoRef, { associatedMasterRecordIds: newAssociatedIds });
    }
};

export const uploadPhoto = async (file: File, uploaderId: string, masterRecord: DPRItem): Promise<Photo> => {
    const photoId = crypto.randomUUID();
    const compressedBlob = await compressImage(file);
    
    // Upload to Firebase Storage
    const storageRef = ref(storage, `photos/${photoId}.jpg`);
    await uploadBytes(storageRef, compressedBlob);
    const url = await getDownloadURL(storageRef);
    
    // Initialize photo metadata
    let photoData: Photo = {
        id: photoId,
        url,
        thumbnailUrl: url,
        uploadedAt: new Date().toISOString(),
        uploaderId,
        associatedMasterRecordIds: [masterRecord.id],
        date: masterRecord.date || new Date().toISOString().split('T')[0],
        location: masterRecord.location,
        component: masterRecord.component || 'N/A',
        metadataSnapshot: masterRecord
    };
    
    // Update associated Master Records (DPRItems) nested in DailyReports
    const reportsSnap = await getDocs(collection(db, "daily_reports"));
    
    for (const reportDoc of reportsSnap.docs) {
        const report = reportDoc.data() as any;
        const entryIndex = report.entries.findIndex((e: any) => e.id === masterRecord.id);
        
        if (entryIndex !== -1) {
            const entry = report.entries[entryIndex];
            
            // Update entry with photoId
            const updatedEntries = [...report.entries];
            const updatedEntry = { ...entry };
            
            if (!updatedEntry.photoIds) updatedEntry.photoIds = [];
            
            if (!updatedEntry.photoIds.includes(photoId)) {
                updatedEntry.photoIds.push(photoId);
                updatedEntries[entryIndex] = updatedEntry;
                await updateDoc(reportDoc.ref, { entries: updatedEntries });
            }
            break;
        }
    }
    
    // Create photo document in Firestore
    await setDoc(doc(db, PHOTO_COLLECTION, photoId), photoData);
    
    return photoData;
};
