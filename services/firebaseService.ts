import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, Unsubscribe, Firestore } from "firebase/firestore";
import { DailyReport } from "../types";

let db: Firestore | null = null;

const getDB = (): Firestore | null => {
  if (db) return db;

  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  };

  // Check if config is present before initializing to avoid crash
  if (!firebaseConfig.apiKey) {
    console.warn("Firebase configuration missing. Cloud sync disabled.");
    return null;
  }

  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    return db;
  } catch (e) {
    console.error("Error initializing Firebase:", e);
    return null;
  }
};

const COLLECTION_NAME = "daily_reports";

export const subscribeToReports = (onUpdate: (reports: DailyReport[]) => void): Unsubscribe => {
  const database = getDB();
  if (!database) return () => {};
  
  const q = query(collection(database, COLLECTION_NAME), orderBy("date", "desc"));
  
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
  const database = getDB();
  if (!database) return;
  try {
    await setDoc(doc(database, COLLECTION_NAME, report.id), report);
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
};

export const deleteReportFromCloud = async (id: string): Promise<void> => {
  const database = getDB();
  if (!database) return;
  try {
    await deleteDoc(doc(database, COLLECTION_NAME, id));
  } catch (e) {
    console.error("Error deleting document: ", e);
    throw e;
  }
};