
import * as _app from "firebase/app";
import * as _firestore from "firebase/firestore";
import * as _auth from "firebase/auth";
import * as _storage from "firebase/storage";
import { DailyReport, LogEntry, DPRItem, TrashItem, BackupEntry, QuantityEntry, ProjectSettings, UserProfile, LiningEntry, SystemCheckpoint, TrainingExample, UserMood } from "../types";
import { LOCATION_HIERARCHY, identifyItemType, parseQuantityDetails } from "../utils/constants";

// Configuration Loader: Read from Environment Variables and trim to prevent hidden spaces
const getEnvVar = (val: any) => typeof val === 'string' ? val.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') : val;

// Override to strictly use the "autodpr" web app config the user provided
const firebaseConfig = {
  apiKey: "AIzaSyAdC43GuYzwPVHdwHwC-WRv0gNz6IoXAb4",
  authDomain: "autodpr-469e1.firebaseapp.com",
  projectId: "autodpr-469e1",
  storageBucket: "autodpr-469e1.firebasestorage.app",
  messagingSenderId: "674910651452",
  appId: "1:674910651452:web:c02290cb6a4a336d12af39",
  measurementId: "G-7M0MVBDRY6",
  firestoreDatabaseId: "(default)"
};

// Diagnostic Logging (Safe)
console.log("Firebase Initialization Diagnostic:", {
    apiKeyLength: firebaseConfig.apiKey?.length,
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    appId: firebaseConfig.appId,
    timestamp: new Date().toISOString()
});

export const isConfigured = !!firebaseConfig.apiKey;

if (!isConfigured) {
  console.error("Firebase Configuration Error: VITE_FIREBASE_API_KEY is missing. Please set your Firebase secrets in the App Settings menu.");
}

// Workaround for potential type definition mismatches
const { initializeApp } = _app as any;
const { getFirestore, collection, doc, setDoc, deleteDoc, addDoc, getDoc, getDocs, onSnapshot, query, orderBy, limit, updateDoc, arrayUnion, where, increment, serverTimestamp, writeBatch, initializeFirestore } = _firestore as any;
const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } = _auth as any;
const { getStorage } = _storage as any;

let app;
let db: any;
let auth: any;
let storage: any;

export const missingKeys: string[] = [];

try {
  app = initializeApp(firebaseConfig);
  // Initialize Firestore with settings to ignore undefined properties
  db = initializeFirestore(app, { 
    ignoreUndefinedProperties: true 
  }, (firebaseConfig as any).firestoreDatabaseId);
  auth = getAuth(app);
  storage = getStorage(app);
  console.log("Firebase initialized with project configuration.");
} catch (error) {
  console.error("Failed to initialize Firebase:", error);
}

export { db, auth, storage };

// --- Operation Type & Quota Management ---

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export const LOCAL_PENDING_KEY = 'dpr_pending_sync';

export interface PendingWrite {
  id: string;
  type: OperationType;
  collection: string;
  docId: string;
  data: any;
  timestamp: string;
  description: string;
}

let quotaExceededCallback: ((exceeded: boolean) => void) | null = null;
export const onQuotaStatusChange = (cb: (exceeded: boolean) => void) => {
  quotaExceededCallback = cb;
};

// Internal queue management
const saveToLocalQueue = (write: PendingWrite) => {
  const existing = JSON.parse(localStorage.getItem(LOCAL_PENDING_KEY) || '[]');
  // Avoid duplicates for same docId and type
  const filtered = existing.filter((w: PendingWrite) => !(w.docId === write.docId && w.type === write.type));
  filtered.push(write);
  localStorage.setItem(LOCAL_PENDING_KEY, JSON.stringify(filtered));
  if (quotaExceededCallback) quotaExceededCallback(true);
};

export const getPendingSyncCount = () => {
  const items = JSON.parse(localStorage.getItem(LOCAL_PENDING_KEY) || '[]');
  return items.length;
};

export const clearLocalQueue = () => {
  localStorage.removeItem(LOCAL_PENDING_KEY);
};

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, data?: any) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const isQuotaError = errorMsg.includes('resource-exhausted') || errorMsg.includes('Quota exceeding') || errorMsg.includes('8 RESOURCE_EXHAUSTED');

  if (isQuotaError && data && path) {
    console.warn("Quota exceeded. Saving to local storage for future sync.");
    const collectionName = path.split('/')[0];
    const docId = path.split('/')[1] || crypto.randomUUID();
    
    saveToLocalQueue({
      id: crypto.randomUUID(),
      type: operationType,
      collection: collectionName,
      docId,
      data,
      timestamp: new Date().toISOString(),
      description: `Pending ${operationType} for ${collectionName}`
    });
    
    if (quotaExceededCallback) quotaExceededCallback(true);
    return; // Don't throw, let app think it's handled locally
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMsg,
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData.map((provider: any) => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const REPORT_COLLECTION = "daily_reports";
const LOG_COLLECTION = "activity_logs";
const MASTER_RECORD_AUDIT_COLLECTION = "master_record_audit_logs";
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
const RAW_INPUT_COLLECTION = "raw_inputs"; 
const SUB_CONTRACTOR_COLLECTION = "sub_contractors";

// --- Sync Tool ---
export const attemptSyncPendingData = async () => {
    const pending = JSON.parse(localStorage.getItem(LOCAL_PENDING_KEY) || '[]');
    if (pending.length === 0) return { success: true, count: 0 };

    console.log(`Attempting to sync ${pending.length} items...`);
    let failedCount = 0;
    const remaining: PendingWrite[] = [];

    for (const item of pending) {
        try {
            const ref = doc(db, item.collection, item.docId);
            if (item.type === OperationType.UPDATE) {
                await updateDoc(ref, item.data);
            } else {
                await setDoc(ref, item.data, { merge: true });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('resource-exhausted')) {
                remaining.push(item);
                failedCount++;
            } else {
                console.error(`Serious failure syncing item ${item.id}:`, err);
                remaining.push(item);
                failedCount++;
            }
        }
    }

    if (remaining.length === 0) {
        localStorage.removeItem(LOCAL_PENDING_KEY);
        if (failedCount === 0 && quotaExceededCallback) quotaExceededCallback(false);
        return { success: true, count: pending.length };
    } else {
        localStorage.setItem(LOCAL_PENDING_KEY, JSON.stringify(remaining));
        return { success: false, count: pending.length - failedCount, remaining: failedCount };
    }
};

// --- Authentication & Profile ---

export const signInWithGoogle = async () => {
  if (!auth) throw new Error("Authentication service not initialized");
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const userRef = doc(db, USER_COLLECTION, result.user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const profileData = {
        uid: result.user.uid,
        displayName: result.user.displayName,
        email: result.user.email,
        totalEntries: 0,
        totalDays: 1,
        level: 1,
        xp: 0,
        joinedDate: new Date().toISOString()
      };
      try {
          await setDoc(userRef, profileData);
      } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `${USER_COLLECTION}/${result.user.uid}`, profileData);
      }
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
    try {
        await updateDoc(userRef, {
            totalEntries: increment(entriesCount),
            xp: increment(entriesCount * 5)
        });
    } catch (err) {
        // Stats increment is not critical enough for local backup, just log but bypass error
        console.warn("Stats increment failed (likely quota).");
    }
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
  try {
      await setDoc(doc(db, MOOD_COLLECTION, docId), moodData);
  } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${MOOD_COLLECTION}/${docId}`, moodData);
  }
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
  }, (err) => {
      if (err.message.includes('resource-exhausted')) {
          if (quotaExceededCallback) quotaExceededCallback(true);
      }
  });
};

export const saveReportToCloud = async (report: DailyReport) => {
  if (!db) return;
  try {
      const ref = doc(db, REPORT_COLLECTION, report.id);
      await setDoc(ref, report, { merge: true });
  } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${REPORT_COLLECTION}/${report.id}`, report);
  }
};

export const deleteReportFromCloud = async (reportId: string) => {
    if (!db) return;
    try {
        await deleteDoc(doc(db, REPORT_COLLECTION, reportId));
    } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `${REPORT_COLLECTION}/${reportId}`, { id: reportId, deleted: true });
    }
};

export const mergeReportsInCloud = async (sourceReportId: string, targetReportId: string) => {
    if (!db) return;
    const sourceRef = doc(db, REPORT_COLLECTION, sourceReportId);
    const targetRef = doc(db, REPORT_COLLECTION, targetReportId);
    
    try {
        const sourceSnap = await getDoc(sourceRef);
        const targetSnap = await getDoc(targetRef);
        
        if (!sourceSnap.exists() || !targetSnap.exists()) return;
        
        const sourceData = sourceSnap.data() as DailyReport;
        const targetData = targetSnap.data() as DailyReport;
        
        const mergedEntries = [...targetData.entries, ...sourceData.entries];
        const dataToUpdate = {
            entries: mergedEntries,
            lastUpdated: new Date().toISOString()
        };
        
        await updateDoc(targetRef, dataToUpdate);
        await deleteDoc(sourceRef);
    } catch (err) {
        console.error("Merge failed", err);
        // Not attempting local backup for merge, complex
    }
};

export const logMasterRecordChange = async (recordId: string, userId: string, userName: string, field: string, oldValue: string, newValue: string) => {
    if(!db) return;
    const data = {
        recordId,
        userId,
        userName,
        timestamp: new Date().toISOString(),
        field,
        oldValue,
        newValue
    };
    try {
        await addDoc(collection(db, MASTER_RECORD_AUDIT_COLLECTION), data);
    } catch (err) {
        // Audit log is secondary, skip backup for now
    }
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
  
  try {
      await setDoc(doc(db, LOG_COLLECTION, entry.id), entry);
  } catch (err) {
      // Local backup for activity logs to ensure history
      handleFirestoreError(err, OperationType.CREATE, `${LOG_COLLECTION}/${entry.id}`, entry);
  }
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
    console.log("getRawInputsForDate called with:", typeof date, date);
    
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

export const savePermanentBackup = async (date: string, rawText: string, parsedItems: DPRItem[], user: string, reportIdContext: string, manualId?: string) => {
    if (!db) return null;
    const id = manualId || crypto.randomUUID();
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
    console.log("getBackups called with:", typeof startDate, startDate, typeof endDate, endDate);
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

// --- Sub-Contractors ---

export const subscribeToSubContractors = (callback: (scs: any[]) => void): any => {
    if (!db) return () => {};
    const q = query(collection(db, SUB_CONTRACTOR_COLLECTION), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot: any) => {
        const items = snapshot.docs.map((doc: any) => doc.data());
        callback(items);
    });
};

export const saveSubContractor = async (sc: any) => {
    if (!db) return;
    await setDoc(doc(db, SUB_CONTRACTOR_COLLECTION, sc.id), sc);
};

export const deleteSubContractor = async (id: string) => {
    if (!db) return;
    await deleteDoc(doc(db, SUB_CONTRACTOR_COLLECTION, id));
};

// --- System Checkpoints ---

export const createSystemCheckpoint = async (user: string, isMajor: boolean = false): Promise<string> => {
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
        name: `${isMajor ? '[MAJOR] ' : ''}Checkpoint ${new Date().toLocaleDateString()}`,
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

export const repairHistoricalDates = async () => {
    if (!db) return;

    // Helper to fetch fresh state
    const getReports = async () => {
        const reportsSnap = await getDocs(collection(db, REPORT_COLLECTION));
        return reportsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as DailyReport));
    };

    let reports = await getReports();

    // Define the shifts
    const shifts = [
        { from: '2026-04-16', to: '2026-04-15' },
        { from: '2026-04-17', to: '2026-04-16' },
        { from: '2026-04-18', to: '2026-04-17' },
    ];
    
    for (const shift of shifts) {
        console.log(`Processing shift: ${shift.from} to ${shift.to}`);
        // Refetch source reports based on new perspective
        const sourceReports = reports.filter(r => r.date === shift.from);
        console.log(`Found ${sourceReports.length} source reports for ${shift.from}`);
        if (sourceReports.length === 0) continue;

        for (const sourceReport of sourceReports) {
            console.log(`Moving report ${sourceReport.id} with ${sourceReport.entries.length} entries`);
            // Find target report
            let targetReport = reports.find(r => r.date === shift.to);
            
            if (targetReport) {
                console.log(`Appending to existing target report ${targetReport.id}`);
                // Append entries to existing target report
                targetReport.entries = [...targetReport.entries, ...sourceReport.entries];
                targetReport.lastUpdated = new Date().toISOString();
                await saveReportToCloud(targetReport);
            } else {
                console.log(`Creating new target report for ${shift.to}`);
                // Create new report for target date with source entries
                const newReport: DailyReport = {
                    ...sourceReport,
                    id: `${shift.to}_${crypto.randomUUID()}`,
                    date: shift.to,
                    lastUpdated: new Date().toISOString()
                };
                targetReport = newReport;
                reports.push(newReport); // Add to local reports array
                await saveReportToCloud(newReport);
            }

            // Delete source report to make it empty
            console.log(`Deleting source report ${sourceReport.id}`);
            await deleteReportFromCloud(sourceReport.id);
        }
        // Refresh local reports state after each shift
        reports = await getReports();
    }
    alert("Historical dates shifted successfully.");
};

export const addEntriesToReport = async (date: string, entries: DPRItem[]) => {
    if (!db) return;
    const reportsSnap = await getDocs(query(collection(db, REPORT_COLLECTION), where("date", "==", date)));
    let reportId = "";
    let existingEntries: DPRItem[] = [];

    if (!reportsSnap.empty) {
        const doc = reportsSnap.docs[0];
        const report = doc.data() as DailyReport;
        reportId = doc.id;
        existingEntries = report.entries;
    } else {
        reportId = `${date}_${crypto.randomUUID()}`;
    }

    const updatedEntries = [...existingEntries, ...entries];
    const reportData: DailyReport = {
        id: reportId,
        date: date,
        lastUpdated: new Date().toISOString(),
        projectTitle: "Bhotekoshi Hydroelectric Project",
        entries: updatedEntries
    };

    await saveReportToCloud(reportData);
};

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
