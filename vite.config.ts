/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative paths so the app works from any hosting sub-folder (e.g. GitHub Pages).
  base: './',
  server: { host: true },
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
});
