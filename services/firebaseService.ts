
import * as _app from "firebase/app";
import * as _firestore from "firebase/firestore";
import * as _auth from "firebase/auth";
import { DailyReport, LogEntry, DPRItem, TrashItem, BackupEntry, QuantityEntry, ProjectSettings, UserProfile, UserMood } from "../types";
import { LOCATION_HIERARCHY, identifyItemType, parseQuantityDetails } from "../utils/constants";

// Workaround for potential type definition mismatches
const { initializeApp } = _app as any;
const { getFirestore, collection, doc, setDoc, deleteDoc, addDoc, getDoc, getDocs, onSnapshot, query, orderBy, limit, updateDoc, arrayUnion, where, increment } = _firestore as any;
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

// --- Authentication & Profile ---

export const signInWithGoogle = async () => {
  if (!auth) throw new Error("Authentication service not initialized.");
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    await updateUserProfile(result.user);
    return result.user;
  } catch (error) {
    console.error("Error signing in", error);
    throw error;
  }
};

const updateUserProfile = async (user: any) => {
    if(!db || !user) return;
    const userRef = doc(db, USER_COLLECTION, user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
        const newProfile: UserProfile = {
            uid: user.uid,
            displayName: user.displayName || 'User',
            email: user.email || '',
            totalEntries: 0,
            totalDays: 0,
            level: 1,
            xp: 0,
            joinedDate: new Date().toISOString()
        };
        await setDoc(userRef, newProfile);
    }
}

export const incrementUserStats = async (uid: string, entriesCount: number, extraXp: number = 0) => {
    if(!db || !uid) return;
    const userRef = doc(db, USER_COLLECTION, uid);
    try {
        await updateDoc(userRef, {
            totalEntries: increment(entriesCount),
            xp: increment((entriesCount * 10) + extraXp)
        });
    } catch(e) {
        console.error("Failed to update stats", e);
    }
};

export const subscribeToUserProfile = (uid: string, onUpdate: (profile: UserProfile) => void): Unsubscribe => {
    if (!db || !uid) return () => {};
    return onSnapshot(doc(db, USER_COLLECTION, uid), (doc: any) => {
        if(doc.exists()) onUpdate(doc.data() as UserProfile);
    });
};

export const logoutUser = async () => {
  if (!auth) return;
  await signOut(auth);
};

export const subscribeToAuth = (callback: (user: User | null) => void): Unsubscribe => {
  if (!auth) { callback(null); return () => {}; }
  return onAuthStateChanged(auth, callback);
};

// --- Settings ---

export const getProjectSettings = async (): Promise<ProjectSettings | null> => {
    if(!db) return null;
    try {
        const docSnap = await getDoc(doc(db, SETTINGS_COLLECTION, 'general'));
        if(docSnap.exists()) return docSnap.data() as ProjectSettings;
        return {
            projectName: 'Bhotekoshi Hydroelectric Project',
            projectDescription: 'Construction Management',
            locationHierarchy: LOCATION_HIERARCHY,
            customItems: []
        };
    } catch(e) { return null; }
};

export const saveProjectSettings = async (settings: ProjectSettings) => {
    if(!db) return;
    await setDoc(doc(db, SETTINGS_COLLECTION, 'general'), settings);
};

// --- Reports ---

export const subscribeToReports = (onUpdate: (reports: DailyReport[]) => void): Unsubscribe => {
  if (!db) return () => {};
  const q = query(collection(db, REPORT_COLLECTION), orderBy("date", "desc"));
  return onSnapshot(q, (snapshot: any) => {
    const reports: DailyReport[] = [];
    snapshot.forEach((doc: any) => reports.push(doc.data() as DailyReport));
    onUpdate(reports);
  });
};

export const saveReportToCloud = async (report: DailyReport): Promise<void> => {
  if (!db) return;
  await setDoc(doc(db, REPORT_COLLECTION, report.id), report);
};

export const saveReportHistory = async (report: DailyReport) => {
    if (!db) return;
    const historyId = crypto.randomUUID();
    await setDoc(doc(db, REPORT_HISTORY_COLLECTION, historyId), {
        historyId, timestamp: new Date().toISOString(), reportId: report.id, reportDate: report.date, snapshot: report
    });
};

// --- Sync Logic (One Shot) ---

export const syncQuantitiesFromItems = async (items: DPRItem[], report: DailyReport, user: string) => {
    if(!db) return;
    let added = 0;
    
    // We only process items that have valid quantity data
    for (const item of items) {
        // 1. Identify Type & Parse
        const type = identifyItemType(item.activityDescription);
        
        // Use explicit fields if available, otherwise parse
        let structure = item.component || "";
        let element = item.structuralElement || "";
        let chainage = item.chainage || "";
        
        // Fallback parsing if explicit fields are empty
        if (!element || !chainage) {
             const parsed = parseQuantityDetails(item.location, item.component, item.chainageOrArea, item.activityDescription);
             if(!structure) structure = parsed.structure;
             if(!element) element = parsed.detailElement || "";
             if(!chainage) chainage = parsed.detailLocation || "";
        }

        // 2. Extract Number/Unit
        const regex = /(\d+(\.\d+)?)\s*(m3|cum|sqm|sq\.m|m2|m|mtr|nos|t|ton|kg)/i;
        const match = item.activityDescription.match(regex);
        
        if (match) {
            let val = parseFloat(match[1]);
            let unit = match[3].toLowerCase();
            const raw = match[0];

            if (unit === 'cum') unit = 'm3';
            if (unit === 'sqm' || unit === 'sq.m') unit = 'm2';
            if (unit === 'mtr') unit = 'm';
            if (unit === 't') unit = 'Ton';
            if (type === 'Rebar' && unit === 'kg') { val = val / 1000; unit = 'Ton'; }

            // Check duplicate by linking to report item ID
            const q = query(collection(db, QUANTITY_COLLECTION), where("originalReportItemId", "==", item.id));
            const snap = await getDocs(q);
            
            if(snap.empty) {
                const newQty: QuantityEntry = {
                    id: crypto.randomUUID(),
                    date: report.date,
                    location: item.location,
                    structure: structure,
                    detailElement: element,
                    detailLocation: chainage,
                    itemType: type,
                    description: item.activityDescription,
                    quantityValue: val,
                    quantityUnit: unit,
                    originalRawString: raw,
                    originalReportItemId: item.id,
                    reportId: report.id,
                    lastUpdated: new Date().toISOString(),
                    updatedBy: user || 'Auto-Sync'
                };
                await setDoc(doc(db, QUANTITY_COLLECTION, newQty.id), newQty);
                added++;
            } else {
                // Update existing if changed (Silent Update)
                const existing = snap.docs[0].data() as QuantityEntry;
                if(existing.quantityValue !== val || existing.location !== item.location || existing.structure !== structure) {
                     await updateDoc(doc(db, QUANTITY_COLLECTION, existing.id), {
                         quantityValue: val,
                         quantityUnit: unit,
                         location: item.location,
                         structure: structure,
                         description: item.activityDescription,
                         lastUpdated: new Date().toISOString()
                     });
                }
            }
        }
    }
    return added;
};


// --- Quantities ---

export const subscribeToQuantities = (onUpdate: (quantities: QuantityEntry[]) => void): Unsubscribe => {
  if (!db) return () => {};
  const q = query(collection(db, QUANTITY_COLLECTION), orderBy("date", "desc"));
  return onSnapshot(q, (snapshot: any) => {
    const items: QuantityEntry[] = [];
    snapshot.forEach((doc: any) => items.push(doc.data() as QuantityEntry));
    onUpdate(items);
  });
};

export const addQuantity = async (quantity: QuantityEntry) => {
  if (!db) return;
  await setDoc(doc(db, QUANTITY_COLLECTION, quantity.id), quantity);
};

export const updateQuantity = async (quantity: QuantityEntry, previousState: QuantityEntry, user: string) => {
  if(!db) return;
  await setDoc(doc(db, QUANTITY_COLLECTION, quantity.id), quantity);
  await logActivity(user, "Edit Quantity", JSON.stringify({ before: previousState, after: quantity }), quantity.date);
  
  if (quantity.reportId && quantity.originalReportItemId) {
        if (quantity.location !== previousState.location || quantity.structure !== previousState.structure) {
            const reportRef = doc(db, REPORT_COLLECTION, quantity.reportId);
            const reportSnap = await getDoc(reportRef);
            if (reportSnap.exists()) {
                const reportData = reportSnap.data() as DailyReport;
                const updatedEntries = reportData.entries.map((entry) => {
                    if (entry.id === quantity.originalReportItemId) {
                        return { ...entry, location: quantity.location, component: quantity.structure };
                    }
                    return entry;
                });
                await updateDoc(reportRef, { entries: updatedEntries });
            }
        }
    }
}

export const deleteQuantity = async (quantity: QuantityEntry, user: string) => {
  if (!db) return;
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
  await deleteDoc(doc(db, QUANTITY_COLLECTION, quantity.id));
}

// --- Backup ---
export const savePermanentBackup = async (date: string, rawInput: string, parsedItems: DPRItem[], user: string, reportIdContext: string): Promise<string | null> => {
  if (!db) return null;
  const backupId = crypto.randomUUID();
  const backupEntry: BackupEntry = { id: backupId, date, timestamp: new Date().toISOString(), user: user || "Anonymous", rawInput, parsedItems, reportIdContext };
  await setDoc(doc(db, BACKUP_COLLECTION, backupId), backupEntry);
  return backupId;
};

export const getBackups = async (limitCount = 50, startDate?: string, endDate?: string): Promise<BackupEntry[]> => {
  if (!db) return [];
  let q = query(collection(db, BACKUP_COLLECTION), orderBy("timestamp", "desc"));
  if (startDate && endDate) {
      q = query(collection(db, BACKUP_COLLECTION), where("date", ">=", startDate), where("date", "<=", endDate), orderBy("date", "desc"));
  } else {
      q = query(q, limit(limitCount));
  }
  const snapshot = await getDocs(q);
  const backups: BackupEntry[] = [];
  snapshot.forEach((doc: any) => backups.push(doc.data() as BackupEntry));
  return backups;
};

// --- Trash ---
export const moveReportToTrash = async (report: DailyReport, user: string): Promise<void> => {
  if (!db) return;
  const trashItem: TrashItem = { trashId: crypto.randomUUID(), originalId: report.id, type: 'report', content: report, deletedAt: new Date().toISOString(), deletedBy: user, reportDate: report.date };
  await setDoc(doc(db, TRASH_COLLECTION, trashItem.trashId), trashItem);
  await deleteDoc(doc(db, REPORT_COLLECTION, report.id));
};

export const moveItemToTrash = async (item: DPRItem, reportId: string, reportDate: string, user: string): Promise<void> => {
  if (!db) return;
  const trashItem: TrashItem = { trashId: crypto.randomUUID(), originalId: item.id, type: 'item', content: item, deletedAt: new Date().toISOString(), deletedBy: user, reportDate: reportDate, reportId: reportId };
  await setDoc(doc(db, TRASH_COLLECTION, trashItem.trashId), trashItem);
};

export const deleteReportFromCloud = async (id: string): Promise<void> => {
  if (!db) return;
  await deleteDoc(doc(db, REPORT_COLLECTION, id));
};

export const subscribeToTrash = (onUpdate: (items: TrashItem[]) => void): Unsubscribe => {
  if (!db) return () => {};
  const q = query(collection(db, TRASH_COLLECTION), orderBy("deletedAt", "desc"));
  return onSnapshot(q, (snapshot: any) => {
    const items: TrashItem[] = [];
    snapshot.forEach((doc: any) => items.push(doc.data() as TrashItem));
    onUpdate(items);
  });
};

export const restoreTrashItem = async (trashItem: TrashItem): Promise<void> => {
  if (!db) return;
  if (trashItem.type === 'report') {
    const report = trashItem.content as DailyReport;
    await setDoc(doc(db, REPORT_COLLECTION, report.id), report);
  } else if (trashItem.type === 'item') {
    const item = trashItem.content as DPRItem;
    const reportId = trashItem.reportId;
    if (reportId) {
        const reportRef = doc(db, REPORT_COLLECTION, reportId);
        const reportSnap = await getDoc(reportRef);
        if (reportSnap.exists()) {
             await updateDoc(reportRef, { entries: arrayUnion(item) });
        }
    }
  } else if (trashItem.type === 'quantity') {
      const quantity = trashItem.content as QuantityEntry;
      await setDoc(doc(db, QUANTITY_COLLECTION, quantity.id), quantity);
  }
  await deleteDoc(doc(db, TRASH_COLLECTION, trashItem.trashId));
};

// --- Logs ---
export const logActivity = async (user: string, action: string, details: string, reportDate: string, relatedBackupId?: string) => {
  if (!db) return;
  const log: any = { timestamp: new Date().toISOString(), user: user || "Anonymous", action, details, reportDate };
  if (relatedBackupId) log.relatedBackupId = relatedBackupId;
  await addDoc(collection(db, LOG_COLLECTION), log);
};

export const subscribeToLogs = (onUpdate: (logs: LogEntry[]) => void): Unsubscribe => {
  if (!db) return () => {};
  const q = query(collection(db, LOG_COLLECTION), orderBy("timestamp", "desc"), limit(100));
  return onSnapshot(q, (snapshot: any) => {
    const logs: LogEntry[] = [];
    snapshot.forEach((doc: any) => logs.push({ ...doc.data(), id: doc.id } as LogEntry));
    onUpdate(logs);
  });
};

// --- MOOD (FRESH APPROACH) ---

export const saveUserMood = async (uid: string, mood: UserMood['mood'], note?: string) => {
  if (!db) return;
  
  // Create a deterministic ID based on Date + UID. 
  // This prevents race conditions or duplicates for a single day.
  const todayKey = new Date().toISOString().split('T')[0]; // "2025-01-20"
  const docId = `mood_${uid}_${todayKey}`;

  const docRef = doc(db, MOOD_COLLECTION, docId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
      // Just update the mood if they changed their mind
      await updateDoc(docRef, {
          mood,
          note,
          timestamp: new Date().toISOString()
      });
  } else {
      // New Entry for today
      const entry: UserMood = {
        id: docId,
        uid,
        timestamp: new Date().toISOString(),
        mood,
        note
      };
      await setDoc(docRef, entry);
      
      // Award Stats (Safely increment)
      const userRef = doc(db, USER_COLLECTION, uid);
      await updateDoc(userRef, {
          totalDays: increment(1),
          xp: increment(50)
      });
  }
};

export const subscribeToTodayMood = (uid: string, onUpdate: (mood: UserMood | null) => void): Unsubscribe => {
    if (!db || !uid) return () => {};
    const todayKey = new Date().toISOString().split('T')[0];
    const docId = `mood_${uid}_${todayKey}`;
    
    return onSnapshot(doc(db, MOOD_COLLECTION, docId), (doc: any) => {
        if(doc.exists()) {
            onUpdate(doc.data() as UserMood);
        } else {
            onUpdate(null);
        }
    });
};

export const subscribeToUserMoods = (uid: string, onUpdate: (moods: UserMood[]) => void): Unsubscribe => {
  if (!db || !uid) return () => {};
  const q = query(collection(db, MOOD_COLLECTION), where("uid", "==", uid), orderBy("timestamp", "desc"), limit(20));
  return onSnapshot(q, (snapshot: any) => {
    const items: UserMood[] = [];
    snapshot.forEach((doc: any) => items.push(doc.data() as UserMood));
    onUpdate(items);
  });
};
