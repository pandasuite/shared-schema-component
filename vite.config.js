import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 8080,
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'chrome87',
    },
  },
  esbuild: {
    target: 'chrome87',
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
    target: 'chrome87',
    minify: 'esbuild',
  },
  define: {
    'process.platform': '"web"',
  },
});
