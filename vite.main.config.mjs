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
        // NOTE: electron-store is deliberately NOT listed as external. In
        // practice vite leaves main.js's CommonJS require() of it verbatim
        // rather than inlining it, so it resolves from node_modules at
        // runtime — which is fine because it is a real dependency, not a
        // devDependency. Do not "fix" this by adding it to external.
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },
  },
});
