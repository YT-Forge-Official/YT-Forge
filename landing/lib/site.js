// Single source of truth for the landing page.
// Bump VERSION on a new release and every download link follows.

export const VERSION = '1.0.8';
export const REPO = 'Shaikh-Suja-Rahaman/YT-Forge';
export const REPO_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;
export const LATEST_URL = `${RELEASES_URL}/latest`;
export const ISSUES_URL = `${REPO_URL}/issues`;

const dl = (file) => `${RELEASES_URL}/download/v${VERSION}/${file}`;

export const PLATFORMS = [
  {
    id: 'mac',
    name: 'macOS',
    tagline: 'Apple Silicon',
    note: 'M1 · M2 · M3 · M4',
    ext: '.dmg',
    builds: [
      { label: 'Apple Silicon (arm64)', href: dl(`YT-Forge-${VERSION}-arm64.dmg`), primary: true },
    ],
  },
  {
    id: 'windows',
    name: 'Windows',
    tagline: 'Intel / AMD & ARM',
    note: 'Universal installer',
    ext: '.exe',
    builds: [
      { label: 'Installer (x64 + ARM)', href: dl(`YT-Forge-Setup-${VERSION}.exe`), primary: true },
    ],
  },
  {
    id: 'linux',
    name: 'Linux',
    tagline: 'AppImage',
    note: 'x64 and ARM devices',
    ext: '.AppImage',
    builds: [
      { label: 'x64 (standard PCs)', href: dl(`YT-Forge-${VERSION}.AppImage`), primary: true },
      { label: 'arm64 (Raspberry Pi)', href: dl(`YT-Forge-${VERSION}-arm64.AppImage`) },
    ],
  },
];

export const NAV = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how' },
  { label: 'Formats', href: '#formats' },
  { label: 'Extension', href: '#extension' },
  { label: 'FAQ', href: '#faq' },
];

export const FEATURES = [
  {
    n: '01',
    title: 'Editor-first formats',
    body: 'H.264 + AAC is picked by default, not AV1 or VP9. Files drop straight onto a Premiere or Resolve timeline with no transcode wait.',
  },
  {
    n: '02',
    title: 'Built-in H.264 conversion',
    body: 'Already grabbed a VP9 or AV1 file? Convert it in place with the bundled ffmpeg. No second app, no command line.',
  },
  {
    n: '03',
    title: 'Whole playlists',
    body: 'Paste a playlist URL, pick a folder, walk away. Batch queue with per-item progress and a resumable download list.',
  },
  {
    n: '04',
    title: 'No ads, no tracking',
    body: 'MIT licensed and fully open source. No telemetry, no upsell modal, no sketchy redirect chain before your download starts.',
  },
];

export const CAPABILITIES = [
  { label: 'Resolution ceiling', value: '4K60', meta: '2160p60 where the source has it' },
  { label: 'Audio-only', value: 'M4A', meta: 'AAC extraction, tags intact' },
  { label: 'Queue', value: 'Batch', meta: 'Pause, resume, cancel per item' },
  { label: 'Engine', value: 'yt-dlp', meta: 'Auto-updating binary' },
];

export const FAQ = [
  {
    q: 'Why does it prefer H.264 over VP9 or AV1?',
    a: 'Because editors hate the alternatives. Premiere Pro, Final Cut and DaVinci Resolve all decode H.264/AAC natively and scrub it smoothly. VP9 and AV1 either stutter on the timeline or need a full transcode first. YT-FORGE picks the format you were going to convert to anyway.',
  },
  {
    q: 'Is this just a yt-dlp wrapper?',
    a: 'It is a GUI on top of yt-dlp, and it says so plainly. What it adds is format logic tuned for editing, a real download queue, playlist batching, thumbnail previews and in-app H.264 conversion — the parts you would otherwise script yourself.',
  },
  {
    q: 'My OS says the app is unverified. Is something wrong?',
    a: 'No. Code-signing certificates cost money that an independent open-source project does not have. On macOS open System Settings → Privacy & Security → Open Anyway. On Windows choose More info → Run anyway. You only do it once.',
  },
  {
    q: 'Does it upload anything about me?',
    a: 'Nothing. There is no analytics SDK, no crash reporter and no account. Downloads go from YouTube to your disk. The source is on GitHub if you would rather check than trust.',
  },
  {
    q: 'Is there an Intel Mac build?',
    a: 'Not in 1.0.8 — the macOS build ships as Apple Silicon arm64 only. If you need x64, open an issue on GitHub and it moves up the list.',
  },
  {
    q: 'What am I allowed to download?',
    a: 'Content you own, content licensed for reuse, or content you otherwise have permission to keep. YT-FORGE does not break DRM or bypass access controls — it is a front end for a public tool. What you point it at is on you.',
  },
];

export const STEPS = [
  { n: '01', title: 'Paste', body: 'Drop in any YouTube video or playlist URL. Metadata and thumbnail resolve instantly.' },
  { n: '02', title: 'Pick', body: 'Choose container and quality. H.264 + AAC is already selected for you.' },
  { n: '03', title: 'Pull', body: 'Chunked download with live speed, elapsed and ETA. Pause and resume whenever.' },
  { n: '04', title: 'Cut', body: 'File lands in your folder, timeline-ready. Convert to H.264 in app if you took VP9.' },
];

export const EDITORS = ['Premiere Pro', 'Final Cut Pro', 'DaVinci Resolve', 'After Effects', 'CapCut', 'Avid Media Composer'];
