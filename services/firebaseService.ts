import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, deleteDoc, addDoc, onSnapshot, query, orderBy, limit, Unsubscribe } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { DailyReport, LogEntry } from "../types";

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

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (error) {
  console.error("Failed to initialize Firebase:", error);
}

const REPORT_COLLECTION = "daily_reports";
const LOG_COLLECTION = "activity_logs";

// --- Authentication ---

export const signInWithGoogle = async () => {
  if (!auth) throw new Error("Auth not initialized");
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

export const deleteReportFromCloud = async (id: string): Promise<void> => {
  if (!db) return;
  try {
    await deleteDoc(doc(db, REPORT_COLLECTION, id));
  } catch (e) {
    console.error("Error deleting document: ", e);
    throw e;
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