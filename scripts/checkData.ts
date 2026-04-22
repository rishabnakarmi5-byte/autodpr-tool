
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const newConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const collectionsToCheck = ["daily_reports", "activity_logs", "photos"];

async function check() {
  const newApp = initializeApp(newConfig, "newApp");
  const newDb = getFirestore(newApp, newConfig.firestoreDatabaseId);

  for (const col of collectionsToCheck) {
    const snap = await getDocs(collection(newDb, col));
    console.log(`${col}: ${snap.docs.length} docs`);
  }
  process.exit(0);
}
check();
