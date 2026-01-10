import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // The third argument '' means load ALL env vars, not just VITE_ ones.
  // Cast process to any to avoid TypeScript error about missing 'cwd' property
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Create a combined environment object. 
  // We prioritize process.env (system/Cloudflare) over .env files for secrets.
  const processEnv = { ...env, ...process.env };

  // Helper to resolve env vars checking multiple naming conventions
  const getEnv = (key: string) => {
    return processEnv[key] || processEnv[`VITE_${key}`] || '';
  };

  return {
    // SETTING BASE URL:
    // We use './' (relative path) so the app works regardless of whether it is hosted 
    // at the root or a subdirectory.
    base: './', 
    plugins: [react()],
    define: {
      // Explicitly expose variables. 
      // We check for both raw names (FIREBASE_API_KEY) and VITE_ prefixed names.
      'process.env.FIREBASE_API_KEY': JSON.stringify(getEnv('FIREBASE_API_KEY')),
      'process.env.FIREBASE_AUTH_DOMAIN': JSON.stringify(getEnv('FIREBASE_AUTH_DOMAIN')),
      'process.env.FIREBASE_PROJECT_ID': JSON.stringify(getEnv('FIREBASE_PROJECT_ID')),
      'process.env.FIREBASE_STORAGE_BUCKET': JSON.stringify(getEnv('FIREBASE_STORAGE_BUCKET')),
      'process.env.FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(getEnv('FIREBASE_MESSAGING_SENDER_ID')),
      'process.env.FIREBASE_APP_ID': JSON.stringify(getEnv('FIREBASE_APP_ID')),
      'process.env.measurementId': JSON.stringify(getEnv('measurementId')), 
      'process.env.API_KEY': JSON.stringify(getEnv('API_KEY')),
    }
  };
});