
import * as _app from "firebase/app";
import * as _firestore from "firebase/firestore";
import * as _auth from "firebase/auth";
import { DailyReport, LogEntry, DPRItem, TrashItem, BackupEntry, QuantityEntry, ProjectSettings, UserProfile } from "../types";

const { initializeApp } = _app as any;
const { getFirestore, collection, doc, setDoc, deleteDoc, addDoc, getDoc, getDocs, onSnapshot, query, orderBy, limit, updateDoc, arrayUnion, where, increment } = _firestore as any;
const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } = _auth as any;

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.measurementId
};

let app = initializeApp(firebaseConfig);
let db = getFirestore(app);
let auth = getAuth(app);

const REPORT_COLLECTION = "daily_reports";
const LOG_COLLECTION = "activity_logs";
const TRASH_COLLECTION = "trash_bin";
const BACKUP_COLLECTION = "permanent_backups";
const QUANTITY_COLLECTION = "quantities";
const SETTINGS_COLLECTION = "project_settings";
const PROFILES_COLLECTION = "user_profiles";

// --- Profiles ---
export const getOrUpdateProfile = async (user: any): Promise<UserProfile> => {
  const docRef = doc(db, PROFILES_COLLECTION, user.uid);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return snap.data() as UserProfile;
  } else {
    const profile: UserProfile = {
      uid: user.uid,
      displayName: user.displayName || 'Anonymous',
      email: user.email,
      photoURL: user.photoURL,
      joinDate: new Date().toISOString(),
      entryCount: 0,
      exp: 0,
      level: 1
    };
    await setDoc(docRef, profile);
    return profile;
  }
};

export const incrementUserStats = async (uid: string, itemsCount: number) => {
  const docRef = doc(db, PROFILES_COLLECTION, uid);
  const expGain = itemsCount * 10;
  await updateDoc(docRef, {
    entryCount: increment(itemsCount),
    exp: increment(expGain)
  });
  // Check level up logic after gain
  const snap = await getDoc(docRef);
  const data = snap.data();
  const nextLevel = Math.floor(data.exp / 100) + 1;
  if (nextLevel > data.level) {
    await updateDoc(docRef, { level: nextLevel });
  }
};

// --- Settings ---
export const subscribeToSettings = (callback: (settings: ProjectSettings) => void) => {
  return onSnapshot(doc(db, SETTINGS_COLLECTION, "global_config"), (snap: any) => {
    if (snap.exists()) callback(snap.data() as ProjectSettings);
  });
};

export const saveProjectSettings = async (settings: ProjectSettings) => {
  await setDoc(doc(db, SETTINGS_COLLECTION, "global_config"), settings);
};

// --- Reports, Quantities, Logs, etc (Inherited from previous state) ---
export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
};
export const logoutUser = () => signOut(auth);
export const subscribeToAuth = (cb: any) => onAuthStateChanged(auth, cb);

export const subscribeToReports = (onUpdate: any) => onSnapshot(query(collection(db, REPORT_COLLECTION), orderBy("date", "desc")), (snap: any) => onUpdate(snap.docs.map((d: any) => d.data())));
export const saveReportToCloud = (report: any) => setDoc(doc(db, REPORT_COLLECTION, report.id), report);

export const subscribeToQuantities = (onUpdate: any) => onSnapshot(query(collection(db, QUANTITY_COLLECTION), orderBy("date", "desc")), (snap: any) => onUpdate(snap.docs.map((d: any) => d.data())));
export const addQuantity = (q: any) => setDoc(doc(db, QUANTITY_COLLECTION, q.id), q);
export const updateQuantity = (q: any, p: any, u: any) => setDoc(doc(db, QUANTITY_COLLECTION, q.id), q);
export const deleteQuantity = (q: any, u: any) => deleteDoc(doc(db, QUANTITY_COLLECTION, q.id));

export const savePermanentBackup = async (d: string, r: string, p: any[], u: string, c: string) => {
  const id = crypto.randomUUID();
  await setDoc(doc(db, BACKUP_COLLECTION, id), { id, date: d, timestamp: new Date().toISOString(), user: u, rawInput: r, parsedItems: p, reportIdContext: c });
  return id;
};
export const getBackups = async (l = 50, s?: string, e?: string) => {
  let q = query(collection(db, BACKUP_COLLECTION), orderBy("timestamp", "desc"), limit(l));
  const snap = await getDocs(q);
  return snap.docs.map((d: any) => d.data());
};

export const logActivity = (u: string, a: string, d: string, r: string, b?: string) => addDoc(collection(db, LOG_COLLECTION), { timestamp: new Date().toISOString(), user: u, action: a, details: d, reportDate: r, relatedBackupId: b });
export const subscribeToLogs = (onUpdate: any) => onSnapshot(query(collection(db, LOG_COLLECTION), orderBy("timestamp", "desc"), limit(100)), (snap: any) => onUpdate(snap.docs.map((d: any) => ({ ...d.data(), id: d.id }))));
export const subscribeToTrash = (onUpdate: any) => onSnapshot(query(collection(db, TRASH_COLLECTION), orderBy("deletedAt", "desc")), (snap: any) => onUpdate(snap.docs.map((d: any) => d.data())));
export const moveItemToTrash = (item: any, rid: string, rd: string, u: string) => setDoc(doc(db, TRASH_COLLECTION, crypto.randomUUID()), { originalId: item.id, type: 'item', content: item, deletedAt: new Date().toISOString(), deletedBy: u, reportDate: rd, reportId: rid });
export const moveReportToTrash = (report: any, u: string) => setDoc(doc(db, TRASH_COLLECTION, crypto.randomUUID()), { originalId: report.id, type: 'report', content: report, deletedAt: new Date().toISOString(), deletedBy: u, reportDate: report.date });
export const restoreTrashItem = async (t: any) => {
  if (t.type === 'report') await setDoc(doc(db, REPORT_COLLECTION, t.content.id), t.content);
  else if (t.type === 'item') {
    const ref = doc(db, REPORT_COLLECTION, t.reportId);
    const snap = await getDoc(ref);
    if (snap.exists()) await updateDoc(ref, { entries: arrayUnion(t.content) });
  }
  await deleteDoc(doc(db, TRASH_COLLECTION, t.trashId));
};
export const saveReportHistory = (r: any) => setDoc(doc(db, "report_history", crypto.randomUUID()), { timestamp: new Date().toISOString(), snapshot: r });
