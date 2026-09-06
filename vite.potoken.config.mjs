import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const OUT = 'dist-electron/potoken';

// The offscreen PO-token window: a bundled BotGuard runner plus the two plain
// files it needs. index.html and preload.js have no imports to resolve, so
// they are copied rather than run through rollup.
export default defineConfig({
  build: {
    outDir: OUT,
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: 'src/potoken/entry.js',
      formats: ['iife'],
      name: 'potoken',
      fileName: () => 'bundle.js',
    },
  },
  plugins: [
    {
      name: 'potoken-copy-static',
      closeBundle() {
        mkdirSync(resolve(OUT), { recursive: true });
        for (const f of ['index.html', 'preload.js']) {
          copyFileSync(resolve('src/potoken', f), resolve(OUT, f));
        }
      },
    },
  ],
});
