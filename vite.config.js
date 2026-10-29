import {defineConfig} from 'vite';
export default defineConfig({
  clearScreen: false,
  // Pages serves a project site at /sudokupadX/; Tauri keeps the root base.
  base: process.env.GITHUB_PAGES === 'true' ? '/sudokupadX/' : '/',
  server: {host: '127.0.0.1', port: 1420, strictPort: true},
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {target: 'es2021'}
});
