import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Build the admin app into the web app's public/admin directory.
// This way, when the web app is built, Vite copies public/admin/* into dist/admin/,
// and the single Vercel deployment serves both apps:
//   - web app at /        (SPA, Vite default)
//   - admin app at /admin (SPA, base = /admin/)
export default defineConfig({
  root: '.', // apps/admin
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: '../web/public/admin',
    emptyOutDir: true,
    rollupOptions: {
      // Ensure the admin build outputs are standalone and don't conflict
      // with the web app's assets in dist/.
      output: {
        // Prefix admin assets to avoid collisions with web app assets
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: ({ name }) => {
          if (/\.(gif|jpe?g|png|svg|webp)$/i.test(name ?? '') || name?.endsWith('.woff2')) {
            return 'assets/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5174
  }
});
