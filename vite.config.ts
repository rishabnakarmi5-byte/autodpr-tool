import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // This helps locally if you have a .env file.
  const env = loadEnv(mode, '.', '');
  
  // Merge process.env (system vars from Cloudflare) with loaded envs
  const processEnv = { ...process.env, ...env };

  return {
    plugins: [react()],
    define: {
      // Explicitly expose the specific environment variables required by the app.
      // Vite replaces these keys with their stringified values at build time.
      'process.env.FIREBASE_API_KEY': JSON.stringify(processEnv.FIREBASE_API_KEY),
      'process.env.FIREBASE_AUTH_DOMAIN': JSON.stringify(processEnv.FIREBASE_AUTH_DOMAIN),
      'process.env.FIREBASE_PROJECT_ID': JSON.stringify(processEnv.FIREBASE_PROJECT_ID),
      'process.env.FIREBASE_STORAGE_BUCKET': JSON.stringify(processEnv.FIREBASE_STORAGE_BUCKET),
      'process.env.FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(processEnv.FIREBASE_MESSAGING_SENDER_ID),
      'process.env.FIREBASE_APP_ID': JSON.stringify(processEnv.FIREBASE_APP_ID),
      'process.env.measurementId': JSON.stringify(processEnv.measurementId),
      'process.env.API_KEY': JSON.stringify(processEnv.API_KEY),
    }
  };
});