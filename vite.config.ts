import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // The third parameter '' means load ALL env vars, not just those starting with VITE_
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    define: {
      // Expose env vars to the app via process.env
      'process.env': JSON.stringify(env)
    }
  };
});