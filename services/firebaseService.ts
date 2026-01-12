import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, deleteDoc, addDoc, getDoc, onSnapshot, query, orderBy, limit, Unsubscribe, updateDoc, arrayUnion } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { getStorage, ref, uploadString, uploadBytes, getDownloadURL } from "firebase/storage";
import { DailyReport, LogEntry, DPRItem, TrashItem } from "../types";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.measurementId
};

// Robust check to warn which specific keys are missing
const missingKeys = Object.entries(firebaseConfig)
  .filter(([key, value]) => !value && key !== 'measurementId') // measurementId is optional
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.error(`Firebase Configuration Error: The following keys are missing in environment variables: ${missingKeys.join(', ')}.`);
}

let app;
let db: any;
let auth: any;
let storage: any;

if (missingKeys.length === 0) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);
    console.log("Firebase initialized successfully. Storage Bucket:", firebaseConfig.storageBucket);
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
  }
} else {
  console.warn("Firebase not initialized due to missing config.");
}

const REPORT_COLLECTION = "daily_reports";
const LOG_COLLECTION = "activity_logs";
const TRASH_COLLECTION = "trash_bin";

// --- Authentication ---

export const signInWithGoogle = async () => {
  if (!auth) throw new Error("Authentication service not initialized. Check configuration.");
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logoutUser = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};

export const subscribeToAuth = (callback: (user: User | null) => void): Unsubscribe => {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

// --- Reports ---

export const subscribeToReports = (onUpdate: (reports: DailyReport[]) => void): Unsubscribe => {
  if (!db) return () => {};
  
  const q = query(collection(db, REPORT_COLLECTION), orderBy("date", "desc"));
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const reports: DailyReport[] = [];
    snapshot.forEach((doc) => {
      reports.push(doc.data() as DailyReport);
    });
    onUpdate(reports);
  }, (error) => {
    console.error("Error subscribing to reports:", error);
  });

  return unsubscribe;
};

export const saveReportToCloud = async (report: DailyReport): Promise<void> => {
  if (!db) {
     console.error("Cannot save report: Database not initialized.");
     return;
  }
  try {
    await setDoc(doc(db, REPORT_COLLECTION, report.id), report);
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
};

// --- Storage ---

export const uploadReportImage = async (file: Blob | File | string, path: string): Promise<string> => {
  if (!storage) {
      const msg = "Storage not initialized. Check FIREBASE_STORAGE_BUCKET.";
      console.error(msg);
      throw new Error(msg);
  }
  
  const storageRef = ref(storage, path);
  try {
    if (typeof file === 'string') {
        // Handle Base64 strings (legacy support)
        await uploadString(storageRef, file, 'data_url');
    } else {
        // Handle Blobs/Files (More efficient, no base64 overhead)
        await uploadBytes(storageRef, file);
    }
    const url = await getDownloadURL(storageRef);
    return url;
  } catch (error: any) {
    console.error("Error uploading image:", error);
    if (error.code === 'storage/unauthorized') {
        throw new Error("Permission denied. Check Firebase Storage Rules.");
    }
    if (error.code === 'storage/canceled') {
        throw new Error("Upload canceled.");
    }
    throw error;
  }
};

// --- Trash / Soft Delete System ---

export const moveReportToTrash = async (report: DailyReport, user: string): Promise<void> => {
  if (!db) return;
  try {
    // 1. Create Trash Item
    const trashItem: TrashItem = {
      trashId: crypto.randomUUID(),
      originalId: report.id,
      type: 'report',
      content: report,
      deletedAt: new Date().toISOString(),
      deletedBy: user,
      reportDate: report.date
    };
    await setDoc(doc(db, TRASH_COLLECTION, trashItem.trashId), trashItem);

    // 2. Delete Original
    await deleteDoc(doc(db, REPORT_COLLECTION, report.id));
  } catch (e) {
    console.error("Error moving report to trash:", e);
    throw e;
  }
};

export const moveItemToTrash = async (item: DPRItem, reportId: string, reportDate: string, user: string): Promise<void> => {
  if (!db) return;
  try {
    // 1. Create Trash Item (Note: We do not modify the original report here, that's done by the caller via saveReportToCloud)
    const trashItem: TrashItem = {
      trashId: crypto.randomUUID(),
      originalId: item.id,
      type: 'item',
      content: item,
      deletedAt: new Date().toISOString(),
      deletedBy: user,
      reportDate: reportDate,
      reportId: reportId
    };
    await setDoc(doc(db, TRASH_COLLECTION, trashItem.trashId), trashItem);
  } catch (e) {
    console.error("Error moving item to trash:", e);
    throw e;
  }
};

export const deleteReportFromCloud = async (id: string): Promise<void> => {
  // Direct delete (legacy or permanent)
  if (!db) return;
  try {
    await deleteDoc(doc(db, REPORT_COLLECTION, id));
  } catch (e) {
    console.error("Error deleting document: ", e);
    throw e;
  }
};

export const subscribeToTrash = (onUpdate: (items: TrashItem[]) => void): Unsubscribe => {
  if (!db) return () => {};
  
  const q = query(collection(db, TRASH_COLLECTION), orderBy("deletedAt", "desc"));
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const items: TrashItem[] = [];
    snapshot.forEach((doc) => {
      items.push(doc.data() as TrashItem);
    });
    onUpdate(items);
  }, (error) => {
    console.error("Error subscribing to trash:", error);
  });

  return unsubscribe;
};

export const restoreTrashItem = async (trashItem: TrashItem): Promise<void> => {
  if (!db) return;
  
  try {
    if (trashItem.type === 'report') {
      const report = trashItem.content as DailyReport;
      // Restore report
      await setDoc(doc(db, REPORT_COLLECTION, report.id), report);
    } 
    else if (trashItem.type === 'item') {
      const item = trashItem.content as DPRItem;
      const reportId = trashItem.reportId;
      
      if (!reportId) throw new Error("Missing report ID for item restoration");

      const reportRef = doc(db, REPORT_COLLECTION, reportId);
      const reportSnap = await getDoc(reportRef);

      if (reportSnap.exists()) {
        // If report exists, append the item
        const reportData = reportSnap.data() as DailyReport;
        // Check if item already exists to avoid dupes?
        if (!reportData.entries.some(e => e.id === item.id)) {
           await updateDoc(reportRef, {
             entries: arrayUnion(item)
           });
        }
      } else {
        // If report doesn't exist (maybe permanently deleted?), create a partial one or specific container
        // Strategy: Create a new report for that date
        const newReport: DailyReport = {
          id: reportId,
          date: trashItem.reportDate,
          lastUpdated: new Date().toISOString(),
          projectTitle: "Restored Report",
          entries: [item]
        };
        await setDoc(reportRef, newReport);
      }
    }

    // Remove from trash after successful restore
    await deleteDoc(doc(db, TRASH_COLLECTION, trashItem.trashId));

  } catch (error) {
    console.error("Error restoring item:", error);
    throw error;
  }
};

// --- Activity Logs ---

export const logActivity = async (user: string, action: string, details: string, reportDate: string) => {
  if (!db) return;
  try {
    const log: Omit<LogEntry, 'id'> = {
      timestamp: new Date().toISOString(),
      user: user || "Anonymous",
      action,
      details,
      reportDate
    };
    await addDoc(collection(db, LOG_COLLECTION), log);
  } catch (e) {
    console.error("Error logging activity:", e);
  }
};

export const subscribeToLogs = (onUpdate: (logs: LogEntry[]) => void): Unsubscribe => {
  if (!db) return () => {};
  
  // Get last 100 logs
  const q = query(collection(db, LOG_COLLECTION), orderBy("timestamp", "desc"), limit(100));
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const logs: LogEntry[] = [];
    snapshot.forEach((doc) => {
      logs.push({ ...doc.data(), id: doc.id } as LogEntry);
    });
    onUpdate(logs);
  }, (error) => {
    console.error("Error subscribing to logs:", error);
  });

  return unsubscribe;
};