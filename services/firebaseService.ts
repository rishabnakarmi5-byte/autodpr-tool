
import * as _app from "firebase/app";
import * as _firestore from "firebase/firestore";
import * as _auth from "firebase/auth";
import { DailyReport, LogEntry, DPRItem, TrashItem, BackupEntry, QuantityEntry, ProjectSettings, UserProfile, LiningEntry, SystemCheckpoint, TrainingExample, UserMood } from "../types";
import { LOCATION_HIERARCHY, identifyItemType, parseQuantityDetails } from "../utils/constants";

// Workaround for potential type definition mismatches
const { initializeApp } = _app as any;
const { getFirestore, collection, doc, setDoc, deleteDoc, addDoc, getDoc, getDocs, onSnapshot, query, orderBy, limit, updateDoc, arrayUnion, where, increment, serverTimestamp, writeBatch, initializeFirestore } = _firestore as any;
const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } = _auth as any;

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.measurementId
};

export const missingKeys = Object.entries(firebaseConfig)
  .filter(([key, value]) => !value && key !== 'measurementId') 
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.error(`Firebase Configuration Error: Missing: ${missingKeys.join(', ')}.`);
}

export const isConfigured = missingKeys.length === 0;

let app;
let db: any;
let auth: any;

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    // Initialize Firestore with settings to ignore undefined properties
    db = initializeFirestore(app, { ignoreUndefinedProperties: true });
    auth = getAuth(app);
    console.log("Firebase initialized.");
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
  }
}

const REPORT_COLLECTION = "daily_reports";
const LOG_COLLECTION = "activity_logs";
const TRASH_COLLECTION = "trash_bin";
const BACKUP_COLLECTION = "permanent_backups";
const REPORT_HISTORY_COLLECTION = "report_history";
const QUANTITY_COLLECTION = "quantities";
const SETTINGS_COLLECTION = "project_settings";
const USER_COLLECTION = "user_profiles";
const LINING_COLLECTION = "lining_data";
const CHECKPOINT_COLLECTION = "system_checkpoints";
const TRAINING_COLLECTION = "ai_training_examples";
const MOOD_COLLECTION = "user_moods";
const RAW_INPUT_COLLECTION = "raw_inputs"; // New Collection

// --- Authentication & Profile ---

export const signInWithGoogle = async () => {
  if (!auth) throw new Error("Authentication service not initialized");
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const userRef = doc(db, USER_COLLECTION, result.user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: result.user.uid,
        displayName: result.user.displayName,
        email: result.user.email,
        totalEntries: 0,
        totalDays: 1,
        level: 1,
        xp: 0,
        joinedDate: new Date().toISOString()
      });
    }
    return result.user;
  } catch (error) {
    console.error("Login failed", error);
    throw error;
  }
};

export const logoutUser = async () => {
  if (!auth) return;
  return signOut(auth);
};

export const subscribeToAuth = (callback: (user: any | null) => void): any => {
  if (!auth) {
      callback(null);
      return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

export const subscribeToUserProfile = (uid: string, callback: (p: UserProfile | null) => void) => {
  if (!db) return () => {};
  return onSnapshot(doc(db, USER_COLLECTION, uid), (doc: any) => {
    if (doc.exists()) callback(doc.data() as UserProfile);
    else callback(null);
  });
};

export const incrementUserStats = async (uid: string | undefined, entriesCount: number) => {
    if (!db || !uid) return;
    const userRef = doc(db, USER_COLLECTION, uid);
    await updateDoc(userRef, {
        totalEntries: increment(entriesCount),
        xp: increment(entriesCount * 5)
    });
};

// --- User Mood Tracking ---

export const saveUserMood = async (uid: string, mood: string, note: string) => {
  if (!db) return;
  const today = new Date().toISOString().split('T')[0];
  const docId = `${uid}_${today}`;
  const moodData = {
    id: docId,
    uid,
    mood,
    note,
    timestamp: new Date().toISOString()
  };
  await setDoc(doc(db, MOOD_COLLECTION, docId), moodData);
};

export const subscribeToTodayMood = (uid: string, callback: (mood: UserMood | null) => void): any => {
  if (!db) {
    callback(null);
    return () => {};
  }
  const today = new Date().toISOString().split('T')[0];
  const docId = `${uid}_${today}`;
  return onSnapshot(doc(db, MOOD_COLLECTION, docId), (docSnap: any) => {
    if (docSnap.exists()) callback(docSnap.data() as UserMood);
    else callback(null);
  });
};

// --- Reports ---

export const subscribeToReports = (callback: (reports: DailyReport[]) => void): any => {
  if (!db) return () => {};
  const q = query(collection(db, REPORT_COLLECTION), orderBy("date", "desc"));
  return onSnapshot(q, (snapshot: any) => {
    const reports = snapshot.docs.map((doc: any) => doc.data() as DailyReport);
    callback(reports);
  });
};

export const saveReportToCloud = async (report: DailyReport) => {
  if (!db) return;
  const ref = doc(db, REPORT_COLLECTION, report.id);
  await setDoc(ref, report, { merge: true });
};

export const deleteReportFromCloud = async (reportId: string) => {
    if (!db) return;
    await deleteDoc(doc(db, REPORT_COLLECTION, reportId));
};

export const saveReportHistory = async (report: DailyReport) => {
    if(!db) return;
    await addDoc(collection(db, REPORT_HISTORY_COLLECTION), {
        reportId: report.id,
        date: report.date,
        entries: report.entries,
        timestamp: new Date().toISOString()
    });
};

// --- Activity Logs & RAW INPUT ---

export const logActivity = async (user: string, action: string, details: string, reportDate: string, relatedBackupId?: string) => {
  if (!db) return;
  const entry: any = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    user,
    action,
    details: typeof details === 'object' ? JSON.stringify(details) : details,
    reportDate
  };
  if(relatedBackupId) entry.relatedBackupId = relatedBackupId;
  await setDoc(doc(db, LOG_COLLECTION, entry.id), entry);
};

export const subscribeToLogs = (callback: (logs: LogEntry[]) => void): any => {
  if (!db) return () => {};
  const q = query(collection(db, LOG_COLLECTION), orderBy("timestamp", "desc"), limit(100));
  return onSnapshot(q, (snapshot: any) => {
    const logs = snapshot.docs.map((doc: any) => doc.data() as LogEntry);
    callback(logs);
  });
};

export const saveRawInput = async (
    rawText: string, 
    date: string, 
    locations: string[], 
    components: string[], 
    user: string,
    status?: string,
    error?: string
) => {
    if (!db) return;
    const id = crypto.randomUUID();
    const entry = {
        id,
        timestamp: new Date().toISOString(),
        date,
        rawText,
        locations,
        components,
        user,
        status: status || (error ? 'failed' : 'manual'),
        errorMessage: error || null
    };
    await setDoc(doc(db, RAW_INPUT_COLLECTION, id), entry);
    return id;
};

export const updateRawInputStatus = async (id: string, status: string, error?: string) => {
    if (!db || !id) return;
    const ref = doc(db, RAW_INPUT_COLLECTION, id);
    await updateDoc(ref, {
        status,
        errorMessage: error || null
    });
};

export const getRawInputsForDate = async (date: string) => {
    if (!db) return [];
    
    // NOTE: Simplified query to avoid "Index Required" errors on new collections.
    // We filter by date in DB, then sort by timestamp in memory.
    const q = query(collection(db, RAW_INPUT_COLLECTION), where("date", "==", date));
    
    try {
        const snap = await getDocs(q);
        const results = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        
        // Sort in memory to avoid needing a composite index
        return results.sort((a: any, b: any) => {
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
    } catch (error) {
        console.error("Error fetching raw inputs:", error);
        throw error;
    }
};

// --- Trash & Recycle Bin ---

export const moveItemToTrash = async (item: DPRItem, reportId: string, reportDate: string, user: string) => {
    if (!db) return;
    const trashItem: TrashItem = {
        trashId: crypto.randomUUID(),
        originalId: item.id,
        type: 'item',
        content: item,
        deletedAt: new Date().toISOString(),
        deletedBy: user,
        reportDate,
        reportId
    };
    await setDoc(doc(db, TRASH_COLLECTION, trashItem.trashId), trashItem);
    await logActivity(user, "Move to Trash", `Moved item ${item.location} to trash`, reportDate);
};

export const moveReportToTrash = async (report: DailyReport, user: string) => {
    if (!db) return;
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
    await deleteReportFromCloud(report.id);
    await logActivity(user, "Delete Report", `Moved report ${report.date} to trash`, report.date);
};

export const subscribeToTrash = (callback: (items: TrashItem[]) => void): any => {
    if (!db) return () => {};
    const q = query(collection(db, TRASH_COLLECTION), orderBy("deletedAt", "desc"));
    return onSnapshot(q, (snapshot: any) => {
        const items = snapshot.docs.map((doc: any) => doc.data() as TrashItem);
        callback(items);
    });
};

export const restoreTrashItem = async (item: TrashItem) => {
    if (!db) return;
    if (item.type === 'report') {
        await saveReportToCloud(item.content as DailyReport);
    } else if (item.type === 'item') {
        const reportRef = doc(db, REPORT_COLLECTION, item.reportId);
        const reportSnap = await getDoc(reportRef);
        if (reportSnap.exists()) {
            const report = reportSnap.data() as DailyReport;
            if (!report.entries.find(e => e.id === item.originalId)) {
                const updatedEntries = [...report.entries, item.content as DPRItem];
                await updateDoc(reportRef, { entries: updatedEntries });
            }
        } else {
             throw new Error("Parent report not found");
        }
    } else if (item.type === 'quantity') {
        await updateQuantity(item.content as QuantityEntry, undefined, "System Restore");
    }
    await deleteDoc(doc(db, TRASH_COLLECTION, item.trashId));
};

// --- Permanent Backups ---

export const savePermanentBackup = async (date: string, rawText: string, parsedItems: DPRItem[], user: string, reportIdContext: string) => {
    if (!db) return null;
    const id = crypto.randomUUID();
    const backup: BackupEntry = {
        id,
        date,
        timestamp: new Date().toISOString(),
        user,
        rawInput: rawText,
        parsedItems,
        reportIdContext
    };
    await setDoc(doc(db, BACKUP_COLLECTION, id), backup);
    return id;
};

export const getBackups = async (limitCount: number = 50, startDate?: string, endDate?: string) => {
    if (!db) return [];
    let q = query(collection(db, BACKUP_COLLECTION), orderBy("timestamp", "desc"), limit(limitCount));
    if (startDate && endDate) {
         q = query(collection(db, BACKUP_COLLECTION), where("date", ">=", startDate), where("date", "<=", endDate), orderBy("date", "desc"));
    }
    const snap = await getDocs(q);
    return snap.docs.map((d: any) => d.data() as BackupEntry);
};

export const getBackupById = async (id: string): Promise<BackupEntry | null> => {
    if (!db) return null;
    const snap = await getDoc(doc(db, BACKUP_COLLECTION, id));
    if (snap.exists()) return snap.data() as BackupEntry;
    return null;
};

// --- Quantities ---

export const subscribeToQuantities = (callback: (qty: QuantityEntry[]) => void): any => {
    if (!db) return () => {};
    const q = query(collection(db, QUANTITY_COLLECTION), orderBy("date", "desc"));
    return onSnapshot(q, (snapshot: any) => {
        const items = snapshot.docs.map((doc: any) => doc.data() as QuantityEntry);
        callback(items);
    });
};

export const updateQuantity = async (qty: QuantityEntry, oldQty?: QuantityEntry, user?: string) => {
    if(!db) return;
    await setDoc(doc(db, QUANTITY_COLLECTION, qty.id), qty);
    if(oldQty) {
        logActivity(user || "System", "Update Quantity", `Updated ${qty.itemType} at ${qty.location}`, qty.date);
    }
};

export const deleteQuantity = async (qty: QuantityEntry, user?: string) => {
    if(!db) return;
    const trashItem: TrashItem = {
        trashId: crypto.randomUUID(),
        originalId: qty.id,
        type: 'quantity',
        content: qty,
        deletedAt: new Date().toISOString(),
        deletedBy: user || 'System',
        reportDate: qty.date
    };
    await setDoc(doc(db, TRASH_COLLECTION, trashItem.trashId), trashItem);
    await deleteDoc(doc(db, QUANTITY_COLLECTION, qty.id));
    logActivity(user || "System", "Delete Quantity", `Deleted ${qty.itemType} at ${qty.location}`, qty.date);
};

// --- AI Training ---

export const saveTrainingExample = async (example: TrainingExample) => {
  if (!db) return;
  await setDoc(doc(db, TRAINING_COLLECTION, example.id), example);
};

export const deleteTrainingExample = async (id: string) => {
  if (!db) return;
  await deleteDoc(doc(db, TRAINING_COLLECTION, id));
};

export const getTrainingExamples = async (): Promise<TrainingExample[]> => {
  if (!db) return [];
  const q = query(collection(db, TRAINING_COLLECTION), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d: any) => d.data() as TrainingExample);
};

export const subscribeToTrainingExamples = (callback: (ex: TrainingExample[]) => void): any => {
  if (!db) return () => {};
  const q = query(collection(db, TRAINING_COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot: any) => {
    const items = snapshot.docs.map((doc: any) => doc.data() as TrainingExample);
    callback(items);
  });
};

// --- Lining Data ---

export const subscribeToLining = (callback: (entries: LiningEntry[]) => void): any => {
    if (!db) return () => {};
    const q = query(collection(db, LINING_COLLECTION), orderBy("fromCh", "asc"));
    return onSnapshot(q, (snapshot: any) => {
        const items = snapshot.docs.map((doc: any) => doc.data() as LiningEntry);
        callback(items);
    });
};

export const saveLiningBatch = async (entries: LiningEntry[]) => {
    if (!db) return;
    const batch = writeBatch(db);
    entries.forEach(entry => {
        const ref = doc(db, LINING_COLLECTION, entry.id);
        batch.set(ref, entry);
    });
    await batch.commit();
};

export const deleteLiningEntry = async (id: string) => {
    if (!db) return;
    await deleteDoc(doc(db, LINING_COLLECTION, id));
};

// --- Settings ---

export const getProjectSettings = async (): Promise<ProjectSettings | null> => {
    if (!db) return null;
    const snap = await getDoc(doc(db, SETTINGS_COLLECTION, 'main_settings'));
    if (snap.exists()) return snap.data() as ProjectSettings;
    return null;
};

export const saveProjectSettings = async (settings: ProjectSettings) => {
    if (!db) return;
    await setDoc(doc(db, SETTINGS_COLLECTION, 'main_settings'), settings);
};

// --- System Checkpoints ---

export const createSystemCheckpoint = async (user: string): Promise<string> => {
    if (!db) throw new Error("Database not connected");
    const reportsSnap = await getDocs(collection(db, REPORT_COLLECTION));
    const reports = reportsSnap.docs.map((d: any) => d.data() as DailyReport);
    const qtySnap = await getDocs(collection(db, QUANTITY_COLLECTION));
    const quantities = qtySnap.docs.map((d: any) => d.data() as QuantityEntry);
    const liningSnap = await getDocs(collection(db, LINING_COLLECTION));
    const lining = liningSnap.docs.map((d: any) => d.data() as LiningEntry);
    const settingsSnap = await getDoc(doc(db, SETTINGS_COLLECTION, 'main_settings'));
    const settings = settingsSnap.exists() ? (settingsSnap.data() as ProjectSettings) : null;
    const checkpointId = crypto.randomUUID();
    const checkpoint: SystemCheckpoint = {
        id: checkpointId,
        timestamp: new Date().toISOString(),
        name: `Checkpoint ${new Date().toLocaleDateString()}`,
        createdBy: user,
        data: { reports, quantities, lining, settings }
    };
    await setDoc(doc(db, CHECKPOINT_COLLECTION, checkpointId), checkpoint);
    return checkpointId;
};

export const getCheckpoints = async (): Promise<SystemCheckpoint[]> => {
    if (!db) return [];
    const q = query(collection(db, CHECKPOINT_COLLECTION), orderBy("timestamp", "desc"), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map((d: any) => d.data() as SystemCheckpoint);
};

export const restoreSystemCheckpoint = async (checkpoint: SystemCheckpoint) => {
    if (!db) throw new Error("Database not connected");
    const batchSize = 500;
    const commitBatch = async (items: any[], colName: string) => {
        const chunks = [];
        for (let i = 0; i < items.length; i += batchSize) {
            chunks.push(items.slice(i, i + batchSize));
        }
        for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach((item: any) => {
                const ref = doc(db, colName, item.id);
                batch.set(ref, item);
            });
            await batch.commit();
        }
    };
    await commitBatch(checkpoint.data.reports, REPORT_COLLECTION);
    await commitBatch(checkpoint.data.quantities, QUANTITY_COLLECTION);
    await commitBatch(checkpoint.data.lining, LINING_COLLECTION);
    if (checkpoint.data.settings) {
        await setDoc(doc(db, SETTINGS_COLLECTION, 'main_settings'), checkpoint.data.settings);
    }
};

// --- DATA EXPORT ---

export const exportAllData = async () => {
    if (!db) throw new Error("Database not connected");
    const collections = [
        REPORT_COLLECTION,
        LOG_COLLECTION,
        BACKUP_COLLECTION,
        QUANTITY_COLLECTION,
        LINING_COLLECTION,
        SETTINGS_COLLECTION,
        USER_COLLECTION,
        CHECKPOINT_COLLECTION,
        TRAINING_COLLECTION,
        MOOD_COLLECTION,
        TRASH_COLLECTION,
        RAW_INPUT_COLLECTION
    ];

    const allData: Record<string, any[]> = {};

    for (const col of collections) {
        const snap = await getDocs(collection(db, col));
        allData[col] = snap.docs.map((d: any) => ({ _id: d.id, ...d.data() }));
    }
    
    // Metadata
    const exportObject = {
        meta: {
            timestamp: new Date().toISOString(),
            version: "1.0",
            exportedBy: auth?.currentUser?.uid || "unknown"
        },
        data: allData
    };

    return exportObject;
};
