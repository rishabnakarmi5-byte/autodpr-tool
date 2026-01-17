import * as _app from "firebase/app";
import * as _firestore from "firebase/firestore";
import * as _auth from "firebase/auth";
import { DailyReport, LogEntry, DPRItem, TrashItem, BackupEntry, QuantityEntry } from "../types";

// Workaround for potential type definition mismatches
const { initializeApp } = _app as any;
const { getFirestore, collection, doc, setDoc, deleteDoc, addDoc, getDoc, getDocs, onSnapshot, query, orderBy, limit, updateDoc, arrayUnion } = _firestore as any;
const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } = _auth as any;

// Define loose types for internal use to avoid import errors
type User = any;
type Unsubscribe = any;

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
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

if (missingKeys.length === 0) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    console.log("Firebase initialized successfully (Auth & Firestore only).");
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
  }
} else {
  console.warn("Firebase not initialized due to missing config.");
}

const REPORT_COLLECTION = "daily_reports";
const LOG_COLLECTION = "activity_logs";
const TRASH_COLLECTION = "trash_bin";
const BACKUP_COLLECTION = "permanent_backups";
const QUANTITY_COLLECTION = "quantities";

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
  
  const unsubscribe = onSnapshot(q, (snapshot: any) => {
    const reports: DailyReport[] = [];
    snapshot.forEach((doc: any) => {
      reports.push(doc.data() as DailyReport);
    });
    onUpdate(reports);
  }, (error: any) => {
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

// --- Quantities ---

export const subscribeToQuantities = (onUpdate: (quantities: QuantityEntry[]) => void): Unsubscribe => {
  if (!db) return () => {};
  // Order by date descending
  const q = query(collection(db, QUANTITY_COLLECTION), orderBy("date", "desc"));
  
  const unsubscribe = onSnapshot(q, (snapshot: any) => {
    const items: QuantityEntry[] = [];
    snapshot.forEach((doc: any) => {
      items.push(doc.data() as QuantityEntry);
    });
    onUpdate(items);
  }, (error: any) => {
    console.error("Error subscribing to quantities:", error);
  });

  return unsubscribe;
};

export const addQuantity = async (quantity: QuantityEntry) => {
  if (!db) return;
  try {
    await setDoc(doc(db, QUANTITY_COLLECTION, quantity.id), quantity);
  } catch (e) {
    console.error("Error adding quantity:", e);
    throw e;
  }
};

export const updateQuantity = async (quantity: QuantityEntry, previousState: QuantityEntry, user: string) => {
  if(!db) return;
  try {
    // 1. Update the Quantity Document
    await setDoc(doc(db, QUANTITY_COLLECTION, quantity.id), quantity);
    
    // 2. Log Activity
    await logActivity(user, "Edit Quantity", JSON.stringify({
      before: previousState,
      after: quantity
    }), quantity.date);

    // 3. REVERSE SYNC: If Location or Component (Structure) changed, update the original Report Item
    if (quantity.reportId && quantity.originalReportItemId) {
        const hasLocationChanged = quantity.location !== previousState.location;
        const hasStructureChanged = quantity.structure !== previousState.structure;

        if (hasLocationChanged || hasStructureChanged) {
            const reportRef = doc(db, REPORT_COLLECTION, quantity.reportId);
            const reportSnap = await getDoc(reportRef);

            if (reportSnap.exists()) {
                const reportData = reportSnap.data() as DailyReport;
                
                // Map over entries to find and update the specific item
                let itemUpdated = false;
                const updatedEntries = reportData.entries.map((entry) => {
                    if (entry.id === quantity.originalReportItemId) {
                        itemUpdated = true;
                        return {
                            ...entry,
                            location: quantity.location,
                            component: quantity.structure
                        };
                    }
                    return entry;
                });

                if (itemUpdated) {
                    await updateDoc(reportRef, { entries: updatedEntries });
                    await logActivity(user, "Auto-Sync Report", `Updated Report Item from Quantity Edit: ${quantity.location} - ${quantity.structure}`, quantity.date);
                }
            }
        }
    }

  } catch (e) {
    console.error("Error updating quantity:", e);
    throw e;
  }
}

export const deleteQuantity = async (quantity: QuantityEntry, user: string) => {
  if (!db) return;
  try {
     // 1. Move to Trash
     const trashItem: TrashItem = {
      trashId: crypto.randomUUID(),
      originalId: quantity.id,
      type: 'quantity',
      content: quantity,
      deletedAt: new Date().toISOString(),
      deletedBy: user,
      reportDate: quantity.date
    };
    await setDoc(doc(db, TRASH_COLLECTION, trashItem.trashId), trashItem);

    // 2. Delete from Collection
    await deleteDoc(doc(db, QUANTITY_COLLECTION, quantity.id));
  } catch(e) {
    console.error("Error deleting quantity", e);
    throw e;
  }
}


// --- Backup System (Robust Data Safety) ---

export const savePermanentBackup = async (
  date: string, 
  rawInput: string, 
  parsedItems: DPRItem[], 
  user: string, 
  reportIdContext: string
) => {
  if (!db) return;
  try {
    const backupEntry: BackupEntry = {
      id: crypto.randomUUID(),
      date,
      timestamp: new Date().toISOString(),
      user: user || "Anonymous",
      rawInput,
      parsedItems,
      reportIdContext
    };
    // This collection is intended to be append-only and never deleted by the app
    await setDoc(doc(db, BACKUP_COLLECTION, backupEntry.id), backupEntry);
    console.log("Permanent backup saved.");
  } catch (e) {
    console.error("Failed to save backup:", e);
  }
};

export const getBackups = async (limitCount = 50): Promise<BackupEntry[]> => {
  if (!db) return [];
  try {
    const q = query(collection(db, BACKUP_COLLECTION), orderBy("timestamp", "desc"), limit(limitCount));
    const snapshot = await getDocs(q);
    const backups: BackupEntry[] = [];
    snapshot.forEach((doc: any) => {
      backups.push(doc.data() as BackupEntry);
    });
    return backups;
  } catch (e) {
    console.error("Error fetching backups:", e);
    return [];
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
  
  const unsubscribe = onSnapshot(q, (snapshot: any) => {
    const items: TrashItem[] = [];
    snapshot.forEach((doc: any) => {
      items.push(doc.data() as TrashItem);
    });
    onUpdate(items);
  }, (error: any) => {
    console.error("Error subscribing to trash:", error);
  });

  return unsubscribe;
};

export const restoreTrashItem = async (trashItem: TrashItem): Promise<void> => {
  if (!db) return;
  
  try {
    if (trashItem.type === 'report') {
      const report = trashItem.content as DailyReport;
      await setDoc(doc(db, REPORT_COLLECTION, report.id), report);
    } 
    else if (trashItem.type === 'item') {
      const item = trashItem.content as DPRItem;
      const reportId = trashItem.reportId;
      
      if (!reportId) throw new Error("Missing report ID for item restoration");

      const reportRef = doc(db, REPORT_COLLECTION, reportId);
      const reportSnap = await getDoc(reportRef);

      if (reportSnap.exists()) {
        const reportData = reportSnap.data() as DailyReport;
        if (!reportData.entries.some((e: any) => e.id === item.id)) {
           await updateDoc(reportRef, {
             entries: arrayUnion(item)
           });
        }
      } else {
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
    else if (trashItem.type === 'quantity') {
       const quantity = trashItem.content as QuantityEntry;
       await setDoc(doc(db, QUANTITY_COLLECTION, quantity.id), quantity);
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
  
  const unsubscribe = onSnapshot(q, (snapshot: any) => {
    const logs: LogEntry[] = [];
    snapshot.forEach((doc: any) => {
      logs.push({ ...doc.data(), id: doc.id } as LogEntry);
    });
    onUpdate(logs);
  }, (error: any) => {
    console.error("Error subscribing to logs:", error);
  });

  return unsubscribe;
};