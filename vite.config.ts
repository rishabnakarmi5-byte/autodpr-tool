import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, '.', '');
  
  // Create a combined environment object. 
  // We prioritize process.env (system/Cloudflare) over .env files for secrets.
  const processEnv = { ...env, ...process.env };

  return {
    // SETTING BASE URL:
    // If hosting at https://rishabnakarmi.com.np/dprtool, keep '/dprtool/'.
    // If hosting at https://dpr.rishabnakarmi.com.np (subdomain), change this back to '/'.
    base: '/dprtool/', 
    plugins: [react()],
    define: {
      // Explicitly expose variables. usage of `|| ''` prevents "undefined" strings in the build.
      'process.env.FIREBASE_API_KEY': JSON.stringify(processEnv.FIREBASE_API_KEY || ''),
      'process.env.FIREBASE_AUTH_DOMAIN': JSON.stringify(processEnv.FIREBASE_AUTH_DOMAIN || ''),
      'process.env.FIREBASE_PROJECT_ID': JSON.stringify(processEnv.FIREBASE_PROJECT_ID || ''),
      'process.env.FIREBASE_STORAGE_BUCKET': JSON.stringify(processEnv.FIREBASE_STORAGE_BUCKET || ''),
      'process.env.FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(processEnv.FIREBASE_MESSAGING_SENDER_ID || ''),
      'process.env.FIREBASE_APP_ID': JSON.stringify(processEnv.FIREBASE_APP_ID || ''),
      'process.env.measurementId': JSON.stringify(processEnv.measurementId || ''), 
      'process.env.API_KEY': JSON.stringify(processEnv.API_KEY || ''),
    }
  };
});