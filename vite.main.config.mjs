import { defineConfig } from 'vite';
import { builtinModules } from 'module';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    outDir: 'dist-electron',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: 'src/main.js',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        'electron',
        'electron-updater',
        'ffmpeg-static',
        'ffprobe-static',
        // NOTE: electron-store is deliberately NOT external — v10 is ESM-only
        // and require() of it crashes under Electron's Node, so vite bundles it.
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },
  },
});
