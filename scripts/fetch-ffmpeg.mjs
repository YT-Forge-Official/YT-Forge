#!/usr/bin/env node
/**
 * Fetch a redistributable macOS arm64 FFmpeg binary into bin/ffmpeg_macos.
 *
 * Why this exists: the `ffmpeg-static` npm package's darwin-arm64 build is
 * compiled with `--enable-nonfree`. FFmpeg's own documentation states such a
 * build may not be redistributed at all — the nonfree components' terms
 * contradict the GPL the rest of the binary carries, so no valid distribution
 * licence exists for it. Every other platform ffmpeg-static ships
 * (darwin-x64, win32-x64, linux-x64, linux-arm64) is plain
 * `--enable-gpl --enable-version3`, which is fine to ship with notices.
 *
 * So this script only replaces the macOS arm64 binary. It hard-fails if the
 * downloaded build turns out to be nonfree, or is missing the encoders
 * YT-Forge actually depends on, so a bad build can never reach a release.
 *
 * Run automatically by `npm run dist:mac` / `dist:mac:arm`. Safe to re-run.
 */
import { existsSync, mkdirSync, rmSync, chmodSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEST = path.join(ROOT, 'bin', 'ffmpeg_macos');
const SOURCE = 'https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip';

// Flags that must NOT appear, and features we must keep working.
const FORBIDDEN = ['--enable-nonfree'];
const REQUIRED = [
  '--enable-gpl',        // libx264 lives behind this
  '--enable-libx264',    // the "convert to H.264" feature (-c:v libx264)
  '--enable-libmp3lame', // yt-dlp's mp3 extraction
];

function configOf(bin) {
  const out = execFileSync(bin, ['-version'], { encoding: 'utf8', maxBuffer: 1 << 22 });
  return { version: out.split('\n')[0].trim(), config: out };
}

function verify(bin) {
  const { version, config } = configOf(bin);
  const bad = FORBIDDEN.filter((f) => config.includes(f));
  const missing = REQUIRED.filter((f) => !config.includes(f));
  if (bad.length) throw new Error(`Refusing unredistributable build (${bad.join(', ')}): ${version}`);
  if (missing.length) throw new Error(`Build is missing required features (${missing.join(', ')}): ${version}`);
  return version;
}

// Only meaningful on Apple Silicon builds; a no-op everywhere else.
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.log(`fetch-ffmpeg: skipping on ${process.platform}/${process.arch} — ffmpeg-static's build for this platform is redistributable.`);
  process.exit(0);
}

if (existsSync(DEST)) {
  try {
    console.log(`fetch-ffmpeg: bin/ffmpeg_macos already present — ${verify(DEST)}`);
    process.exit(0);
  } catch (err) {
    console.log(`fetch-ffmpeg: replacing existing binary — ${err.message}`);
    rmSync(DEST);
  }
}

const tmp = path.join(os.tmpdir(), `ytforge-ffmpeg-${process.pid}`);
mkdirSync(tmp, { recursive: true });
mkdirSync(path.dirname(DEST), { recursive: true });

try {
  console.log(`fetch-ffmpeg: downloading ${SOURCE}`);
  const res = await fetch(SOURCE, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  console.log(`fetch-ffmpeg: resolved to ${res.url}`);

  const zip = path.join(tmp, 'ffmpeg.zip');
  await writeFile(zip, Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', zip, '-d', tmp], { stdio: 'inherit' });

  const staged = path.join(tmp, 'ffmpeg');
  if (!existsSync(staged)) throw new Error('archive did not contain an "ffmpeg" entry');
  chmodSync(staged, 0o755);

  // Verify BEFORE moving into place, so a bad build never lands in bin/.
  const version = verify(staged);
  execFileSync('mv', [staged, DEST]);
  chmodSync(DEST, 0o755);

  const mb = (statSync(DEST).size / 1e6).toFixed(1);
  console.log(`fetch-ffmpeg: installed bin/ffmpeg_macos (${mb} MB) — ${version}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
