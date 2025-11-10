import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  base: './',
  plugins: [
    legacy({
      targets: ['defaults', 'iOS >= 9'],
      renderLegacyChunks: true,
      modernPolyfills: true,
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 8080,
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
  },
  define: {
    'process.platform': '"web"',
  },
});
