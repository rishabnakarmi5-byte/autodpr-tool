
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, initializeFirestore } from "firebase/firestore";
import fs from "fs";

// Load new config
const newConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));

// Old config from env (standard AI Studio env vars)
const oldConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const collectionsToMigrate = [
  "daily_reports",
  "activity_logs",
  "trash_bin",
  "permanent_backups",
  "report_history",
  "quantities",
  "project_settings",
  "user_profiles",
  "lining_data",
  "system_checkpoints",
  "ai_training_examples",
  "user_moods",
  "raw_inputs",
  "sub_contractors",
  "photos"
];

async function migrate() {
  console.log("Starting migration...");
  console.log("New Project ID:", newConfig.projectId);
  console.log("New DB ID:", newConfig.firestoreDatabaseId);
  console.log("Old Project ID:", oldConfig.projectId);
  
  if (!oldConfig.projectId) {
    console.error("Old project ID not found in environment variables. Checking all env vars...");
    console.log(JSON.stringify(Object.keys(process.env).filter(k => k.includes('FIREBASE')), null, 2));
    return;
  }

  const oldApp = initializeApp(oldConfig, "oldApp");
  const oldDb = getFirestore(oldApp);
  
  const newApp = initializeApp(newConfig, "newApp");
  // Try getFirestore with string ID
  const newDb = getFirestore(newApp, newConfig.firestoreDatabaseId);

  for (const colName of collectionsToMigrate) {
    console.log(`Migrating ${colName}...`);
    try {
      const snap = await getDocs(collection(oldDb, colName));
      console.log(`Found ${snap.docs.length} documents in ${colName}`);
      
      for (const d of snap.docs) {
        await setDoc(doc(newDb, colName, d.id), d.data());
        // Small delay to avoid hammering
        await new Promise(r => setTimeout(r, 10)); 
      }
      console.log(`Finished ${colName}`);
    } catch (err) {
      console.error(`Error migrating ${colName}:`, err);
    }
  }
  
  console.log("Migration complete!");
  process.exit(0);
}

migrate();
