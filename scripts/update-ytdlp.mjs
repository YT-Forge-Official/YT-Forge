#!/usr/bin/env node
/**
 * Refresh every bundled yt-dlp binary in bin/ to one release, verified against
 * yt-dlp's published SHA2-256SUMS.
 *
 *   node scripts/update-ytdlp.mjs            # latest release
 *   node scripts/update-ytdlp.mjs 2026.08.19 # a specific tag
 *
 * Why this exists: the app self-updates yt-dlp at runtime, but only the copy
 * for the platform it is running on. Developing on a Mac therefore keeps
 * yt-dlp_macos fresh while yt-dlp.exe and yt-dlp_linux silently age in git —
 * they were six months stale, and the Linux one had been swapped for the
 * Python-dependent zipimport script, before this was written. Run it before
 * every release.
 */
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin');

// Release asset -> file in bin/. Linux is split per CPU because electron-builder
// picks the file with its ${arch} macro (x64 / arm64), so those two carry
// electron-builder's arch names rather than yt-dlp's.
const ASSETS = {
  'yt-dlp_macos': 'yt-dlp_macos',
  'yt-dlp.exe': 'yt-dlp.exe',
  'yt-dlp_linux': 'yt-dlp_linux_x64',
  'yt-dlp_linux_aarch64': 'yt-dlp_linux_arm64',
};

const tag = process.argv[2] || 'latest';
const base = tag === 'latest'
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'
  : `https://github.com/yt-dlp/yt-dlp/releases/download/${tag}`;

const fetchBytes = async (name) => {
  const res = await fetch(`${base}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

const sums = new Map(
  (await fetchBytes('SHA2-256SUMS')).toString('utf8').trim().split('\n')
    .map(l => l.trim().split(/\s+/)).map(([sha, name]) => [name, sha]),
);

mkdirSync(BIN_DIR, { recursive: true });
let failed = false;
for (const [name, local] of Object.entries(ASSETS)) {
  const bytes = await fetchBytes(name);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== sums.get(name)) {
    console.error(`✗ ${name}: checksum mismatch (got ${sha}, want ${sums.get(name)})`);
    failed = true;
    continue;
  }
  const out = join(BIN_DIR, local);
  writeFileSync(out, bytes);
  if (!name.endsWith('.exe')) chmodSync(out, 0o755);
  console.log(`✓ ${name} → bin/${local}  ${(bytes.length / 1e6).toFixed(1)} MB  ${sha.slice(0, 12)}…`);
}
console.log(failed ? 'some binaries were NOT updated' : `bin/ now at ${tag}`);
process.exit(failed ? 1 : 0);
