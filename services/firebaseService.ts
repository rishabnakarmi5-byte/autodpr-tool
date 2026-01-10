import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, Unsubscribe } from "firebase/firestore";
import { DailyReport } from "../types";

// Your web app's Firebase configuration
// Keys are pulled from environment variables defined in Cloudflare/Vite
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.measurementId
};

// Simple check to warn if keys are missing
if (!firebaseConfig.apiKey) {
  console.error("Firebase Configuration Error: API Key is missing. Check your environment variables.");
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTION_NAME = "daily_reports";

export const subscribeToReports = (onUpdate: (reports: DailyReport[]) => void): Unsubscribe => {
  if (!db) return () => {};
  
  const q = query(collection(db, COLLECTION_NAME), orderBy("date", "desc"));
  
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
  if (!db) return;
  try {
    await setDoc(doc(db, COLLECTION_NAME, report.id), report);
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
};

export const deleteReportFromCloud = async (id: string): Promise<void> => {
  if (!db) return;
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  } catch (e) {
    console.error("Error deleting document: ", e);
    throw e;
  }
};