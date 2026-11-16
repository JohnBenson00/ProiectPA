import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PAGES_BASE is set for the GitHub Pages build (served from /<repo>/)
export default defineConfig({
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react()],
  server: { host: true, port: 5173, proxy: { '/api': 'http://localhost:3001' }, fs: { allow: ['..'] } },
});
