
import * as _app from "firebase/app";
import * as _firestore from "firebase/firestore";
import * as _auth from "firebase/auth";
import { DailyReport, LogEntry, DPRItem, TrashItem, BackupEntry, QuantityEntry, ProjectSettings, UserProfile, UserMood, LiningEntry } from "../types";
import { LOCATION_HIERARCHY, identifyItemType, parseQuantityDetails } from "../utils/constants";

// Workaround for potential type definition mismatches
const { initializeApp } = _app as any;
const { getFirestore, collection, doc, setDoc, deleteDoc, addDoc, getDoc, getDocs, onSnapshot, query, orderBy, limit, updateDoc, arrayUnion, where, increment, serverTimestamp, writeBatch } = _firestore as any;
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

const missingKeys = Object.entries(firebaseConfig)
  .filter(([key, value]) => !value && key !== 'measurementId') 
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.error(`Firebase Configuration Error: Missing: ${missingKeys.join(', ')}.`);
}

let app;
let db: any;
let auth: any;

if (missingKeys.length === 0) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
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
const MOOD_COLLECTION = "user_moods";
const LINING_COLLECTION = "lining_data";

// --- Authentication & Profile ---

export const signInWithGoogle = async () => {
  if (!auth) throw new Error("Authentication service not initialized");
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    // Initialize profile if new
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

export const subscribeToAuth = (callback: (user: User | null) => void): Unsubscribe => {
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
    // Logic: 10 entries = 10 XP. 100 XP = Level Up.
    // We do simple increment here. Cloud functions usually better for leveling up logic but we do client side for simple demo.
    await updateDoc(userRef, {
        totalEntries: increment(entriesCount),
        xp: increment(entriesCount * 5)
        // Level logic would be computed on read or via another update, keeping it simple here.
    });
};

// --- Reports ---

export const subscribeToReports = (callback: (reports: DailyReport[]) => void): Unsubscribe => {
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
    // Save a version
    await addDoc(collection(db, REPORT_HISTORY_COLLECTION), {
        reportId: report.id,
        date: report.date,
        entries: report.entries,
        timestamp: new Date().toISOString()
    });
};

// --- Activity Logs ---

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

export const subscribeToLogs = (callback: (logs: LogEntry[]) => void): Unsubscribe => {
  if (!db) return () => {};
  const q = query(collection(db, LOG_COLLECTION), orderBy("timestamp", "desc"), limit(100));
  return onSnapshot(q, (snapshot: any) => {
    const logs = snapshot.docs.map((doc: any) => doc.data() as LogEntry);
    callback(logs);
  });
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

export const subscribeToTrash = (callback: (items: TrashItem[]) => void): Unsubscribe => {
    if (!db) return () => {};
    const q = query(collection(db, TRASH_COLLECTION), orderBy("deletedAt", "desc"));
    return onSnapshot(q, (snapshot: any) => {
        const items = snapshot.docs.map((doc: any) => doc.data() as TrashItem);
        callback(items);
    });
};

export const restoreTrashItem = async (item: TrashItem) => {
    if (!db) return;
    
    // 1. Restore content based on type
    if (item.type === 'report') {
        await saveReportToCloud(item.content as DailyReport);
    } else if (item.type === 'item') {
        // We need to fetch the report and add the item back
        const reportRef = doc(db, REPORT_COLLECTION, item.reportId);
        const reportSnap = await getDoc(reportRef);
        if (reportSnap.exists()) {
            const report = reportSnap.data() as DailyReport;
            // Check if item already exists to avoid dupes
            if (!report.entries.find(e => e.id === item.originalId)) {
                const updatedEntries = [...report.entries, item.content as DPRItem];
                await updateDoc(reportRef, { entries: updatedEntries });
            }
        } else {
             // Report doesn't exist? recreate it maybe? For now just warn.
             console.warn("Report for this item no longer exists. Cannot restore item to void.");
             throw new Error("Parent report not found");
        }
    } else if (item.type === 'quantity') {
        await updateQuantity(item.content as QuantityEntry, undefined, "System Restore");
    }

    // 2. Remove from trash
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
         // Firestore range queries on string dates work if ISO format
         // Note: Might need composite index. If fails, do client side filtering.
         q = query(collection(db, BACKUP_COLLECTION), where("date", ">=", startDate), where("date", "<=", endDate), orderBy("date", "desc"));
    }

    const snap = await getDocs(q);
    return snap.docs.map((d: any) => d.data() as BackupEntry);
};

// --- Quantities ---

export const subscribeToQuantities = (callback: (qty: QuantityEntry[]) => void): Unsubscribe => {
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
    
    // Add to trash first
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

    // Delete
    await deleteDoc(doc(db, QUANTITY_COLLECTION, qty.id));
    logActivity(user || "System", "Delete Quantity", `Deleted ${qty.itemType} at ${qty.location}`, qty.date);
};

export const syncQuantitiesFromItems = async (items: DPRItem[], report: DailyReport, user: string) => {
    if (!db) return;

    const batch = [];
    
    for (const item of items) {
        const itemType = identifyItemType(item.activityDescription);
        const qtyMatch = item.activityDescription.match(/(\d+(\.\d+)?)\s*(m3|cum|ton|mt|nos|sqm|m2)/i);
        
        if (qtyMatch || itemType !== "Other") {
            const val = qtyMatch ? parseFloat(qtyMatch[1]) : 0;
            const unit = qtyMatch ? qtyMatch[3].toLowerCase() : 'unit';
            
            if (val > 0 || itemType !== "Other") {
                const parsed = parseQuantityDetails(item.location, item.component, item.chainageOrArea, item.activityDescription);
                const qtyId = `qty_${item.id}`;
                
                const entry: QuantityEntry = {
                    id: qtyId,
                    date: report.date,
                    location: item.location,
                    structure: parsed.structure,
                    detailElement: parsed.detailElement,
                    detailLocation: parsed.detailLocation,
                    itemType: itemType,
                    description: item.activityDescription,
                    quantityValue: val,
                    quantityUnit: unit,
                    originalRawString: item.activityDescription,
                    originalReportItemId: item.id,
                    reportId: report.id,
                    lastUpdated: new Date().toISOString(),
                    updatedBy: user
                };
                batch.push(setDoc(doc(db, QUANTITY_COLLECTION, qtyId), entry));
            }
        }
    }
    await Promise.all(batch);
};

// --- Lining Data ---

export const subscribeToLining = (callback: (entries: LiningEntry[]) => void): Unsubscribe => {
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

// --- User Mood ---

export const saveUserMood = async (uid: string, mood: 'Happy' | 'Excited' | 'Tired' | 'Frustrated' | 'Sad', note?: string) => {
  if (!db) return;
  const today = new Date().toISOString().split('T')[0];
  const moodEntry: UserMood = {
    id: `${uid}_${today}`,
    uid,
    mood,
    note,
    timestamp: new Date().toISOString()
  };
  await setDoc(doc(db, MOOD_COLLECTION, moodEntry.id), moodEntry);
};

export const subscribeToTodayMood = (uid: string, callback: (mood: UserMood | null) => void): Unsubscribe => {
  if (!db) return () => {};
  const today = new Date().toISOString().split('T')[0];
  return onSnapshot(doc(db, MOOD_COLLECTION, `${uid}_${today}`), (doc: any) => {
    if (doc.exists()) callback(doc.data() as UserMood);
    else callback(null);
  });
};
