#!/usr/bin/env node
/**
 * Fetch a redistributable macOS FFmpeg binary into bin/ffmpeg_macos.
 *
 * Why this exists: the `ffmpeg-static` npm package's darwin-arm64 build is
 * compiled with `--enable-nonfree`. FFmpeg's own documentation states such a
 * build may not be redistributed at all — the nonfree components' terms
 * contradict the GPL the rest of the binary carries, so no valid distribution
 * licence exists for it. Every other platform ffmpeg-static ships (darwin-x64,
 * win32-x64, linux-x64, linux-arm64) is plain `--enable-gpl --enable-version3`,
 * which is fine to ship with notices.
 *
 * Because what matters is what the installer *contains*, not what the app
 * happens to execute, electron-builder.yml also excludes ffmpeg-static from
 * macOS packages entirely — so this binary is the only FFmpeg on macOS, for
 * both architectures.
 *
 * This script hard-fails if a build turns out to be nonfree, or is missing the
 * encoders YT-Forge depends on, so a non-compliant binary cannot reach a
 * release. Run automatically by `npm run dist:mac` / `dist:mac:arm`.
 * Safe to re-run.
 */
import { existsSync, mkdirSync, rmSync, chmodSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEST = path.join(ROOT, 'bin', 'ffmpeg_macos');

// Neither upstream publishes both architectures, so each arch has its own
// source. Both are linked from ffmpeg.org's own download page.
const SOURCES = {
  arm64: 'https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip',
  x64: 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip',
};

const FORBIDDEN = ['--enable-nonfree'];
const REQUIRED = [
  '--enable-gpl',        // libx264 lives behind this
  '--enable-libx264',    // the "convert to H.264" feature (-c:v libx264)
  '--enable-libmp3lame', // yt-dlp's mp3 extraction
];

// npm_config_arch is what electron-builder sets for a cross-arch build; fall
// back to the host arch for a plain local build.
const targetArch = process.env.npm_config_arch || process.arch;

function auditConfig(text, label) {
  const bad = FORBIDDEN.filter((f) => text.includes(f));
  const missing = REQUIRED.filter((f) => !text.includes(f));
  if (bad.length) throw new Error(`Refusing unredistributable build (${bad.join(', ')}): ${label}`);
  if (missing.length) throw new Error(`Build is missing required features (${missing.join(', ')}): ${label}`);
}

/**
 * Read the configure line FFmpeg bakes into its own binary. Executing it only
 * works when the binary matches the host arch, so fall back to reading the
 * embedded strings — that is what makes auditing a cross-arch build possible.
 */
function verify(bin) {
  try {
    const out = execFileSync(bin, ['-version'], { encoding: 'utf8', maxBuffer: 1 << 22 });
    const version = out.split('\n')[0].trim();
    auditConfig(out, version);
    return version;
  } catch (err) {
    if (err.message.startsWith('Refusing') || err.message.startsWith('Build is missing')) throw err;
    const strings = execFileSync('strings', ['-a', bin], { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (!strings.includes('--enable-gpl')) throw new Error(`Could not read FFmpeg configuration from ${bin}`);
    auditConfig(strings, `${path.basename(bin)} (inspected without executing)`);
    return `${targetArch} build (not executable on this host; verified via embedded strings)`;
  }
}

if (process.platform !== 'darwin') {
  console.log(`fetch-ffmpeg: skipping on ${process.platform} — ffmpeg-static's build for this platform is redistributable and ships as-is.`);
  process.exit(0);
}

const SOURCE = SOURCES[targetArch];
if (!SOURCE) {
  console.error(`fetch-ffmpeg: no known redistributable macOS FFmpeg source for arch "${targetArch}".`);
  process.exit(1);
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
  console.log(`fetch-ffmpeg: downloading ${targetArch} build from ${SOURCE}`);
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
