import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app lives inside the Electron repo, which has its own lockfile.
  // Pin tracing to this folder so Next stops guessing the workspace root.
  outputFileTracingRoot: here,
  images: { unoptimized: true },
};

export default nextConfig;
