const { app, BrowserWindow, ipcMain, dialog, shell, net, session, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { pathToFileURL } = require("url");
const { spawn, execFile } = require("child_process");

// Fix asar-packed paths: ffmpeg-static/ffprobe-static resolve inside .asar
// which isn't executable. asarUnpack extracts them to .asar.unpacked.
const fixAsar = (p) => p.replace('app.asar', 'app.asar.unpacked');
const ffmpegPath = fixAsar(require('ffmpeg-static'));
const ffprobePath = fixAsar(require('ffprobe-static').path);

// Build env with ffmpeg+ffprobe directories on PATH so yt-dlp can find both.
// Inject ELECTRON_RUN_AS_NODE=1 so if yt-dlp spawns us as a Node JS runtime,
// Electron acts as a headless Node terminal instead of opening a second GUI window.
function getYtDlpEnv() {
  const dirs = new Set([path.dirname(ffmpegPath), path.dirname(ffprobePath)]);
  const extraPath = [...dirs].join(path.delimiter);
  return {
    ...process.env,
    PATH: `${extraPath}${path.delimiter}${process.env.PATH || ''}`,
    ELECTRON_RUN_AS_NODE: '1'
  };
}

// electron-store v8 exports the class directly.
//
// Do NOT reintroduce a `.default || ` interop guard here. ElectronStore extends
// Conf, and conf's CJS interop sets `Conf.default = Conf`, so
// `ElectronStore.default` resolves *up the static chain* to plain Conf — which
// knows nothing about Electron and writes to envPaths('electron-store') instead
// of app.getPath('userData'). That regression silently moved every user's
// config out of userData; migrateMisplacedStore() below cleans it up.
const Store = require("electron-store");


// Base yt-dlp flags shared by info fetch and download
const BASE_ARGS = [
  '--no-playlist',
  '--ignore-config',
  '--retries', '10',
  '--retry-sleep', '3',
  '--fragment-retries', '10',
  '--socket-timeout', '20',
  // Explicitly command yt-dlp to use our bundled Electron executable as the Node.js runtime to solve YouTube's bot-challenges (HTTP Error 429).
  '--js-runtimes', `node:${process.execPath}`,
];

// Download-only flags. Concurrent fragment downloading dramatically speeds up
// adaptive (DASH/HLS) downloads without affecting format selection or quality.
const DOWNLOAD_SPEED_ARGS = [
  '--concurrent-fragments', '4',
];

/**
 * The config location plain `conf` falls back to when it cannot see Electron's
 * `app` module — i.e. env-paths('electron-store', { suffix: 'nodejs' }).config.
 * Spelled out per platform rather than pulled from env-paths so it stays
 * readable and does not depend on a transitive dependency surviving bundling.
 */
function legacyMisplacedConfigPath() {
  const name = 'electron-store-nodejs';
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Preferences', name, 'config.json');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, name, 'Config', 'config.json');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), name, 'config.json');
}

function readJsonOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * One-time repair for a config file written outside userData.
 *
 * Affected builds instantiated raw `conf` instead of electron-store (see the
 * note above the require), so settings, theme and download history landed in
 * ~/Library/Preferences/electron-store-nodejs (and the equivalent elsewhere)
 * instead of userData. Installs that predate the regression also have an older
 * config in the correct place, so this MERGES the two rather than overwriting:
 *
 *   - scalar keys come from the misplaced file, which is always the newer one;
 *   - downloadHistory is concatenated and re-sorted newest-first. Nothing is
 *     deduplicated — history entries are addressed by `timestamp` elsewhere in
 *     this file and duplicates already occur legitimately, so dropping any
 *     would delete real history.
 *
 * Runs before the store is constructed. On success the misplaced file is
 * renamed, not deleted, which both keeps the original bytes recoverable and
 * makes this a no-op on every later launch.
 */
function migrateMisplacedStore() {
  const legacyPath = legacyMisplacedConfigPath();
  const legacy = readJsonOrNull(legacyPath);
  if (!legacy) return; // nothing misplaced, or unreadable — leave it alone

  const correctPath = path.join(app.getPath('userData'), 'config.json');
  const current = readJsonOrNull(correctPath);

  const merged = { ...(current || {}), ...legacy };
  const history = [
    ...(Array.isArray(legacy.downloadHistory) ? legacy.downloadHistory : []),
    ...(current && Array.isArray(current.downloadHistory) ? current.downloadHistory : []),
  ];
  if (history.length) {
    history.sort((a, b) => String(b.timestamp ?? '').localeCompare(String(a.timestamp ?? '')));
    merged.downloadHistory = history;
  }

  try {
    fs.mkdirSync(path.dirname(correctPath), { recursive: true });
    // Keep whatever we are about to replace, so a bad merge stays recoverable.
    if (current) fs.copyFileSync(correctPath, correctPath + '.pre-migration-backup');
    // '\t' matches conf's own serialisation, so the file format is unchanged.
    fs.writeFileSync(correctPath, JSON.stringify(merged, null, '\t'), 'utf8');
    fs.renameSync(legacyPath, legacyPath + '.migrated');
    console.log('[store] merged misplaced config into ' + correctPath);
  } catch (err) {
    // A failed migration must never stop the app launching — the store simply
    // loads whatever is already at the correct path.
    console.error('[store] config migration failed:', err);
  }
}

migrateMisplacedStore();

const store = new Store();
let mainWindow;
let currentInfoFetchProcess = null;
let isUpdatingYtDlp = false;
let ytDlpPhase = null; // 'checking' | 'downloading' | null — tracks live update phase for renderer query
let networkCheckInterval = null;
let wasOnline = true;

// ---------------------------------------------------------------------------
// Cross-platform yt-dlp binary resolution
// ---------------------------------------------------------------------------

function getBinaryName() {
  switch (process.platform) {
    case 'win32': return 'yt-dlp.exe';
    case 'darwin': return 'yt-dlp_macos';
    case 'linux': return 'yt-dlp_linux';
    default: return 'yt-dlp_linux'; // best guess
  }
}

function getBundledBinaryPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', getBinaryName());
  }
  // The repo keeps one Linux build per CPU (electron-builder installs the
  // right one as plain `yt-dlp_linux` at package time); in dev pick it here.
  const devName = process.platform === 'linux'
    ? `yt-dlp_linux_${process.arch === 'arm64' ? 'arm64' : 'x64'}`
    : getBinaryName();
  return path.join(app.getAppPath(), 'bin', devName);
}

function getWritableBinaryPath() {
  if (!app.isPackaged) return getBundledBinaryPath(); // dev mode — bin/ is already writable
  return path.join(app.getPath('userData'), 'bin', getBinaryName());
}

function ensureYtDlpBinary() {
  const writable = getWritableBinaryPath();
  const bundled = getBundledBinaryPath();

  if (!app.isPackaged) {
    if (!fs.existsSync(writable)) {
      console.error('yt-dlp binary not found at:', writable);
      console.error('Download it from https://github.com/yt-dlp/yt-dlp/releases and place it in bin/');
      return writable;
    }
  } else {
    const dir = path.dirname(writable);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (!fs.existsSync(writable)) {
      if (fs.existsSync(bundled)) {
        fs.copyFileSync(bundled, writable);
        console.log('Copied yt-dlp binary to writable location:', writable);
      } else {
        console.error('Bundled yt-dlp binary not found at:', bundled);
      }
    }
  }

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(writable, '755');
    } catch (err) {
      console.error('Failed to chmod yt-dlp binary:', err);
    }
  }

  console.log('Using yt-dlp binary at:', writable);
  return writable;
}

const ytDlpBinaryPath = ensureYtDlpBinary();

/** Safe send — guard against destroyed window (e.g. app quit during async callback) */
function safeSend(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Auto-update yt-dlp on app launch.
 * Runs `yt-dlp -U` in the background. Because the binary lives in a writable
 * directory (userData/bin/), it can replace itself in-place.
 */
function updateYtDlp() {
  // Don't update while a download is active
  if (activeCtl) {
    console.log('Skipping yt-dlp update — download in progress');
    return;
  }
  isUpdatingYtDlp = true;
  ytDlpPhase = 'checking';
  console.log('Checking for yt-dlp updates...');
  safeSend('ytdlp-update-status', { status: 'checking' });

  const proc = spawn(ytDlpBinaryPath, ['-U'], { env: getYtDlpEnv(), windowsHide: true });
  let stdoutAll = '';
  let stderrAll = '';
  let downloadingSignalled = false;

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdoutAll += text;
    if (!downloadingSignalled && (text.includes('Updating yt-dlp') || text.includes('Downloading'))) {
      downloadingSignalled = true;
      ytDlpPhase = 'downloading';
      safeSend('ytdlp-update-status', { status: 'downloading' });
    }
    console.log('yt-dlp update stdout:', text.trim());
  });

  proc.stderr.on('data', (chunk) => {
    stderrAll += chunk.toString();
  });

  proc.on('close', (code) => {
    isUpdatingYtDlp = false;
    ytDlpPhase = null;
    if (code !== 0) {
      console.log('yt-dlp update check failed (non-critical):', stderrAll.trim() || `exit ${code}`);
      safeSend('ytdlp-update-status', { status: 'error' });
      processQueue();
      return;
    }
    const updated = stdoutAll.includes('Updated yt-dlp') || stdoutAll.includes('Successfully updated');
    safeSend('ytdlp-update-status', { status: updated ? 'updated' : 'up-to-date' });
    if (stdoutAll) console.log('yt-dlp update:', stdoutAll.trim());
    if (stderrAll) console.log('yt-dlp update stderr:', stderrAll.trim());

    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(ytDlpBinaryPath, '755');
      } catch (chmodErr) {
        console.error('Failed to chmod yt-dlp after update:', chmodErr);
      }
    }

    if (process.platform === 'darwin') {
      execFile('xattr', ['-dr', 'com.apple.quarantine', ytDlpBinaryPath], (xattrErr) => {
        if (xattrErr) console.log('xattr quarantine clear (non-critical):', xattrErr.message);
      });
    }

    // Start any downloads that were queued while the update was running
    processQueue();
  });

  proc.on('error', (err) => {
    isUpdatingYtDlp = false;
    ytDlpPhase = null;
    console.log('yt-dlp update spawn error (non-critical):', err.message);
    safeSend('ytdlp-update-status', { status: 'error' });
    processQueue();
  });
}

ipcMain.handle('get-ytdlp-status', () => ytDlpPhase);

// ---------------------------------------------------------------------------
// Appearance (system / light / dark)
//
// The *preference* is what we persist; the *resolved* theme is what the UI
// paints. They only differ under 'system', where the OS decides — and keeps
// deciding, so we forward nativeTheme changes to the renderer.
//
// The preload reads the state synchronously before the renderer's first paint,
// which together with the matching window backgroundColor keeps startup
// flash-free.
// ---------------------------------------------------------------------------
const THEME_KEY = 'appearance';
const THEME_PREFERENCES = ['system', 'light', 'dark'];
const WINDOW_BG = { dark: '#0a0a0a', light: '#f9f9f9' };

const getThemePreference = () => {
  const stored = store.get(THEME_KEY);
  return THEME_PREFERENCES.includes(stored) ? stored : 'system';
};

const getAppearance = () => {
  const preference = getThemePreference();
  const resolved = preference === 'system'
    ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
    : preference;
  return { preference, resolved };
};

const applyWindowBackground = (resolved) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(WINDOW_BG[resolved]);
  }
};

ipcMain.on('get-appearance-sync', (event) => { event.returnValue = getAppearance(); });
ipcMain.handle('get-appearance', () => getAppearance());
ipcMain.handle('set-appearance', (event, preference) => {
  const next = THEME_PREFERENCES.includes(preference) ? preference : 'system';
  store.set(THEME_KEY, next);
  nativeTheme.themeSource = next;
  const appearance = getAppearance();
  applyWindowBackground(appearance.resolved);
  return appearance;
});

// ---------------------------------------------------------------------------
// Sticky download options
//
// The toggles either side of a download — H.264 conversion, overwrite and
// numbering above a playlist, H.264 conversion on a single video — remember
// whatever was last used, across restarts. Read synchronously from the preload
// so each view paints the remembered states on its first frame instead of
// flipping a checkbox a moment later.
//
// The playlist and single-video H.264 toggles are stored separately on
// purpose: converting a batch for an editing project shouldn't silently arm a
// slow re-encode on every ad-hoc download afterwards.
//
// Quality is deliberately NOT sticky — it belongs to the video or playlist in
// front of you, and silently reopening at "audio only" would be a trap.
// ---------------------------------------------------------------------------
const DOWNLOAD_OPTIONS_KEY = 'downloadOptions';
const DOWNLOAD_OPTION_DEFAULTS = {
  playlistConvertToH264: false,
  playlistOverwriteFiles: false,
  playlistNumberFiles: true,
  videoConvertToH264: false,
};

const getDownloadOptions = () => {
  const stored = store.get(DOWNLOAD_OPTIONS_KEY);
  const saved = stored && typeof stored === 'object' ? stored : {};
  // Per key, so a partial or hand-edited blob still yields a full, valid set.
  return Object.fromEntries(
    Object.entries(DOWNLOAD_OPTION_DEFAULTS).map(([key, fallback]) => [
      key,
      typeof saved[key] === 'boolean' ? saved[key] : fallback,
    ])
  );
};

ipcMain.on('get-download-options-sync', (event) => { event.returnValue = getDownloadOptions(); });
ipcMain.handle('get-download-options', () => getDownloadOptions());
ipcMain.handle('set-download-options', (event, options) => {
  const incoming = options && typeof options === 'object' ? options : {};
  const next = getDownloadOptions();
  for (const key of Object.keys(DOWNLOAD_OPTION_DEFAULTS)) {
    if (typeof incoming[key] === 'boolean') next[key] = incoming[key];
  }
  store.set(DOWNLOAD_OPTIONS_KEY, next);
  return next;
});

// OS switched between light and dark — only meaningful while following it.
nativeTheme.on('updated', () => {
  const appearance = getAppearance();
  applyWindowBackground(appearance.resolved);
  safeSend('appearance-changed', appearance);
});

// ---------------------------------------------------------------------------
// Last-used save directory
//
// Every destination in the app is picked through a native dialog, and none of
// them used to pass a directory — only a filename. That leaves the starting
// folder entirely to the platform picker, which is fine on macOS and Windows
// (both persist a per-app last-used directory) but not on Linux: the GTK
// dialog only remembers for the lifetime of the process, and when the XDG
// desktop portal serves the dialog the recall belongs to whichever portal
// backend answered. An AppImage has no installed desktop entry for a backend
// to key that memory against, so users re-navigated on every single save.
//
// So the app remembers it itself. The folder is recorded the moment a dialog
// returns a path — not when the download finishes — because that is when the
// OS would have recorded it: cancelling or failing a download still leaves
// you where you last chose to be.
//
// This only *suggests* a starting folder. The dialog still opens, so renaming
// and relocating on the fly work exactly as before, and a portal backend is
// free to ignore the suggestion — nothing downstream depends on it.
// ---------------------------------------------------------------------------
const SAVE_DIR_KEY = 'lastSaveDirectory';

/** Downloads, or the home directory on a platform that reports no Downloads. */
function fallbackSaveDirectory() {
  try {
    return app.getPath('downloads');
  } catch (e) {
    return app.getPath('home');
  }
}

/**
 * The folder a save dialog should open in.
 *
 * The stored path is re-validated on every call rather than trusted: it may
 * name an external drive that is no longer mounted, or a folder deleted since.
 * A defaultPath inside a dead mount is worse than none at all, so anything
 * unusable degrades silently to Downloads.
 */
function getSaveDirectory() {
  const stored = store.get(SAVE_DIR_KEY);
  if (typeof stored === 'string' && stored) {
    try {
      if (fs.statSync(stored).isDirectory()) return stored;
    } catch (e) { /* gone, unmounted or unreadable — fall through */ }
  }
  return fallbackSaveDirectory();
}

/**
 * A dialog `defaultPath`: the remembered folder plus the suggested filename.
 * Safe to join — every caller passes a safeFileStem() result, which has had
 * path separators stripped out of it.
 */
function defaultSavePath(filename) {
  return path.join(getSaveDirectory(), filename);
}

/**
 * Record where the user just chose to save. Takes a directory, so callers
 * holding a file path pass its dirname.
 *
 * Persisting is best-effort: a read-only or full config directory must never
 * turn a successful save into a failed one.
 */
function rememberSaveDirectory(dir) {
  if (typeof dir !== 'string' || !dir) return;
  try {
    store.set(SAVE_DIR_KEY, dir);
  } catch (e) {
    console.warn('Could not persist last save directory:', e.message);
  }
}

function createWindow() {
  nativeTheme.themeSource = getThemePreference();
  const { resolved } = getAppearance();

  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    minWidth: 720,
    minHeight: 560,
    resizable: true,
    autoHideMenuBar: true,
    backgroundColor: WINDOW_BG[resolved],
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenu(null);

  // The renderer is local UI. Nothing it shows may ever navigate this
  // privileged window anywhere else — not to a remote page, and not to a
  // local file dropped onto the window (Chromium's default drop action is a
  // navigation) — nor open a second window. Outbound links go through
  // 'open-external-link' to the system browser instead. Only the renderer's
  // own URL is allowed, which keeps reloads working.
  const indexHtml = path.join(__dirname, '../dist/index.html');
  const rendererUrl = app.isPackaged ? pathToFileURL(indexHtml).href : 'http://localhost:5173';
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(rendererUrl)) event.preventDefault();
  });

  // The offscreen PO-token window is an implementation detail of this one:
  // it must never be the last window standing, or window-all-closed would
  // wait on its idle timer and the app would linger invisibly after close.
  mainWindow.on('closed', destroyPotWindow);

  if (!app.isPackaged) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(indexHtml);
  }
}

// ---------------------------------------------------------------------------
// Network monitoring — auto-pause/resume downloads on connectivity changes
// ---------------------------------------------------------------------------
function startNetworkMonitoring() {
  if (networkCheckInterval) return;
  wasOnline = net.isOnline();
  networkCheckInterval = setInterval(() => {
    const online = net.isOnline();
    if (online === wasOnline) return;
    wasOnline = online;
    if (!online && activeCtl && !activeCtl.isPaused) {
      // Lost connectivity — auto-pause to prevent yt-dlp from burning retries
      activeCtl.pause('network');
    } else if (online && activeCtl && activeCtl.isPaused && activeCtl.pauseReason === 'network') {
      // Back online — auto-resume only network-paused downloads (respect user pauses)
      activeCtl.resume();
    }
  }, 3000);
}

ipcMain.handle('get-app-version', () => app.getVersion());


app.whenReady().then(() => {
  createWindow();
  startNetworkMonitoring();
  // Start yt-dlp update check AFTER the renderer finishes loading so the
  // 'checking' IPC event is never sent before the listener is registered.
  mainWindow.webContents.once('did-finish-load', () => {
    updateYtDlp();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Clean up paused downloads on quit — a SIGSTOPped process can't handle SIGTERM
app.on('before-quit', () => {
  destroyPotWindow();
  downloadQueue.forEach(j => { j.cancelled = true; });
  if (activeCtl) {
    activeCtl.cancel();
    // The download's own cleanup runs when its process exits, which is after
    // the app has gone — so remove the scratch dir and partial file now.
    if (activeCtl.cleanupNow) activeCtl.cleanupNow();
  }
  if (networkCheckInterval) {
    clearInterval(networkCheckInterval);
    networkCheckInterval = null;
  }
});
app.on("activate", () => {
  // Count the main window specifically — a helper window (sign-in, PO token)
  // must not stop the dock icon from bringing the app back.
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
});

const formatBytes = (bytes, decimals = 2) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const sizeToBytes = (value, unit) => {
  const normalizedUnit = (unit || '').toUpperCase();
  const multiplierMap = {
    B: 1,
    KB: 1024,
    KIB: 1024,
    MB: 1024 ** 2,
    MIB: 1024 ** 2,
    GB: 1024 ** 3,
    GIB: 1024 ** 3,
    TB: 1024 ** 4,
    TIB: 1024 ** 4,
  };
  const multiplier = multiplierMap[normalizedUnit] || 1;
  return Math.round(value * multiplier);
};

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
ipcMain.handle("get-history", () => store.get('downloadHistory', []));
ipcMain.handle("clear-history", () => store.set('downloadHistory', []));
ipcMain.handle("add-history-item", (event, item) => {
  const history = store.get('downloadHistory', []);
  const updated = [item, ...history];
  store.set('downloadHistory', updated);
});
ipcMain.handle("delete-history-item", (event, timestamp) => {
  const history = store.get('downloadHistory', []);
  const updated = history.filter(item => item.timestamp !== timestamp);
  store.set('downloadHistory', updated);
  return updated;
});
// Replace an existing history entry in-place (matched by timestamp).
// Used when removing individual videos from a playlist history entry.
ipcMain.handle("update-history-item", (event, item) => {
  const history = store.get('downloadHistory', []);
  const updated = history.map(h => (h.timestamp === item.timestamp ? item : h));
  store.set('downloadHistory', updated);
  return updated;
});

ipcMain.handle("open-file-location", (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
  } else {
    dialog.showErrorBox(
      "File Not Found",
      "The file could not be found at the original location. It may have been moved or deleted."
    );
  }
});

const isDirectory = (p) => {
  try { return !!p && fs.statSync(p).isDirectory(); } catch (e) { return false; }
};

// Reveal a specific file if it still exists, otherwise fall back to opening
// the containing folder (used by playlist history items).
ipcMain.handle("open-file-or-folder", (event, { filePath, fallbackDir }) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return { opened: 'file' };
  }
  // openPath *executes* a file, so only ever hand it a directory.
  if (isDirectory(fallbackDir)) {
    shell.openPath(fallbackDir);
    return { opened: 'folder' };
  }
  dialog.showErrorBox(
    "Not Found",
    "The file and its folder could not be found. They may have been moved or deleted."
  );
  return { opened: 'none' };
});

ipcMain.handle("file-exists", (event, filePath) => {
  try {
    return !!filePath && fs.existsSync(filePath);
  } catch (e) {
    return false;
  }
});

// Web URLs only. Several call sites hand this a page URL straight out of
// extractor output or the stored history, and shell.openExternal on a file://
// or custom-scheme URL would launch local programs.
ipcMain.handle("open-external-link", async (event, url) => {
  let parsed;
  try { parsed = new URL(String(url)); } catch (e) { parsed = null; }
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
    console.warn('Refusing to open non-web URL:', String(url).slice(0, 200));
    return false;
  }
  try {
    await shell.openExternal(parsed.toString());
    return true;
  } catch (e) {
    console.error('Failed to open external link:', e.message);
    return false;
  }
});

ipcMain.on("cancel-info-fetch", () => {
  if (currentInfoFetchProcess) {
    try {
      currentInfoFetchProcess.kill('SIGTERM');
    } catch (e) {
      console.error('Failed to kill info fetch process:', e.message);
    }
    currentInfoFetchProcess = null;
  }
});

// ---------------------------------------------------------------------------
// YouTube authentication (cookies)
// ---------------------------------------------------------------------------
const COOKIES_PATH = path.join(app.getPath('userData'), 'youtube_cookies.txt');

async function extractYouTubeCookies() {
  const cookies = await session.defaultSession.cookies.get({ domain: '.youtube.com' });
  let cookieText = '# Netscape HTTP Cookie File\n';
  cookies.forEach(cookie => {
    const domain = cookie.domain;
    const includeSubDomain = domain.startsWith('.') ? 'TRUE' : 'FALSE';
    const cPath = cookie.path;
    const secure = cookie.secure ? 'TRUE' : 'FALSE';
    const expiry = cookie.expirationDate ? Math.floor(cookie.expirationDate) : 0;
    cookieText += `${domain}\t${includeSubDomain}\t${cPath}\t${secure}\t${expiry}\t${cookie.name}\t${cookie.value}\n`;
  });
  fs.writeFileSync(COOKIES_PATH, cookieText, 'utf8');
}

ipcMain.handle("login-youtube", async () => {
  return new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 500,
      height: 600,
      title: "Sign in to YouTube",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      },
      autoHideMenuBar: true
    });

    loginWin.loadURL('https://accounts.google.com/ServiceLogin?service=youtube');

    let resolved = false;

    loginWin.webContents.on('did-navigate', async (event, url) => {
      // If we landed back on youtube, login was likely successful
      if (url.includes('youtube.com') && !url.includes('accounts.google.com') && !resolved) {
        resolved = true;
        await extractYouTubeCookies();
        loginWin.close();
        resolve(true);
      }
    });

    loginWin.on('closed', () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
  });
});

ipcMain.handle("logout-youtube", async () => {
  // Clear just youtube cookies so we don't nuke everything else if the user uses the app for other things
  const cookies = await session.defaultSession.cookies.get({ domain: '.youtube.com' });
  for (const cookie of cookies) {
    let url = (cookie.secure ? 'https://' : 'http://') + cookie.domain.replace(/^\./, '') + cookie.path;
    await session.defaultSession.cookies.remove(url, cookie.name);
  }
  const googleCookies = await session.defaultSession.cookies.get({ domain: '.google.com' });
  for (const cookie of googleCookies) {
    let url = (cookie.secure ? 'https://' : 'http://') + cookie.domain.replace(/^\./, '') + cookie.path;
    await session.defaultSession.cookies.remove(url, cookie.name);
  }
  if (fs.existsSync(COOKIES_PATH)) {
    fs.unlinkSync(COOKIES_PATH);
  }
  return true;
});

ipcMain.handle("check-youtube-auth", async () => {
  const cookies = await session.defaultSession.cookies.get({ domain: '.youtube.com', name: 'LOGIN_INFO' });
  if (cookies.length > 0) {
    await extractYouTubeCookies();
    return true;
  }
  const sidCookies = await session.defaultSession.cookies.get({ domain: '.youtube.com', name: 'SID' });
  if (sidCookies.length > 0) {
    await extractYouTubeCookies();
    return true;
  }
  return false;
});

/**
 * True for youtube.com / youtu.be (and their subdomains) only.
 *
 * yt-dlp supports 1000+ sites and most of them need none of the YouTube
 * workarounds below. Anything YouTube-specific — the cookie jar, the
 * player-client retry, playlist URL reconstruction — is gated on this so a
 * PornHub or Dailymotion link takes the plain, generic path.
 */
function isYouTubeUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'youtube.com' || host.endsWith('.youtube.com') ||
      host === 'youtu.be' || host.endsWith('.youtu.be');
  } catch (e) {
    return false;
  }
}

/**
 * The cookie jar is scraped from an embedded *YouTube* login, so it only ever
 * belongs on YouTube requests. Handing it to unrelated extractors leaks the
 * user's Google session cookies to third-party hosts for no benefit.
 */
function getAuthArgs(url) {
  if (url !== undefined && !isYouTubeUrl(url)) return [];
  if (fs.existsSync(COOKIES_PATH)) {
    return ['--cookies', COOKIES_PATH];
  }
  return [];
}

// ---------------------------------------------------------------------------
// PO Tokens
// ---------------------------------------------------------------------------
/**
 * YouTube gates most streaming URLs behind a "Proof of Origin" token. Minting
 * one means running Google's BotGuard VM — obfuscated JS that needs a real DOM
 * — so the usual yt-dlp answer is a headless-Chrome or jsdom sidecar. We are
 * already a browser, so we run the VM in an offscreen window instead (see
 * src/potoken/) and hand the token to yt-dlp via --extractor-args.
 *
 * Without one, a client whose formats need a token yields a single 360p muxed
 * stream; with one, the full adaptive ladder comes back.
 *
 * This is deliberately only reached on the *retry* path: the clients that
 * serve most videos (tv, web_embedded) need no token at all, so minting on
 * every fetch would add a BotGuard run per video and buy nothing.
 */

// Every client that can require a GVS token. android/ios additionally gate the
// player response itself, hence the extra `.player` entries. One mint covers
// them all — they share the same content binding.
const POTOKEN_CLIENTS = ['web', 'web_safari', 'web_creator', 'web_music', 'mweb', 'tv_simply'];
const POTOKEN_PLAYER_CLIENTS = ['android', 'ios'];

// WAA's integrity token outlives this comfortably; the cap exists so a token
// minted before a network/account change doesn't linger.
const POTOKEN_TTL_MS = 60 * 60 * 1000;
const POTOKEN_IDLE_MS = 5 * 60 * 1000;
const POTOKEN_MINT_TIMEOUT_MS = 30 * 1000;

// The only hosts the offscreen window is allowed to reach through the bridge.
const POTOKEN_ALLOWED_ORIGINS = new Set(['https://jnn-pa.googleapis.com', 'https://www.youtube.com']);

let potWindow = null;
let potWindowPromise = null;
let potIdleTimer = null;
const potTokenCache = new Map(); // videoId -> { token, t }

/**
 * The offscreen window talks to Google's WAA API through here rather than
 * fetching directly, which keeps it at default security settings — no
 * disabled webSecurity, no host permissions of its own.
 */
ipcMain.handle('potoken:fetch', async (event, url, init = {}) => {
  if (!potWindow || event.sender !== potWindow.webContents) {
    return { error: 'not permitted', status: 0, statusText: '', body: '' };
  }
  let origin;
  try {
    origin = new URL(url).origin;
  } catch (e) {
    return { error: 'bad url', status: 0, statusText: '', body: '' };
  }
  if (!POTOKEN_ALLOWED_ORIGINS.has(origin)) {
    return { error: `blocked origin ${origin}`, status: 0, statusText: '', body: '' };
  }
  try {
    const res = await net.fetch(url, {
      method: init.method || 'GET',
      headers: init.headers || {},
      body: init.body,
    });
    return { status: res.status, statusText: res.statusText, body: await res.text() };
  } catch (e) {
    return { error: e.message, status: 0, statusText: '', body: '' };
  }
});

function destroyPotWindow() {
  if (potIdleTimer) { clearTimeout(potIdleTimer); potIdleTimer = null; }
  if (potWindow && !potWindow.isDestroyed()) potWindow.destroy();
  potWindow = null;
}

function schedulePotWindowTeardown() {
  if (potIdleTimer) clearTimeout(potIdleTimer);
  potIdleTimer = setTimeout(destroyPotWindow, POTOKEN_IDLE_MS);
  // A pending teardown must not hold the app open on quit.
  if (potIdleTimer.unref) potIdleTimer.unref();
}

async function getPotWindow() {
  if (potWindow && !potWindow.isDestroyed()) return potWindow;
  if (potWindowPromise) return potWindowPromise;

  const dir = path.join(__dirname, 'potoken');
  potWindowPromise = (async () => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(dir, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        // A hidden window gets its timers throttled, and BotGuard leans on
        // them heavily enough to stall the mint.
        backgroundThrottling: false,
      },
    });
    win.on('closed', () => { potWindow = null; });
    // Publish only once the page is up: a concurrent caller that sees
    // `potWindow` set mid-load would call __mintPoToken before entry.js has
    // defined it. The IPC bridge keys off the same variable, but nothing
    // fetches until the mint starts, which is strictly after this point.
    await win.loadFile(path.join(dir, 'index.html'));
    potWindow = win;
    return win;
  })();

  try {
    return await potWindowPromise;
  } catch (err) {
    if (potWindow && !potWindow.isDestroyed()) potWindow.destroy();
    potWindow = null;
    throw err;
  } finally {
    potWindowPromise = null;
  }
}

async function mintPoToken(videoId) {
  const hit = potTokenCache.get(videoId);
  if (hit && Date.now() - hit.t < POTOKEN_TTL_MS) {
    schedulePotWindowTeardown();
    return hit.token;
  }

  const win = await getPotWindow();
  const mint = win.webContents.executeJavaScript(
    `window.__mintPoToken(${JSON.stringify(videoId)})`, true);
  const token = await Promise.race([
    mint,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PO token mint timed out')), POTOKEN_MINT_TIMEOUT_MS)),
  ]);

  if (typeof token !== 'string' || !token) throw new Error('PO token mint returned nothing');
  potTokenCache.set(videoId, { token, t: Date.now() });
  schedulePotWindowTeardown();
  return token;
}

/**
 * The 11-character id YouTube binds tokens to. Anything else (a playlist page,
 * a channel URL, another site) has no video-id binding and gets no token.
 */
function youTubeVideoId(url) {
  if (!isYouTubeUrl(url)) return null;
  const id = videoKeyFromUrl(url);
  return typeof id === 'string' && /^[\w-]{11}$/.test(id) ? id : null;
}

function potTokenExtractorValue(token) {
  return [
    ...POTOKEN_CLIENTS.map(c => `${c}.gvs+${token}`),
    ...POTOKEN_PLAYER_CLIENTS.flatMap(c => [`${c}.gvs+${token}`, `${c}.player+${token}`]),
  ].join(',');
}

/**
 * Mints (or reuses) a token for `url` and returns the `po_token=` fragment for
 * --extractor-args, or null when one isn't applicable or minting failed.
 * Never throws: a missing token is a missed upgrade, not a failed download.
 */
async function getPoTokenArg(url) {
  const videoId = youTubeVideoId(url);
  if (!videoId) return null;
  try {
    return potTokenExtractorValue(await mintPoToken(videoId));
  } catch (err) {
    console.warn('PO token mint failed:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// YouTube player-client retries
// ---------------------------------------------------------------------------
/**
 * Which clients to ask when the default set comes back empty or stripped.
 *
 * It is the historical `default,android` plus web_music, and it is used for
 * every retry — a stripped response, an age gate, a bot check. One list rather
 * than one per symptom, because the additions are strictly free: measured
 * identical ladders to `default,android` on normal videos, and identical to
 * web_music alone on age-gated ones (15 formats, 1608p), downloading cleanly
 * at every quality rung.
 *
 * web_music is the load-bearing entry. Since ~Aug 2026 the TV client answers
 * age-gated videos with "The page needs to be reloaded" and the plain web
 * clients are SABR-only (no URLs at all); web_music is the one client that
 * still clears the gate *and* serves downloadable URLs — given a PO token.
 *
 * mweb is deliberately absent. It also clears the gate and looks healthy in
 * `-J`, but its age-gated media URLs 403, so including it risks yt-dlp
 * choosing a dead URL for an itag another client also offers.
 */
const YT_RETRY_CLIENTS = 'default,android,web_music';

// yt-dlp failure kinds worth a second attempt with the gated client set.
const YT_RETRYABLE_KINDS = new Set(['age-blocked', 'no-formats', 'bot-check']);

/**
 * Video id -> the player_client list that produced the formats we showed.
 * A download re-extracts, so it must ask the *same* clients (with a fresh
 * token) or the age gate slams shut again between "fetch" and "download".
 */
const ytClientOverrides = new Map();
const YT_CLIENT_OVERRIDES_MAX = 500;

function rememberClientOverride(url, clients) {
  const videoId = youTubeVideoId(url);
  if (!videoId) return;
  if (ytClientOverrides.size >= YT_CLIENT_OVERRIDES_MAX) {
    ytClientOverrides.delete(ytClientOverrides.keys().next().value);
  }
  ytClientOverrides.set(videoId, clients);
}

/** `--extractor-args` value for a YouTube retry: the client list plus a PO
 *  token when one can be minted. */
async function ytExtractorArgs(url, clients) {
  const poToken = await getPoTokenArg(url);
  return poToken
    ? `youtube:player_client=${clients};po_token=${poToken}`
    : `youtube:player_client=${clients}`;
}

/** Extra yt-dlp args a download needs to see the same formats the fetch did. */
async function ytDownloadArgs(url) {
  const videoId = youTubeVideoId(url);
  const clients = videoId && ytClientOverrides.get(videoId);
  if (!clients) return [];
  return ['--extractor-args', await ytExtractorArgs(url, clients)];
}


// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------
/**
 * yt-dlp reports why a fetch failed, but the reasons arrive as raw stderr
 * ("ERROR: [youtube] abc123: Sorry, this content is age-restricted"). Reduce
 * that to a stable `kind` the renderer can turn into an explanation, plus a
 * cleaned-up sentence to fall back on.
 *
 * Order matters: the specific patterns have to win over the generic
 * "Video unavailable" that YouTube attaches to several of them.
 */
const YTDLP_ERROR_KINDS = [
  ['age-signin', /Sign in to confirm your age|confirm your age/i],
  ['age-blocked', /content is age.restricted|requiring account age.verification/i],
  ['bot-check', /confirm you'?re not a bot|Sign in to confirm/i],
  ['members-only', /members.only|available to this channel's members|join this channel/i],
  ['private', /Private video|This video is private/i],
  ['geo-blocked', /available in your country|blocked it in your country|geo.?restrict|available from your location|available in your location/i],
  ['upcoming', /Premieres in|This live event will begin|premiere/i],
  ['removed', /has been removed|terminated|no longer available|removed by the uploader/i],
  ['no-formats', /Requested format is not available|Only images are available|SABR|missing a URL/i],
  ['rate-limited', /HTTP Error 429|Too Many Requests|rate.?limit/i],
  ['network', /Unable to download|Connection reset|Temporary failure in name resolution|getaddrinfo|timed out|Network is unreachable|SSL|certificate/i],
  ['unsupported', /Unsupported URL|is not a valid URL|Unable to extract|Unable to recognize/i],
  ['unavailable', /Video unavailable|This video is unavailable/i],
];

function classifyYtDlpError(stderr) {
  for (const [kind, re] of YTDLP_ERROR_KINDS) {
    if (re.test(stderr)) return kind;
  }
  return 'unknown';
}

/**
 * Turn multi-line yt-dlp stderr into one sentence: take the last ERROR line
 * (earlier ones are usually per-client noise) and strip the
 * "ERROR: [extractor] id:" prefix and any "; please report this" tail.
 */
function cleanYtDlpError(stderr) {
  const lines = String(stderr || '').split('\n').map(l => l.trim()).filter(Boolean);
  const errorLines = lines.filter(l => l.startsWith('ERROR:'));
  const line = errorLines.length ? errorLines[errorLines.length - 1] : lines[lines.length - 1] || '';
  return line
    .replace(/^ERROR:\s*/, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^[\w-]{3,24}:\s*/, '')
    .replace(/\s*[;.]?\s*(Please report this issue|You might want to use|See\s+https?:\/\/\S+).*$/i, '')
    .trim() || 'yt-dlp could not read this URL';
}

function ytDlpError(stderr) {
  const err = new Error(cleanYtDlpError(stderr));
  err.kind = classifyYtDlpError(stderr);
  err.raw = stderr;
  return err;
}

// ---------------------------------------------------------------------------
// Info fetching
// ---------------------------------------------------------------------------
async function runYtDlpJson(url, extraArgs = [], silent = false) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ytDlpBinaryPath, [
      url,
      '-J',
      ...getAuthArgs(url),
      ...BASE_ARGS,
      ...extraArgs,
    ], { env: getYtDlpEnv(), windowsHide: true });
    if (!silent) currentInfoFetchProcess = proc;
    let out = '';
    let err = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('close', code => {
      if (!silent) currentInfoFetchProcess = null;
      if (code === 0) {
        try {
          resolve(JSON.parse(out));
        } catch (parseErr) {
          reject(new Error('Failed to parse video info'));
        }
      } else {
        const errorMsg = err || `yt-dlp exited with code ${code}`;
        reject(ytDlpError(errorMsg));
      }
    });
    proc.on('error', (e) => {
      if (!silent) currentInfoFetchProcess = null;
      reject(e);
    });
  });
}

/**
 * Returns true when yt-dlp handed back a "basic" YouTube player response —
 * i.e. very few formats or only muxed (combined) streams with no adaptive
 * video-only tracks. In this case we should retry with a different player client.
 */
function isBasicPlayerResponse(formats) {
  if (!formats || formats.length < 10) return true;
  const adaptiveVideo = formats.some(f => f.vcodec && f.vcodec !== 'none' && f.acodec === 'none');
  return !adaptiveVideo;
}

/**
 * In yt-dlp's schema the string 'none' means "this stream has no video/audio".
 * A missing/null codec means "unknown", NOT absent — most non-YouTube
 * extractors leave the codec unset on progressive streams they never probed.
 * Treating unknown as absent is what made every PornHub format disappear.
 */
const codecAbsent = (c) => c === 'none';
const codecKnown = (c) => typeof c === 'string' && c !== 'none' && c !== 'unknown';

/**
 * Height above which the H.264 conversion gets an explicit slowness warning.
 *
 * Measured on an M4 with a real 8K AV1 60fps clip: AV1 decode alone runs at
 * 0.17x realtime and decode + `libx264 -preset medium -crf 18` at 0.04x —
 * roughly 25 minutes of work per minute of video. Decoding dominates, so no
 * encoder preset rescues it, and VideoToolbox refuses to encode H.264 above 4K
 * at all (`cannot create compression session: -12903`).
 *
 * This is deliberately only a warning. The conversion stays available at any
 * resolution: the progress UI reports live speed and ETA, and cancelling
 * during the convert stage offers to keep the already-downloaded original, so
 * a user who changes their mind loses nothing but time.
 */
const H264_SLOW_CONVERT_HEIGHT = 2160;

/** yt-dlp marks audio-only streams with resolution === 'audio only'. */
function isAudioOnlyFormat(f) {
  return codecAbsent(f.vcodec) || f.resolution === 'audio only';
}

/**
 * Best-effort pixel height for a format.
 *
 * YouTube always populates `height`. Other extractors may only give
 * `resolution` ('1080p' or '1920x1080') or a `format_note`/`format_id` that
 * names the rung ('1080p60', 'hd1080'), so fall through those in turn rather
 * than dropping the format.
 */
function formatHeight(f) {
  if (f.height > 0) return f.height;
  for (const s of [f.resolution, f.format_note, f.format_id]) {
    if (typeof s !== 'string') continue;
    const wxh = s.match(/^(\d+)\s*[x×]\s*(\d+)$/);
    if (wxh) return parseInt(wxh[2], 10);
    const p = s.match(/(\d{3,5})\s*p/i);
    if (p) return parseInt(p[1], 10);
  }
  return 0;
}

/** Byte size as reported by the extractor, or 0 when it didn't say. */
function reportedSize(f) {
  return f.filesize || f.filesize_approx || 0;
}

/**
 * Bitrate × duration, the same arithmetic yt-dlp uses for `filesize_approx`.
 *
 * Display only. A guess must never outrank a reported size when picking which
 * format represents a rung, or a stream that merely forgot to declare its
 * length wins on an inflated number.
 */
function estimatedSize(f, durationSec) {
  const kbps = f.tbr || ((f.vbr || 0) + (f.abr || 0));
  if (kbps > 0 && durationSec > 0) return Math.round((kbps * 1000 * durationSec) / 8);
  return 0;
}

/**
 * Build the unique quality list from a yt-dlp info dump.
 *
 * One rung per (height, fps). Where several formats share a rung we keep the
 * one the download is most likely to actually get: adaptive over muxed, then
 * H.264 over VP9 over anything else, then the largest. Codec suffixes are
 * only added to the label when the codec is actually known.
 */
function extractFormats(info) {
  const duration = info.duration || 0;
  const heightMap = {};
  const rawFormats = info.formats || [];

  rawFormats.forEach(f => {
    if (isAudioOnlyFormat(f)) return;

    const rawH = formatHeight(f);
    const rawW = f.width || 0;

    // Use the shorter dimension as the display quality (handles portrait/vertical videos)
    const displayH = (rawW > 0 && rawH > 0) ? Math.min(rawW, rawH) : rawH;

    if (!displayH) return;

    const vcodec = f.vcodec;
    const known = codecKnown(vcodec);
    const size = reportedSize(f);
    const guessedSize = size || estimatedSize(f, duration);
    const fps = f.fps || 30;
    const isAdaptive = codecAbsent(f.acodec);
    const isH264 = known && (vcodec.startsWith('avc') || vcodec.startsWith('h264'));
    const isVP9 = known && (vcodec.startsWith('vp09') || vcodec.startsWith('vp9'));
    const isAV1 = known && vcodec.startsWith('av01');

    const key = `${displayH}_${fps > 30 ? fps : 30}`;

    const codecScore = isH264 ? 2 : (isVP9 ? 1 : 0);
    const score = (isAdaptive ? 4 : 0) + codecScore;

    const cur = heightMap[key];
    const curScore = cur ? (cur.isAdaptive ? 4 : 0) + (cur.isH264 ? 2 : (cur.isVP9 ? 1 : 0)) : -1;

    if (score > curScore || (score === curScore && size > (cur?.size || 0))) {
      heightMap[key] = {
        displayHeight: displayH,   // shorter dimension — for UI label
        ytdlpHeight: rawH,         // actual yt-dlp height — for format filter
        fps, size, guessedSize, isAdaptive, isH264, isVP9, isAV1, known
      };
    }
  });

  // Sub-240p rungs are noise next to a full YouTube ladder, but on a site that
  // only offers 144p they are the whole menu — so drop them only when
  // something better survives.
  const rungs = Object.values(heightMap);
  const above240 = rungs.filter(f => f.displayHeight >= 240);

  const uniqueFormats = (above240.length > 0 ? above240 : rungs)
    .map(f => ({
      itag: `${f.ytdlpHeight}`,   // actual yt-dlp height, used in download format arg
      quality: `${f.displayHeight}p${f.fps > 30 ? f.fps : ''}${f.isVP9 ? ' (VP9)' : (f.isAV1 ? ' (AV1)' : '')}`,
      height: f.displayHeight,
      fps: f.fps > 30 ? f.fps : 30,
      size: f.guessedSize,
      sizeFormatted: f.guessedSize > 0 ? formatBytes(f.guessedSize) : 'N/A',
      // Drives the "convert to H.264" offer. An unknown codec is assumed
      // compatible — offering a needless re-encode is worse than skipping it,
      // and the download itself already prefers H.264 wherever it exists.
      isH264: f.isH264 || !f.known,
      codecKnown: f.known,
      // Not a restriction — the UI uses this to warn how long converting this
      // rung will take before the user commits to it.
      slowToConvert: f.displayHeight > H264_SLOW_CONVERT_HEIGHT,
    }))
    .sort((a, b) => (b.height - a.height) || (b.fps - a.fps));

  const audioFormat = rawFormats
    .filter(f => isAudioOnlyFormat(f) && !codecAbsent(f.acodec))
    .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
  const audioSize = audioFormat
    ? (reportedSize(audioFormat) || estimatedSize(audioFormat, duration))
    : 0;

  // Nothing with a picture in it: SoundCloud, Bandcamp, podcast feeds. The UI
  // uses this to stay in MP3 mode instead of offering an MP4 that would come
  // out as a soundtrack in a box.
  //
  // Requires a real audio stream, so a page that yielded only storyboards or
  // no usable formats at all is reported as a failure rather than quietly
  // presented as a music track.
  const isAudioOnly = uniqueFormats.length === 0 && !!audioFormat &&
    rawFormats.every(isAudioOnlyFormat);

  return {
    formats: uniqueFormats.length > 0
      ? uniqueFormats
      : (isAudioOnly ? [] : [{ itag: 'best', quality: 'Best', height: 0, size: 0, sizeFormatted: 'N/A', isH264: true, codecKnown: false }]),
    audioSize,
    isAudioOnly,
  };
}

/**
 * Fetch a single video's info, with the YouTube player-client retry.
 *
 * The retry is YouTube-only on purpose. `--extractor-args youtube:...` means
 * nothing to the other 1000+ extractors, and "fewer than 10 formats" is normal
 * for most of them — so running it everywhere bought a second cold start per
 * fetch and nothing else.
 *
 * It also only *upgrades*. Some sites hand back a shorter list on a second
 * call (PornHub's HLS manifests expire within minutes), and blindly taking the
 * retry's answer would throw away the better one we already had.
 */
async function fetchVideoInfoWithRetry(url, silent) {
  let info;
  try {
    info = await runYtDlpJson(url, [], silent);
  } catch (err) {
    // The default clients refused outright. For a signed-in YouTube user that
    // is almost always the age gate, which only the gated client set (plus a
    // PO token) gets past. If that fails too, surface the *original* error —
    // it carries the meaningful classification.
    if (!isYouTubeUrl(url) || !YT_RETRYABLE_KINDS.has(err.kind)) throw err;
    let retried;
    try {
      retried = await runYtDlpJson(url, ['--extractor-args', await ytExtractorArgs(url, YT_RETRY_CLIENTS)], silent);
    } catch (retryErr) {
      console.warn('Retry with explicit client set failed:', retryErr.message);
      throw err;
    }
    rememberClientOverride(url, YT_RETRY_CLIENTS);
    return retried;
  }
  if (!isYouTubeUrl(url) || !isBasicPlayerResponse(info.formats)) return info;

  // A stripped response usually means the client that answered needs a PO
  // token. Mint one before retrying so the pot-gated clients are actually
  // usable; without it the retry can only shuffle between clients that are
  // equally blocked.
  try {
    const retried = await runYtDlpJson(url, ['--extractor-args', await ytExtractorArgs(url, YT_RETRY_CLIENTS)], silent);
    const before = (info.formats || []).length;
    const after = (retried.formats || []).length;
    if (after >= before) {
      rememberClientOverride(url, YT_RETRY_CLIENTS);
      return retried;
    }
    return info;
  } catch (retryErr) {
    // Retry failed — carry on with whatever we got the first time
    console.warn('Player-client retry failed, using initial result:', retryErr.message);
    return info;
  }
}

// Short-lived, in-memory only. Bouncing between the playlist prompt, the
// details view and back is common, and each miss costs a full yt-dlp launch.
const VIDEO_INFO_TTL_MS = 10 * 60 * 1000;
const VIDEO_INFO_MAX = 50;
const videoInfoCache = new Map(); // videoId (or raw url) -> { t, payload }

/**
 * Stable cache key for a watch/shorts/youtu.be URL.
 *
 * Only YouTube collapses to a bare id — other sites use `?v=` for unrelated
 * things, and keying on it would let two different sites' videos share a cache
 * entry. Everything else keys on the full URL.
 */
function videoKeyFromUrl(url) {
  if (!isYouTubeUrl(url)) return url;
  try {
    const u = new URL(url);
    const v = u.searchParams.get('v');
    if (v) return v;
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1) || url;
    const m = u.pathname.match(/\/shorts\/([^/?#]+)/);
    if (m) return m[1];
  } catch (e) { /* not a URL — fall through */ }
  return url;
}

ipcMain.handle("get-video-info", async (event, url) => {
  if (isUpdatingYtDlp) {
    return { success: false, error: 'yt-dlp is updating in the background, please try again in a moment.' };
  }

  const cacheKey = videoKeyFromUrl(url);
  const cached = videoInfoCache.get(cacheKey);
  if (cached && Date.now() - cached.t < VIDEO_INFO_TTL_MS) {
    console.log('Serving video info from cache:', cacheKey);
    return cached.payload;
  }

  try {
    console.log('Fetching video info for:', url);
    const info = await fetchVideoInfoWithRetry(url, false);
    const { formats, audioSize, isAudioOnly } = extractFormats(info);
    console.log('Available qualities:', isAudioOnly ? 'audio only' : formats.map(f => f.quality).join(', '));

    const payload = {
      success: true,
      videoId: info.id,
      formats,
      title: info.title,
      description: info.description || '',
      thumbnailUrl: info.thumbnail,
      duration: info.duration || 0,
      uploader: info.uploader || info.channel || '',
      audioSize,
      audioSizeFormatted: formatBytes(audioSize),
      isAudioOnly,
      // The URL the download must actually use. yt-dlp ids are only
      // round-trippable back into a URL on YouTube; everywhere else the id is
      // extractor-local ('65a46f8847bef') and rebuilding a link from it
      // produces a dead one.
      webpageUrl: info.webpage_url || info.original_url || url,
      extractor: info.extractor_key || info.extractor || '',
    };

    if (videoInfoCache.size >= VIDEO_INFO_MAX) {
      videoInfoCache.delete(videoInfoCache.keys().next().value);
    }
    videoInfoCache.set(cacheKey, { t: Date.now(), payload });
    // The playlist view can reuse the derived formats for this video for free
    if (info.id) cacheFormats(info.id, { success: true, formats, audioSize, isAudioOnly });

    return payload;
  } catch (error) {
    console.error("Error fetching video info:", error.raw || error);
    return {
      success: false,
      error: error.message,
      errorKind: error.kind || 'unknown',
      // Only the "not signed in" flavour is fixable by signing in; being
      // blocked *while* signed in must not send the user back to the login.
      isAgeRestricted: error.kind === 'age-signin',
    };
  }
});

ipcMain.handle("get-playlist-info", async (event, url) => {
  if (isUpdatingYtDlp) {
    return { success: false, error: 'yt-dlp is updating in the background, please try again in a moment.' };
  }
  try {
    // On YouTube a watch URL carrying ?list= is ambiguous, so rebuild a bare
    // playlist URL to force the playlist reading. Elsewhere `list` is just
    // another query parameter and rewriting the URL would point at the wrong
    // site entirely — pass those through untouched.
    let cleanUrl = url;
    if (isYouTubeUrl(url)) {
      try {
        const listId = new URL(url).searchParams.get('list');
        if (listId) cleanUrl = `https://www.youtube.com/playlist?list=${listId}`;
      } catch (e) {}
    }

    console.log('Fetching playlist info for:', cleanUrl);
    const info = await runYtDlpJson(cleanUrl, ['--flat-playlist', '--yes-playlist']);

    const entries = info.entries || [];
    const fromYouTube = isYouTubeUrl(cleanUrl);

    const videos = entries
      .map((v, i) => {
        if (!v.id || !v.title || v.title === '[Private video]' || v.title === '[Deleted video]') return null;
        // Only YouTube ids round-trip into a URL. For every other extractor a
        // missing entry URL means we have nothing to download from, so drop
        // the entry rather than fabricate a youtube.com link that 404s.
        const entryUrl = v.url || v.webpage_url ||
          (fromYouTube ? `https://www.youtube.com/watch?v=${v.id}` : null);
        if (!entryUrl) return null;
        return {
          id: v.id,
          // 1-based position in the source playlist. Kept even when earlier
          // entries were dropped (private/deleted), so the numbers a user sees
          // here match the numbers on the site.
          index: v.playlist_index || i + 1,
          url: entryUrl,
          title: v.title,
          duration: v.duration || 0,
          uploader: v.uploader || v.channel || info.uploader || info.channel || 'Unknown',
          thumbnail: v.thumbnails && v.thumbnails.length > 0
            ? v.thumbnails[v.thumbnails.length - 1].url
            : (fromYouTube ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : '')
        };
      })
      .filter(Boolean);

    if (videos.length === 0) {
      return { success: false, error: 'No downloadable videos were found at that link.' };
    }

    return {
      success: true,
      title: info.title || 'Unknown Playlist',
      uploader: info.uploader || info.channel || 'Unknown',
      description: info.description || '',
      videos
    };
  } catch (error) {
    console.error('Error fetching playlist info:', error.raw || error);
    return {
      success: false,
      error: error.message,
      errorKind: error.kind || 'unknown',
      isAgeRestricted: error.kind === 'age-signin',
    };
  }
});

// ---------------------------------------------------------------------------
// Playlist format prefetching — staggered worker pool + persistent cache.
// Results are streamed back per-video via 'playlist-format-result' events so
// the UI fills in as fast as each video resolves instead of waiting in line.
//
// Sizing note: a yt-dlp launch pays several seconds of fixed, CPU-bound
// startup before it extracts anything. Those startups do NOT overlap — running
// six at once simply serialises them and pushes the FIRST result minutes out.
// One process starts immediately on the head of the list; extra ones are added
// only for long playlists, staggered so their startups don't collide.
// ---------------------------------------------------------------------------
const PREFETCH_MAX_PROCS = 3;
const PREFETCH_VIDEOS_PER_PROC = 15; // only add a worker when it has real work
const PREFETCH_STAGGER_MS = 7000;    // roughly one cold start apart

const delay = (ms) => new Promise(r => setTimeout(r, ms));

let prefetchToken = 0;
const prefetchProcs = new Set(); // live child processes, killed on cancel/restart

function killPrefetchProcs() {
  for (const proc of prefetchProcs) {
    try { proc.kill('SIGTERM'); } catch (e) { }
  }
  prefetchProcs.clear();
}

// ── Format cache ────────────────────────────────────────────────────────────
// Only derived metadata (heights, fps, codec flags, byte sizes) is stored —
// no stream URLs — so entries stay valid for a long time and survive restarts.
const FORMAT_CACHE_KEY = 'formatCacheV1';
const FORMAT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// ~800 bytes/entry, and electron-store writes synchronously on the main
// thread — 500 keeps each write well under half a megabyte.
const FORMAT_CACHE_MAX = 500;
// Longer than the gap between streamed results, so a whole playlist prefetch
// collapses into a single write instead of one per video.
const FORMAT_CACHE_SAVE_DEBOUNCE_MS = 5000;

const formatCache = new Map(); // videoId -> { success, formats, audioSize, t }

(function loadFormatCache() {
  try {
    const now = Date.now();
    for (const [id, v] of Object.entries(store.get(FORMAT_CACHE_KEY, {}) || {})) {
      if (v && v.t && Array.isArray(v.formats) && now - v.t < FORMAT_CACHE_TTL_MS) {
        formatCache.set(id, v);
      }
    }
    console.log(`Format cache: ${formatCache.size} entries restored`);
  } catch (e) {
    console.log('Format cache unreadable, starting fresh:', e.message);
  }
})();

let formatCacheSaveTimer = null;
let formatCacheDirty = false;

function flushFormatCache() {
  clearTimeout(formatCacheSaveTimer);
  formatCacheSaveTimer = null;
  if (!formatCacheDirty) return;
  formatCacheDirty = false;
  try {
    let entries = [...formatCache.entries()];
    if (entries.length > FORMAT_CACHE_MAX) {
      entries.sort((a, b) => b[1].t - a[1].t);
      entries = entries.slice(0, FORMAT_CACHE_MAX);
      formatCache.clear();
      for (const [k, v] of entries) formatCache.set(k, v);
    }
    store.set(FORMAT_CACHE_KEY, Object.fromEntries(entries));
  } catch (e) {
    // A cache write must never take the app down — worst case we re-fetch
    console.log('Failed to persist format cache (non-critical):', e.message);
  }
}

function persistFormatCache() {
  formatCacheDirty = true;
  clearTimeout(formatCacheSaveTimer);
  formatCacheSaveTimer = setTimeout(flushFormatCache, FORMAT_CACHE_SAVE_DEBOUNCE_MS);
}

// Don't lose a prefetch that finished seconds before the user quit
app.on('before-quit', flushFormatCache);

function cacheFormats(id, result) {
  formatCache.set(id, { ...result, t: Date.now() });
  persistFormatCache();
}

/** Cached entry in the shape the renderer expects (no bookkeeping fields). */
function cachedFormatResult(id) {
  const { t, ...rest } = formatCache.get(id);
  return rest;
}

/**
 * Spawn ONE yt-dlp process for a batch of video URLs. yt-dlp prints one JSON
 * line per video as it extracts (-j), so results stream in at ~2s/video after
 * a single process startup instead of paying ~5-30s of process+challenge
 * overhead per video.
 */
function streamFormatsBatch(videos, token, onRetry) {
  return new Promise((resolve) => {
    if (videos.length === 0) return resolve();
    const args = [
      ...videos.map(v => v.url),
      '-j',
      '--ignore-errors',
      // A batch always comes from one playlist, so one host — the first entry
      // decides whether the YouTube cookie jar applies to the whole run.
      ...getAuthArgs(videos[0]?.url),
      ...BASE_ARGS,
    ];
    const proc = spawn(ytDlpBinaryPath, args, { env: getYtDlpEnv(), windowsHide: true });
    prefetchProcs.add(proc);

    const received = new Set();
    let buf = '';

    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const info = JSON.parse(line);
          const id = info.id;
          if (!id) continue;
          received.add(id);
          const { formats, audioSize, isAudioOnly } = extractFormats(info);
          const result = { success: true, formats, audioSize, isAudioOnly };
          // A stripped "basic" response is worth a targeted retry later, but
          // still send it now so the row becomes interactive immediately.
          // Only YouTube has a second player client to retry against, and only
          // YouTube ids can be turned back into a URL — everything else keeps
          // whatever the extractor gave us.
          const pageUrl = info.webpage_url || info.original_url;
          const canRetry = pageUrl ? isYouTubeUrl(pageUrl) : isYouTubeUrl(videos[0]?.url);
          if (canRetry && isBasicPlayerResponse(info.formats) && onRetry) {
            onRetry({ id, url: pageUrl || `https://www.youtube.com/watch?v=${id}`, clients: YT_RETRY_CLIENTS });
          } else {
            cacheFormats(id, result);
          }
          if (token === prefetchToken) safeSend('playlist-format-result', { id, ...result });
        } catch (e) { /* partial/non-JSON line — ignore */ }
      }
    });

    // --ignore-errors keeps the batch going past a failed video, and yt-dlp
    // names the video in each ERROR line — enough to tell an age gate (worth
    // a gated-client retry) from a private or deleted video (not).
    let errBuf = '';
    proc.stderr.on('data', (chunk) => { errBuf += chunk.toString(); });

    const finish = () => {
      prefetchProcs.delete(proc);
      const failureKinds = new Map();
      for (const line of errBuf.split('\n')) {
        const m = line.match(/^ERROR: \[[^\]]+\] ([\w-]{11}): /);
        if (m) failureKinds.set(m[1], classifyYtDlpError(line));
      }
      // Videos the process never produced output for (private, deleted, error)
      for (const v of videos) {
        if (received.has(v.id) || token !== prefetchToken) continue;
        if (onRetry && isYouTubeUrl(v.url) && YT_RETRYABLE_KINDS.has(failureKinds.get(v.id))) {
          // Hold the failure back: the retry reports success or failure itself.
          onRetry({ id: v.id, url: v.url, clients: YT_RETRY_CLIENTS, reportFailure: true });
          continue;
        }
        safeSend('playlist-format-result', { id: v.id, success: false, formats: [], audioSize: 0 });
      }
      resolve();
    };
    proc.on('close', finish);
    proc.on('error', finish);
  });
}

ipcMain.handle("prefetch-playlist-formats", async (event, videos) => {
  const token = ++prefetchToken;
  killPrefetchProcs(); // a new prefetch supersedes any previous one
  if (!Array.isArray(videos) || videos.length === 0) return { done: true };

  // Serve cached entries instantly — a revisited playlist needs no work at all
  const pending = [];
  for (const v of videos) {
    if (formatCache.has(v.id)) {
      safeSend('playlist-format-result', { id: v.id, ...cachedFormatResult(v.id) });
    } else {
      pending.push(v);
    }
  }
  if (pending.length === 0) return { done: true };

  const nProcs = Math.min(
    PREFETCH_MAX_PROCS,
    Math.max(1, Math.ceil(pending.length / PREFETCH_VIDEOS_PER_PROC))
  );

  // Contiguous split: the first process owns the head of the list, which is
  // what the user is actually looking at while the rest streams in.
  const per = Math.ceil(pending.length / nProcs);
  const batches = Array.from({ length: nProcs }, (_, i) => pending.slice(i * per, (i + 1) * per))
    .filter(b => b.length > 0);

  // Videos that returned a stripped player response, or were refused by the
  // age gate, get a targeted 2nd pass with an explicit client set.
  const retries = [];
  const onRetry = (r) => retries.push(r);

  await Promise.all(batches.map(async (batch, i) => {
    if (i > 0) {
      await delay(i * PREFETCH_STAGGER_MS);
      if (token !== prefetchToken) return;
    }
    return streamFormatsBatch(batch, token, onRetry);
  }));

  // Second pass: retry stripped responses with an explicit player client.
  // Sequential — these are extra cold starts, and parallelising them only
  // makes each one finish later.
  for (const v of retries) {
    if (token !== prefetchToken) break;
    const failed = () => {
      // A stripped result was already sent and stays; a held-back gate
      // failure is reported now that the retry has also come up empty.
      if (v.reportFailure && token === prefetchToken) {
        safeSend('playlist-format-result', { id: v.id, success: false, formats: [], audioSize: 0 });
      }
    };
    try {
      const info = await runYtDlpJson(v.url, ['--extractor-args', await ytExtractorArgs(v.url, v.clients)], true);
      const { formats, audioSize, isAudioOnly } = extractFormats(info);
      if (formats.length === 0 && !isAudioOnly) { failed(); continue; }
      rememberClientOverride(v.url, v.clients);
      const result = { success: true, formats, audioSize, isAudioOnly };
      cacheFormats(v.id, result);
      if (token === prefetchToken) safeSend('playlist-format-result', { id: v.id, ...result });
    } catch (e) { failed(); }
  }

  return { done: true };
});

ipcMain.on("cancel-playlist-prefetch", () => {
  prefetchToken++;
  killPrefetchProcs();
});

ipcMain.handle("choose-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: getSaveDirectory(),
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  // The chosen folder IS the destination here, not the parent of one.
  rememberSaveDirectory(result.filePaths[0]);
  return result.filePaths[0];
});

// Ordered download candidates for a thumbnail URL. Playlist entries carry
// hqdefault (480x360, letterboxed to 4:3), so for i.ytimg.com try the clean
// 16:9 variants in descending quality, falling back until one exists (missing
// variants return a real 404). The /vi/*.jpg form is preferred so writeJpeg
// can skip the transcode. Non-YouTube URLs are used as-is.
function thumbnailCandidates(rawUrl) {
  // Some extractors emit protocol-relative URLs; the <img> tag resolves them
  // against the page, net.fetch cannot.
  if (typeof rawUrl === 'string' && rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
  try {
    const u = new URL(rawUrl);
    if (u.hostname === 'i.ytimg.com') {
      u.search = '';
      u.pathname = u.pathname.replace('/vi_webp/', '/vi/').replace(/\.webp$/, '.jpg');
      const m = u.pathname.match(/^\/vi\/([^/]+)\//);
      if (m) {
        const urls = ['maxresdefault.jpg', 'hq720.jpg', 'sddefault.jpg', 'hqdefault.jpg']
          .map(name => `https://i.ytimg.com/vi/${m[1]}/${name}`);
        if (!urls.includes(u.toString())) urls.push(u.toString());
        return urls;
      }
      return [u.toString()];
    }
  } catch (e) { }
  return [rawUrl];
}

/**
 * Download an image into memory.
 *
 * Goes through Electron's net stack rather than Node's https module on
 * purpose: outside YouTube, thumbnails are routinely served over plain http
 * and sit behind 30x redirects (Reddit, X and Instagram CDNs all do this).
 * https.get() throws on the http: scheme and reports a redirect as a failed
 * status, so it could only ever save YouTube's.
 */
const THUMBNAIL_TIMEOUT_MS = 20000;
const THUMBNAIL_MAX_BYTES = 20 * 1024 * 1024; // a poster frame, not a video

async function fetchImageBuffer(url) {
  const res = await net.fetch(url, {
    redirect: 'follow',
    // Thumbnails are public; never attach the session's (YouTube login) cookies.
    credentials: 'omit',
    // A CDN that accepts the connection and never answers must not hang the
    // save forever, and a URL that resolves to something huge must not be
    // buffered whole in the main process.
    signal: AbortSignal.timeout(THUMBNAIL_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Download failed. Status: ${res.status}`);
  const declared = Number(res.headers.get('content-length'));
  if (declared > THUMBNAIL_MAX_BYTES) throw new Error('Image is too large to be a thumbnail.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error('Empty image response.');
  if (buf.length > THUMBNAIL_MAX_BYTES) throw new Error('Image is too large to be a thumbnail.');
  // A CDN can answer 200 with an HTML challenge or error page. Only the bytes
  // prove it is a picture — and a non-image must fail here so the caller
  // moves on to the next candidate instead of saving it as a ".jpg".
  if (!isImageBuffer(buf)) throw new Error('Response was not an image.');
  return buf;
}

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

/** JPEG, PNG, GIF, WebP, BMP or AVIF/HEIF by magic bytes. */
function isImageBuffer(buf) {
  if (buf.length < 12) return false;
  if (buf.subarray(0, 3).equals(JPEG_MAGIC)) return true;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  const head = buf.subarray(0, 4).toString('latin1');
  if (head === 'GIF8' || head.startsWith('BM')) return true;
  if (head === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return true;
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return true;
  return false;
}

/**
 * Write an image as a real JPEG. The save dialog promised a .jpg, and most
 * sites serve thumbnails as WebP or PNG, so anything that isn't JPEG already
 * is transcoded through the bundled ffmpeg. Should that fail, the original
 * bytes are kept — the caller has already verified they are an image, and a
 * mislabelled image beats no image.
 */
async function writeJpeg(buf, filePath) {
  if (buf.subarray(0, 3).equals(JPEG_MAGIC)) {
    fs.writeFileSync(filePath, buf);
    return;
  }
  const tmpIn = path.join(os.tmpdir(), `yt-forge-thumb-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmpIn, buf);
  try {
    await new Promise((resolve, reject) => {
      execFile(ffmpegPath, [
        '-y', '-v', 'error', '-i', tmpIn,
        '-frames:v', '1', '-q:v', '2',
        // `-update 1` makes image2 write to the literal filename instead of
        // treating it as a numbered pattern.
        '-f', 'image2', '-update', '1', filePath,
      ], { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
    });
  } catch (e) {
    console.warn('Thumbnail transcode failed, saving original bytes:', e.message);
    fs.writeFileSync(filePath, buf);
  } finally {
    try { fs.unlinkSync(tmpIn); } catch (e) { }
  }
}

ipcMain.handle("download-thumbnail", async (event, { url, title }) => {
  if (!url) return { success: false, error: 'No thumbnail URL.' };
  const safeTitle = safeFileStem(title, 'jpg');
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Thumbnail', defaultPath: defaultSavePath(`${safeTitle}_thumbnail.jpg`),
    buttonLabel: 'Save Image', filters: [{ name: 'JPEG Image', extensions: ['jpg'] }]
  });
  if (canceled || !filePath) return { success: false, error: 'Save dialog was canceled.' };
  rememberSaveDirectory(path.dirname(filePath));
  // Fetch inside the loop, write once after it: a disk error on the chosen
  // path is not a bad candidate and must not trigger four more downloads.
  let buf = null;
  let lastError = 'Download failed.';
  for (const candidate of thumbnailCandidates(url)) {
    try {
      buf = await fetchImageBuffer(candidate);
      break;
    } catch (e) {
      lastError = e.message;
    }
  }
  if (!buf) return { success: false, error: lastError };
  try {
    await writeJpeg(buf, filePath);
    return { success: true, path: filePath };
  } catch (e) {
    // Don't leave a half-written file behind a failed save.
    try { fs.unlinkSync(filePath); } catch (e2) { }
    return { success: false, error: e.message };
  }
});

/**
 * `--output` is a *template*, not a literal path: yt-dlp expands `%(title)s`
 * and friends inside it. A destination the user picked can legitimately
 * contain a percent sign, so escape it as `%%` or the download dies with
 * "invalid field" on a filename the save dialog itself produced.
 */
function outputTemplate(filePath) {
  return filePath.replace(/%/g, '%%');
}

/**
 * A private scratch directory for one download, created next to the
 * destination file.
 *
 * yt-dlp writes every intermediate straight into the output directory — the
 * separate video and audio streams (`Title.f399.mp4`), each in-flight fragment
 * (`.part-Frag12`), and the pre-merge container. With
 * `--concurrent-fragments` that is a handful of files materialising and
 * vanishing in the user's Downloads folder for the whole download, which looks
 * exactly like the app is thrashing.
 *
 * It has to sit on the SAME volume as the destination: yt-dlp finishes with a
 * `[MoveFiles]` step, which is an instant rename within a volume but a full
 * byte copy across one — and on an external drive that would silently double
 * both the time and the peak disk usage. A dot prefix keeps it out of Finder.
 */
function createWorkDir(filePath, jobKey) {
  const preferred = path.join(path.dirname(filePath), `.yt-forge-${jobKey}`);
  try {
    fs.mkdirSync(preferred, { recursive: true });
    return preferred;
  } catch (e) {
    // Read-only or otherwise hostile destination — fall back to the system
    // temp dir and accept the possible cross-volume copy.
    try {
      const fallback = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-forge-'));
      console.warn('Falling back to system temp dir for intermediates:', e.message);
      return fallback;
    } catch (e2) {
      console.error('No usable temp directory, downloading in place:', e2.message);
      return null;
    }
  }
}

/** Best-effort removal of a work directory and anything left inside it. */
function removeWorkDir(workDir) {
  if (!workDir) return;
  try {
    fs.rmSync(workDir, { recursive: true, force: true });
  } catch (e) {
    console.error('Failed to remove work dir:', workDir, e.message);
  }
}

/**
 * Translate a UI quality choice into a yt-dlp format selector plus sort order.
 *
 * Two flags replace what used to be a twelve-alternative fallback chain:
 *
 *   -f  says which *combinations are acceptable*. `bv*` is "best stream that
 *       has video" (it may carry audio too) rather than `bestvideo`, which is
 *       video-ONLY and therefore matches nothing on the many sites that ship
 *       muxed streams exclusively. `/b` then accepts a single combined stream.
 *
 *   -S  says which of the acceptable ones to *prefer*. Fields are applied in
 *       order, so `res:H` decides first and `vcodec:h264` only breaks ties
 *       between formats at the same resolution. That is what lets us keep
 *       preferring H.264 for editor compatibility without ever capping
 *       resolution — the trap the old chain fell into, since H.264 stops at
 *       1080p on YouTube.
 *
 * Quality is the priority throughout: the requested rung wins over codec
 * preference, and codec preference wins over container convenience.
 */
function buildFormatSelector(quality, type) {
  if (type === 'mp3') {
    return {
      // A muxed stream is a perfectly good source to extract audio from, and
      // on muxed-only sites it is the ONLY source — without the `/b` fallback
      // yt-dlp aborts with "Requested format is not available".
      formatArg: 'ba/b',
      // Deliberately NOT sorted by `abr`. YouTube ships a dynamic-range
      // compressed twin of each audio track (140-drc) whose measured bitrate
      // is a hair higher than the original's but whose `quality` is lower.
      // Sorting on bitrate promoted the squashed track over the real one; the
      // default sort's `quality` key already knows better.
      sortArg: 'acodec:aac',
    };
  }

  const h = parseInt(quality, 10);
  if (!isNaN(h)) {
    return {
      // Exact rung first, then anything at or below it, then anything at all,
      // so a stripped or expired response still yields a file.
      formatArg:
        `bv*[height<=${h}]+ba/b[height<=${h}]/` +
        `bv*[height<=${h}]/` +
        `bv*+ba/b`,
      sortArg: `res:${h},vcodec:h264,acodec:aac`,
    };
  }

  // "Best" = highest resolution available, with H.264 preferred only among
  // formats that tie on resolution.
  return {
    formatArg: 'bv*+ba/b',
    sortArg: 'res,vcodec:h264,acodec:aac',
  };
}

// Audio codecs an MP4 can carry that editors and QuickTime actually accept.
const MP4_SAFE_AUDIO = new Set(['aac', 'mp3', 'alac', 'ac3', 'eac3']);

/** Codec name of the first audio stream, or '' if it can't be determined. */
function probeAudioCodec(file) {
  return new Promise((resolve) => {
    execFile(ffprobePath, [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=nw=1:nk=1',
      file,
    ], (err, stdout) => {
      resolve(err ? '' : String(stdout).trim().split(/\r?\n/)[0] || '');
    });
  });
}

/**
 * Turn captured yt-dlp stderr into something worth showing the user.
 *
 * Prefers the last real ERROR line, strips yt-dlp's own prefixes, and falls
 * back to the exit code only when there is genuinely nothing better.
 */
function ytDlpFailureMessage(stderrLines, code) {
  const errors = stderrLines.filter(l => /^ERROR:/i.test(l));
  // Without an ERROR line, the last non-warning line is the best guess. A
  // warning is never the reason a download failed, so never report one as if
  // it were.
  const chosen = errors[errors.length - 1] ||
    [...stderrLines].reverse().find(l => !/^WARNING:/i.test(l));
  if (!chosen) return `yt-dlp exited with code ${code}`;

  let cleaned = chosen.replace(/^ERROR:\s*/i, '');

  // yt-dlp formats these as "[Extractor] <video id>: <message>". Only strip a
  // leading "<id>: " when the bracketed extractor tag proves one was there —
  // otherwise a message that merely happens to contain a colon loses its
  // first word.
  const tagged = /^\[[^\]]+\]\s*/.test(cleaned);
  cleaned = cleaned.replace(/^\[[^\]]+\]\s*/, '');
  if (tagged) cleaned = cleaned.replace(/^[^\s:]{1,40}:\s+/, '');

  cleaned = cleaned
    .replace(/\s*Use --list-formats.*$/i, '')
    .replace(/\s*Set --default-search.*$/i, '')
    .replace(/;\s*please report this issue.*$/i, '')
    .trim();

  return cleaned || `yt-dlp exited with code ${code}`;
}

/**
 * Deletes the final output file AND any yt-dlp intermediate temp files.
 */
function deletePartialDownloadFiles(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Deleted partial file:', filePath);
    }
  } catch (err) {
    console.error('Failed to delete partial file:', filePath, err.message);
  }

  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath)); // e.g. "My Video"
  const tempPrefix = base + '.f'; // yt-dlp temp files: "My Video.f315.webm"
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith(tempPrefix) && entry !== path.basename(filePath)) {
        const tempPath = path.join(dir, entry);
        try {
          fs.unlinkSync(tempPath);
          console.log('Deleted yt-dlp temp file:', tempPath);
        } catch (e) {
          console.error('Failed to delete yt-dlp temp file:', tempPath, e.message);
        }
      }
    }
  } catch (e) {
    console.error('Failed to scan directory for temp files:', e.message);
  }
}

// ===========================================================================
// DOWNLOAD QUEUE
// The queue lives entirely in the main process so downloads survive any
// navigation in the renderer. Jobs run one at a time (FIFO); every job is
// either a single video or a whole playlist.
// ===========================================================================
let downloadQueue = []; // array of job objects
let activeJob = null;   // job currently downloading
let activeCtl = null;   // control handle { cancel, pause, resume, isPaused, pauseReason, stage } for the running yt-dlp/ffmpeg
let jobSeq = 0;

function serializeJob(job) {
  const base = {
    id: job.id,
    kind: job.kind,
    status: job.status,
    title: job.title,
    thumbnailUrl: job.thumbnailUrl,
    url: job.url,
    createdAt: job.createdAt,
    sizeBytes: job.sizeBytes || 0,
    formatLabel: job.formatLabel || '',
    progress: job.progress || null,
    error: job.error || null,
  };
  if (job.kind === 'playlist') {
    base.uploader = job.uploader;
    base.targetDir = job.targetDir;
    base.currentIndex = job.currentIndex;
    base.items = job.items.map(it => ({
      id: it.id,
      playlistIndex: it.playlistIndex || null,
      title: it.title,
      url: it.url,
      thumbnail: it.thumbnail,
      duration: it.duration,
      status: it.status,
      quality: it.quality,
      qualityLabel: it.qualityLabel,
      type: it.type,
      convertToH264: it.convertToH264,
      sizeBytes: it.sizeBytes || 0,
      filePath: it.filePath || null,
    }));
  } else {
    base.quality = job.quality;
    base.qualityLabel = job.qualityLabel;
    base.type = job.type;
    base.convertToH264 = job.convertToH264;
    base.filePath = job.filePath;
    base.meta = job.meta || null;
  }
  return base;
}

function broadcastQueue() {
  safeSend('queue-updated', downloadQueue.map(serializeJob));
}

function removeJobFromQueue(jobId) {
  downloadQueue = downloadQueue.filter(j => j.id !== jobId);
  broadcastQueue();
}

/**
 * Core downloader for ONE video (or audio extraction), including the optional
 * offline H.264 conversion. Sends progress via 'download-progress' events
 * tagged with jobId/itemId. Sets the module-level activeCtl for
 * pause/resume/cancel while it runs.
 *
 * Returns { success, path } | { success:false, error, cancelled?, keptOriginal? }
 */
function runVideoDownloadCore({ url, quality, type, convertToH264, filePath, jobId, itemId, job }) {
  return new Promise(async (outerResolve) => {
    let isCancelled = false;
    let didConvert = false;
    let isPaused = false;
    let pauseReason = null;
    let ytDlpProcess = null;
    let ffmpegProcess = null;
    let keepOriginalOnCancel = false;
    let downloadStage = 'starting';
    let workDir = null;

    let downloadStartTime = Date.now();
    let totalPauseDuration = 0;
    let pauseStartTime = 0;
    let speedWindow = []; // Array of { t: number, b: number }
    let lastPayloadTime = 0;

    const sendProgress = (payload) => {
      const full = { jobId, itemId, ...payload };
      if (job) job.progress = full;
      safeSend('download-progress', full);
    };

    activeCtl = {
      cancel: (keepOriginal = false) => {
        isCancelled = true;
        keepOriginalOnCancel = keepOriginal;
        if (ytDlpProcess) {
          if (isPaused && process.platform !== 'win32') {
            try { process.kill(-ytDlpProcess.pid, 'SIGCONT'); } catch (e) { }
          }
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(ytDlpProcess.pid), '/f', '/t'], { windowsHide: true });
          } else {
            try { process.kill(-ytDlpProcess.pid, 'SIGTERM'); } catch (_) {
              ytDlpProcess.kill('SIGTERM');
            }
          }
        }
        if (ffmpegProcess) {
          if (isPaused && process.platform !== 'win32') {
            try { process.kill(-ffmpegProcess.pid, 'SIGCONT'); } catch (e) { }
          }
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(ffmpegProcess.pid), '/f', '/t'], { windowsHide: true });
          } else {
            try { process.kill(-ffmpegProcess.pid, 'SIGTERM'); } catch (_) {
              ffmpegProcess.kill('SIGTERM');
            }
          }
        }
        isPaused = false;
        pauseReason = null;
        pauseStartTime = 0;
      },
      pause: (reason = 'user') => {
        if (isPaused || (!ytDlpProcess && !ffmpegProcess) || isCancelled) return;
        if (downloadStage === 'merging' || downloadStage === 'processing') return;
        if (process.platform === 'win32') return; // SIGSTOP unsupported on Windows
        isPaused = true;
        pauseReason = reason;
        pauseStartTime = Date.now();
        try {
          if (ytDlpProcess) process.kill(-ytDlpProcess.pid, 'SIGSTOP');
          if (ffmpegProcess) process.kill(-ffmpegProcess.pid, 'SIGSTOP');
        } catch (e) {
          console.error('SIGSTOP failed:', e.message);
          try { if (ytDlpProcess) ytDlpProcess.kill('SIGSTOP'); if (ffmpegProcess) ffmpegProcess.kill('SIGSTOP'); } catch (e2) { }
        }
        console.log(`Download paused (${reason})`);
        sendProgress({ paused: true, reason, stage: downloadStage });
      },
      resume: () => {
        if (!isPaused || (!ytDlpProcess && !ffmpegProcess) || isCancelled) return;
        isPaused = false;
        pauseReason = null;
        if (pauseStartTime) {
          totalPauseDuration += (Date.now() - pauseStartTime);
          pauseStartTime = 0;
        }
        if (process.platform !== 'win32') {
          try {
            if (ytDlpProcess) process.kill(-ytDlpProcess.pid, 'SIGCONT');
            if (ffmpegProcess) process.kill(-ffmpegProcess.pid, 'SIGCONT');
          } catch (e) {
            console.error('SIGCONT failed:', e.message);
            try { if (ytDlpProcess) ytDlpProcess.kill('SIGCONT'); if (ffmpegProcess) ffmpegProcess.kill('SIGCONT'); } catch (e2) { }
          }
        }
        console.log('Download resumed');
        sendProgress({ paused: false, reason: null, stage: downloadStage });
      },
      get isPaused() { return isPaused; },
      get pauseReason() { return pauseReason; },
      get stage() { return downloadStage; },
      // Synchronous best-effort cleanup for app quit. During conversion the
      // download itself is complete, so the original is kept — the same
      // choice the in-app cancel dialog defaults to offering.
      cleanupNow: () => {
        removeWorkDir(workDir);
        workDir = null;
        if (downloadStage !== 'converting' && downloadStage !== 'done') {
          deletePartialDownloadFiles(filePath);
        }
      },
    };

    try {
      const { formatArg, sortArg } = buildFormatSelector(quality, type);

      // Delete any stale file just before starting (path may have been chosen
      // a while ago if this job sat in the queue)
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (err) {
          console.error('Failed to delete existing file:', err);
        }
      }

      // Everything intermediate happens out of sight, then yt-dlp moves the
      // single finished file into place. `--paths` is silently ignored when
      // --output is absolute, so the destination has to be given as `home:`
      // and the output template reduced to a bare filename.
      workDir = createWorkDir(filePath, `${jobId || 'job'}-${itemId || 'single'}`);

      const args = [
        url,
        '--format', formatArg,
        '--format-sort', sortArg,
        ...(workDir
          ? ['--paths', `home:${path.dirname(filePath)}`,
             '--paths', `temp:${workDir}`,
             '--output', outputTemplate(path.basename(filePath))]
          : ['--output', outputTemplate(filePath)]),
        '--ffmpeg-location', ffmpegPath,
        '--newline',
        ...getAuthArgs(url),
        ...BASE_ARGS,
        ...DOWNLOAD_SPEED_ARGS,
      ];

      // NOTE: never override player_client for downloads *by default* — when
      // cookies are present yt-dlp skips the android client, and a reduced
      // client set can end up with no downloadable formats at all ("Only
      // images are available"). The height<= relaxation in the selector
      // handles stripped responses. The one exception is a video whose info
      // fetch only succeeded through a retry: the download must replay that
      // exact client set (and carry a PO token) or it hits the same wall the
      // first fetch did. Videos that fetched normally add nothing here.
      args.push(...await ytDownloadArgs(url));

      if (type === 'mp3') {
        args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
      } else {
        args.push('--merge-output-format', 'mp4');
      }

      console.log('Starting yt-dlp download:', formatArg, '-S', sortArg, '->', filePath);

      // Spawn in its own process group (detached) so SIGSTOP/SIGCONT
      // can freeze/resume the entire group via negative PID
      ytDlpProcess = spawn(ytDlpBinaryPath, args, { env: getYtDlpEnv(), detached: true, windowsHide: true });

      sendProgress({ percent: 0, downloadedBytes: 0, totalBytes: 0, stage: 'starting' });

      let lastPercent = -1;
      let stdoutBuf = '';
      let stageCount = 0;
      // Per-stream: smoothed size estimate and the high-water mark of bytes
      // actually fetched. Both reset when a new "Destination:" line starts the
      // next stream, since its totals are unrelated to the previous one's.
      let smoothedTotal = 0;
      let maxDownloadedBytes = 0;
      let totalIsEstimate = false;

      ytDlpProcess.stdout.on('data', (chunk) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split(/\r?\n/);
        stdoutBuf = lines.pop();
        lines.forEach((line) => {
          if (!line.trim()) return;

          if (line.includes('[download] Destination:')) {
            stageCount++;
            if (type === 'mp3') {
              downloadStage = 'audio';
            } else {
              downloadStage = stageCount === 1 ? 'video' : 'audio';
            }
            lastPercent = -1;
            speedWindow = [];
            smoothedTotal = 0;
            maxDownloadedBytes = 0;
            totalIsEstimate = false;
          } else if (line.includes('[Merger]') || line.includes('[Mux]')) {
            downloadStage = 'merging';
            if (!isPaused) sendProgress({ percent: -1, downloadedBytes: 0, totalBytes: 0, stage: 'merging' });
          } else if (line.includes('[ExtractAudio]') || line.includes('[FFmpegMetadata]')) {
            downloadStage = 'processing';
            if (!isPaused) sendProgress({ percent: -1, downloadedBytes: 0, totalBytes: 0, stage: 'processing' });
          }

          if (isPaused) return;

          // [download]  12.3% of   54.23MiB at  3.10MiB/s ETA 00:15
          // [download]  12.3% of ~ 54.23MiB at ... (frag 25/59)
          //
          // The tilde marks a GUESS. On a fragmented download (HLS/DASH — most
          // of X, Dailymotion, PornHub) yt-dlp has no content length up front,
          // so it extrapolates the total from the fragments seen so far and
          // re-guesses on every line. Reported verbatim that total swings
          // wildly — 1.13 GB one second, 916 MB the next — and since
          // "downloaded" was derived from it, the bytes and the ETA lurched
          // backwards too.
          const downloadMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+(~)?\s*([\d.]+)([KMGTi]+B)/i);
          let percentValue = null;
          let downloadedBytes = 0;
          let totalBytes = 0;

          if (downloadMatch) {
            percentValue = Math.min(100, parseFloat(downloadMatch[1]));
            const isEstimate = !!downloadMatch[2];
            const rawTotal = sizeToBytes(parseFloat(downloadMatch[3]), downloadMatch[4]);

            totalIsEstimate = isEstimate;

            if (!isEstimate) {
              totalBytes = rawTotal;
              smoothedTotal = rawTotal;
            } else if (smoothedTotal === 0) {
              totalBytes = smoothedTotal = rawTotal;
            } else {
              // Heavy exponential smoothing. Measured against 648 real progress
              // lines from a fragmented download: raw swung by up to 53%
              // between updates, 0.85 still left 29%, 0.995 leaves 2.3% — one
              // visible movement across the whole download. Tracking the guess
              // faster is counterproductive, because the noisiest estimates are
              // the earliest ones.
              smoothedTotal = Math.round(smoothedTotal * 0.995 + rawTotal * 0.005);
              totalBytes = smoothedTotal;
            }

            downloadedBytes = Math.round(totalBytes * (percentValue / 100));
            // Bytes already on disk cannot un-download themselves. Clamping
            // keeps the readout and the speed window monotonic even while the
            // total behind them is still settling.
            if (downloadedBytes < maxDownloadedBytes) {
              downloadedBytes = maxDownloadedBytes;
            } else {
              maxDownloadedBytes = downloadedBytes;
            }
            if (totalBytes < downloadedBytes) totalBytes = downloadedBytes;
          } else {
            const bare = line.match(/(?:^|\s)(\d{1,3}\.?\d*)%/);
            if (bare) percentValue = Math.min(100, parseFloat(bare[1]));
          }

          if (percentValue !== null && downloadedBytes > 0) {
            const now = Date.now();
            if (speedWindow.length === 0 || speedWindow[speedWindow.length - 1].t !== now) {
              speedWindow.push({ t: now, b: downloadedBytes });
            }
            while (speedWindow.length > 0 && now - speedWindow[0].t > 10000) {
              speedWindow.shift();
            }
          }

          const now = Date.now();
          if ((percentValue !== null && percentValue !== lastPercent) || (now - lastPayloadTime > 500)) {
            if (percentValue !== null) lastPercent = percentValue;

            let currentSpeed = 0;
            let currentEta = 0;

            if (speedWindow.length > 1) {
              const oldest = speedWindow[0];
              const newest = speedWindow[speedWindow.length - 1];
              const timeDiffSec = (newest.t - oldest.t) / 1000;
              const bytesDiff = newest.b - oldest.b;
              if (timeDiffSec > 0 && bytesDiff > 0) {
                currentSpeed = bytesDiff / timeDiffSec;
                if (totalBytes > downloadedBytes) {
                  currentEta = Math.round((totalBytes - downloadedBytes) / currentSpeed);
                }
              }
            }

            let elapsedSec = Math.floor((now - downloadStartTime - totalPauseDuration) / 1000);
            if (elapsedSec < 0) elapsedSec = 0;

            lastPayloadTime = now;
            sendProgress({
              percent: lastPercent !== -1 ? lastPercent : 0,
              downloadedBytes,
              totalBytes,
              stage: downloadStage,
              // Tells the UI to render the total as approximate. On fragmented
              // sources it is an extrapolation, not a content length.
              totalIsEstimate,
              speed: currentSpeed,
              eta: currentEta,
              elapsed: elapsedSec
            });
          }
        });
      });

      // Keep the tail of stderr so a failure can say what actually went wrong.
      // Across 1000+ extractors the useful part is nearly always yt-dlp's own
      // ERROR line ("Requested format is not available", "This video is
      // private", "geo restricted"), and "exited with code 1" tells the user
      // nothing they can act on.
      const stderrLines = [];
      ytDlpProcess.stderr.on('data', (data) => {
        const text = data.toString();
        console.error('yt-dlp stderr:', text);
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) stderrLines.push(line.trim());
        }
        if (stderrLines.length > 50) stderrLines.splice(0, stderrLines.length - 50);
      });

      await new Promise((resolve, reject) => {
        ytDlpProcess.on('close', (code) => {
          if (isCancelled) {
            reject(new Error('Download was canceled.'));
          } else if (code === 0) {
            resolve();
          } else {
            reject(new Error(ytDlpFailureMessage(stderrLines, code)));
          }
        });
        ytDlpProcess.on('error', (err) => reject(err));
      });

      if (isCancelled) throw new Error("Download was canceled.");

      // --- OFFLINE H.264 CONVERSION ---
      if (convertToH264 && type === 'mp4' && !isCancelled) {
        downloadStage = 'converting';
        speedWindow = [];
        // Keep the half-written re-encode beside the fragments rather than in
        // the user's folder, for the same reason.
        const tempOutput = workDir
          ? path.join(workDir, path.basename(filePath) + '.tmp.mp4')
          : filePath + '.tmp.mp4';
        sendProgress({ percent: 0, downloadedBytes: 0, totalBytes: 0, stage: 'converting' });

        // Copying the audio is free and lossless, but only when the stream is
        // already something MP4 can carry. VP9/AV1 downloads often arrive with
        // Opus, which most editors refuse to open inside MP4.
        const sourceAudio = await probeAudioCodec(filePath);
        const audioArgs = MP4_SAFE_AUDIO.has(sourceAudio)
          ? ['-c:a', 'copy']
          : ['-c:a', 'aac', '-b:a', '192k'];

        await new Promise((resolve, reject) => {
          const convArgs = [
            '-y',
            '-i', filePath,
            '-c:v', 'libx264',
            // The point of this conversion is a file that opens everywhere, so
            // it is worth real encoder effort rather than the fastest possible
            // pass. 'ultrafast' at CRF 23 produced visibly soft output that was
            // also larger than the VP9 source it replaced.
            '-preset', 'medium',
            '-crf', '18',
            // 10-bit VP9/AV1 would otherwise come out as H.264 High 10, which
            // QuickTime, Premiere and iMovie cannot open — the exact players
            // this conversion exists to satisfy.
            '-pix_fmt', 'yuv420p',
            ...audioArgs,
            '-movflags', '+faststart',
            tempOutput
          ];

          console.log('Starting offline FFmpeg conversion (source audio:', sourceAudio || 'unknown', ')');
          ffmpegProcess = spawn(ffmpegPath, convArgs, { detached: true, windowsHide: true });

          let totalDurationSec = 0;

          ffmpegProcess.stderr.on('data', (data) => {
            const out = data.toString();

            const dirMatch = out.match(/Duration:\s+(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (dirMatch && !totalDurationSec) {
              totalDurationSec = parseInt(dirMatch[1]) * 3600 + parseInt(dirMatch[2]) * 60 + parseFloat(dirMatch[3]);
            }

            const timeMatch = out.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (timeMatch && totalDurationSec > 0 && !isPaused) {
              const currentSec = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
              let percentValue = (currentSec / totalDurationSec) * 100;
              if (percentValue > 100) percentValue = 100;

              const now = Date.now();

              if (speedWindow.length === 0 || speedWindow[speedWindow.length - 1].t !== now) {
                speedWindow.push({ t: now, b: currentSec });
              }
              while (speedWindow.length > 0 && now - speedWindow[0].t > 10000) {
                speedWindow.shift();
              }

              if (now - lastPayloadTime > 500) {
                lastPayloadTime = now;
                let elapsedSec = Math.floor((now - downloadStartTime - totalPauseDuration) / 1000);
                if (elapsedSec < 0) elapsedSec = 0;

                let currentSpeed = 0; // "x multiplier" while converting
                let currentEta = 0;

                if (speedWindow.length > 1) {
                  const oldest = speedWindow[0];
                  const newest = speedWindow[speedWindow.length - 1];
                  const timeDiffSec = (newest.t - oldest.t) / 1000;
                  const processedDiff = newest.b - oldest.b;
                  if (timeDiffSec > 0 && processedDiff > 0) {
                    currentSpeed = processedDiff / timeDiffSec;
                    const remainingVideoSec = totalDurationSec - currentSec;
                    if (remainingVideoSec > 0) {
                      currentEta = Math.round(remainingVideoSec / currentSpeed);
                    }
                  }
                }

                sendProgress({
                  percent: percentValue,
                  downloadedBytes: 0,
                  totalBytes: 0,
                  stage: 'converting',
                  speed: currentSpeed,
                  eta: currentEta,
                  elapsed: elapsedSec
                });
              }
            }
          });

          ffmpegProcess.on('close', (code) => {
            if (isCancelled) {
              if (keepOriginalOnCancel) {
                resolve(); // Resolve cleanly to return the original file
              } else {
                reject(new Error("Conversion was canceled."));
              }
            } else if (code === 0) {
              try {
                fs.renameSync(tempOutput, filePath);
                didConvert = true;
                console.log('Conversion successful. Overwrote original file.');
              } catch (e) { console.error('Rename failed after conversion', e); }
              resolve();
            } else {
              reject(new Error(`ffmpeg exited with code ${code}`));
            }
          });
          ffmpegProcess.on('error', (err) => reject(err));
        });

        if (isCancelled && !keepOriginalOnCancel) throw new Error("Conversion was canceled.");
      }

      console.log('Download complete! File saved at:', filePath);

      const finalSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
      sendProgress({
        percent: 100,
        downloadedBytes: finalSize,
        totalBytes: finalSize,
        stage: 'done',
      });

      outerResolve({ success: true, path: filePath, converted: didConvert, keptOriginal: isCancelled && keepOriginalOnCancel });
    } catch (err) {
      outerResolve({
        success: false,
        error: err.message,
        cancelled: isCancelled,
      });
    } finally {
      // Defensive cleanup: always wipe partial + temp files on cancel
      if (isCancelled) {
        if (keepOriginalOnCancel) {
          try { fs.unlinkSync(filePath + '.tmp.mp4'); } catch (e) { }
        } else {
          deletePartialDownloadFiles(filePath);
          try { fs.unlinkSync(filePath + '.tmp.mp4'); } catch (e) { }
        }
      }
      // The work dir goes on every path — success, failure, cancel — or a
      // killed download would leave a hidden folder of fragments behind
      // forever.
      removeWorkDir(workDir);
      workDir = null;
      activeCtl = null;
    }
  });
}

// Filesystems cap a single name at 255 *bytes*, not characters (APFS, ext4,
// NTFS all land there). Leave room for the extension and a " (12)" duplicate
// suffix.
const MAX_FILENAME_BYTES = 255;
const FILENAME_RESERVE_BYTES = 16;

/**
 * Sanitise a video title into a filename stem that the filesystem will accept.
 *
 * The byte budget is not paranoia. On YouTube a title is a title, but X, Reddit
 * and Mastodon use the whole post as one — a single 280-character tweet with a
 * couple of emoji is 400+ bytes, and writing it threw ENAMETOOLONG before the
 * download had a chance to start.
 */
function safeFileStem(title, ext) {
  let stem = String(title || 'video')
    .replace(/[\\/:"*?<>|]/g, '')
    // Control characters and newlines are legal in some filesystems and awful
    // in all of them; post text routinely contains newlines.
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const budget = MAX_FILENAME_BYTES - FILENAME_RESERVE_BYTES - Buffer.byteLength(`.${ext}`, 'utf8');
  if (Buffer.byteLength(stem, 'utf8') > budget) {
    // Cut on a UTF-8 boundary, then again on a whole code point, so a
    // multi-byte character or emoji never ends up half-written.
    const buf = Buffer.from(stem, 'utf8').subarray(0, budget);
    stem = buf.toString('utf8').replace(/\ufffd+$/, '').trimEnd();
  }

  // Windows rejects trailing dots and spaces, and reserves a handful of device
  // names; an empty stem would produce a bare ".mp4" dotfile.
  stem = stem.replace(/[. ]+$/, '');
  if (!stem || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stem)) stem = `video${stem ? '_' + stem : ''}`;
  return stem;
}

/**
 * "01. " style filename prefix for a numbered playlist item. The width follows
 * the largest index in the job (never below 2) so the files sort in playlist
 * order in Finder/Explorer instead of 1, 10, 11, 2.
 */
function playlistNumberPrefix(job, item) {
  if (!job.numberItems || !item.playlistIndex) return '';
  return `${String(item.playlistIndex).padStart(job.numberPad || 2, '0')}. `;
}

/** Resolve the output path inside a target directory, handling duplicates. */
function resolveOutputPath(targetDir, title, ext, allowDuplicates) {
  const safeTitle = safeFileStem(title, ext);
  let filePath = path.join(targetDir, `${safeTitle}.${ext}`);
  if (fs.existsSync(filePath) && allowDuplicates) {
    let counter = 1;
    while (fs.existsSync(filePath)) {
      filePath = path.join(targetDir, `${safeTitle} (${counter}).${ext}`);
      counter++;
    }
  }
  // When duplicates aren't allowed, the stale file is deleted right before
  // the download starts (inside runVideoDownloadCore).
  return filePath;
}

// Quality label for history entries. When the file was converted offline the
// codec tag shows source → final, e.g. "2160p60 (VP9 → H.264)", so converted
// files are distinguishable from native downloads.
function describeQuality(qualityLabel, converted) {
  if (!converted || !qualityLabel) return qualityLabel;
  return qualityLabel.replace(/\((VP9|AV1)\)/, '($1 → H.264)');
}

function addVideoHistoryItem(job, finalPath, converted) {
  const history = store.get('downloadHistory', []);
  const label = job.type === 'mp3' ? 'AUDIO' : describeQuality(job.qualityLabel, converted);
  const newHistoryItem = {
    id: job.videoId,
    title: job.title,
    thumbnailUrl: job.thumbnailUrl,
    url: job.url,
    format: `${label} (${job.type.toUpperCase()})`,
    path: finalPath,
    timestamp: new Date().toISOString(),
  };
  const updatedHistory = [newHistoryItem, ...history.filter(h => h.id !== job.videoId || h.path !== finalPath)];
  store.set('downloadHistory', updatedHistory);
  safeSend('history-updated');
}

function addPlaylistHistoryItem(job) {
  const completed = job.items.filter(it => it.status === 'completed');
  if (completed.length === 0) return;
  const history = store.get('downloadHistory', []);
  const newHistoryItem = {
    id: 'playlist-' + Date.now(),
    type: 'playlist',
    title: job.title,
    uploader: job.uploader,
    thumbnailUrl: completed[0]?.thumbnail || job.thumbnailUrl || '',
    url: job.url || completed[0]?.url || '',
    format: job.formatLabel || 'MP4',
    path: job.targetDir,
    timestamp: new Date().toISOString(),
    downloadedVideos: completed.map(v => ({
      id: v.id,
      playlistIndex: v.playlistIndex || null,
      title: v.title,
      url: v.url,
      thumbnailUrl: v.thumbnail,
      duration: v.duration,
      filePath: v.filePath,
      format: v.type === 'mp3'
        ? 'AUDIO (MP3)'
        : `${describeQuality(v.qualityLabel, v.converted) || 'Best'} (MP4)`,
    })),
  };
  store.set('downloadHistory', [newHistoryItem, ...history]);
  safeSend('history-updated');
}

/**
 * runVideoDownloadCore, plus the same second chance the info fetch gets: if
 * YouTube's default clients refuse the video (age gate, no formats) and no
 * client override is known for it yet, retry once with the gated client set
 * and a PO token. Needed because a download re-extracts from scratch — a
 * playlist item the prefetch never reached, or a re-download after a restart,
 * arrives here with no override even though the fetch path would have found
 * one. Cancels and non-YouTube failures pass straight through.
 */
async function runVideoDownload(opts) {
  const result = await runVideoDownloadCore(opts);
  if (result.success || result.keptOriginal || result.cancelled) return result;
  if (opts.job?.cancelled) return result;
  const videoId = youTubeVideoId(opts.url);
  if (!videoId || ytClientOverrides.has(videoId)) return result;
  if (!YT_RETRYABLE_KINDS.has(classifyYtDlpError(result.error || ''))) return result;

  console.log('Download refused by default clients, retrying with explicit client set:', videoId);
  rememberClientOverride(opts.url, YT_RETRY_CLIENTS);
  const retried = await runVideoDownloadCore(opts);
  // Don't pin a client set that didn't help — the next attempt should start clean.
  if (!retried.success && !retried.keptOriginal) ytClientOverrides.delete(videoId);
  return retried;
}

async function runVideoJob(job) {
  const result = await runVideoDownload({
    url: job.url,
    quality: job.quality,
    type: job.type,
    convertToH264: job.convertToH264,
    filePath: job.filePath,
    jobId: job.id,
    itemId: null,
    job,
  });

  if (result.success || result.keptOriginal) {
    job.status = 'completed';
    addVideoHistoryItem(job, result.path || job.filePath, result.converted);
    safeSend('job-finished', { jobId: job.id, kind: 'video', success: true, path: result.path || job.filePath });
  } else if (result.cancelled) {
    job.status = 'cancelled';
    safeSend('job-finished', { jobId: job.id, kind: 'video', success: false, cancelled: true });
  } else {
    job.status = 'error';
    job.error = result.error;
    safeSend('job-finished', { jobId: job.id, kind: 'video', success: false, error: result.error });
  }
}

async function runPlaylistJob(job) {
  for (let i = 0; i < job.items.length; i++) {
    if (job.cancelled) break;
    const item = job.items[i];
    job.currentIndex = i;
    item.status = 'downloading';
    broadcastQueue();

    const ext = item.type === 'mp3' ? 'mp3' : 'mp4';
    const stem = playlistNumberPrefix(job, item) + item.title;
    const filePath = resolveOutputPath(job.targetDir, stem, ext, job.allowDuplicates);

    const result = await runVideoDownload({
      url: item.url,
      quality: item.quality,
      type: item.type,
      convertToH264: item.convertToH264,
      filePath,
      jobId: job.id,
      itemId: item.id,
      job,
    });

    if (job.cancelled) {
      item.status = result.success ? 'completed' : 'cancelled';
      if (result.success) {
        item.filePath = result.path;
        item.converted = !!result.converted;
      }
      break;
    }
    if (job.skipCurrent) {
      job.skipCurrent = false;
      item.status = 'skipped';
      broadcastQueue();
      continue;
    }
    if (result.success) {
      item.status = 'completed';
      item.filePath = result.path;
      item.converted = !!result.converted;
    } else {
      item.status = 'error';
      item.error = result.error;
    }
    broadcastQueue();
  }

  const completedCount = job.items.filter(it => it.status === 'completed').length;
  const errorCount = job.items.filter(it => it.status === 'error').length;

  // Even if cancelled midway, keep a history record of the videos that finished
  addPlaylistHistoryItem(job);

  if (job.cancelled) {
    job.status = 'cancelled';
    safeSend('job-finished', { jobId: job.id, kind: 'playlist', success: false, cancelled: true, completedCount, errorCount, path: job.targetDir });
  } else {
    job.status = completedCount > 0 || errorCount === 0 ? 'completed' : 'error';
    safeSend('job-finished', { jobId: job.id, kind: 'playlist', success: job.status === 'completed', completedCount, errorCount, path: job.targetDir });
  }
}

async function processQueue() {
  if (activeJob) return;
  // Jobs can be queued while yt-dlp is self-updating — hold them until the
  // binary is stable again (updateYtDlp re-kicks the queue when done).
  if (isUpdatingYtDlp) return;
  const next = downloadQueue.find(j => j.status === 'queued');
  if (!next) return;

  activeJob = next;
  next.status = 'downloading';
  broadcastQueue();

  try {
    if (next.kind === 'video') {
      await runVideoJob(next);
    } else {
      await runPlaylistJob(next);
    }
  } catch (err) {
    console.error('Job processing error:', err);
    next.status = 'error';
    next.error = err.message;
    safeSend('job-finished', { jobId: next.id, kind: next.kind, success: false, error: err.message });
  } finally {
    activeJob = null;
    // Finished jobs leave the queue — history is the durable record
    removeJobFromQueue(next.id);
    processQueue();
  }
}

// --- Queue IPC -------------------------------------------------------------

ipcMain.handle('get-queue', () => downloadQueue.map(serializeJob));

ipcMain.handle('queue-video', async (event, options) => {
  const { videoId, url, quality, qualityLabel, type, title, thumbnailUrl, convertToH264, sizeBytes, meta } = options;
  const ext = type === 'mp4' ? 'mp4' : 'mp3';
  // Same byte budget as resolveOutputPath: the dialog's default name becomes
  // the real filename, so an over-long one fails at write time, not here.
  const safeTitle = safeFileStem(title, ext);

  const dialogResult = await dialog.showSaveDialog(mainWindow, {
    title: `Save ${type.toUpperCase()}`,
    defaultPath: defaultSavePath(`${safeTitle}.${ext}`),
    buttonLabel: "Save",
    filters: type === 'mp4' ? [{ name: "MPEG-4 Video", extensions: ["mp4"] }] : [{ name: "MP3 Audio", extensions: ["mp3"] }],
  });
  if (dialogResult.canceled || !dialogResult.filePath) {
    return { success: false, canceled: true, error: "Save dialog was canceled." };
  }
  rememberSaveDirectory(path.dirname(dialogResult.filePath));

  const job = {
    id: `job-${++jobSeq}-${Date.now()}`,
    kind: 'video',
    status: 'queued',
    createdAt: Date.now(),
    videoId,
    url,
    title,
    thumbnailUrl,
    quality,
    qualityLabel,
    type,
    convertToH264: !!convertToH264,
    filePath: dialogResult.filePath,
    sizeBytes: sizeBytes || 0,
    formatLabel: type === 'mp3' ? 'AUDIO (MP3)' : `${qualityLabel} (MP4)`,
    meta: meta || null,
    progress: null,
  };

  downloadQueue.push(job);
  broadcastQueue();
  processQueue();
  return { success: true, jobId: job.id };
});

ipcMain.handle('queue-playlist', async (event, options) => {
  const { title, uploader, url, targetDir, allowDuplicates, formatLabel, items, thumbnailUrl, numberItems } = options;
  if (!targetDir) return { success: false, error: 'No destination folder selected.' };
  if (!Array.isArray(items) || items.length === 0) return { success: false, error: 'No videos selected.' };

  const maxIndex = items.reduce((max, it) => Math.max(max, it.playlistIndex || 0), 0);

  const job = {
    id: `job-${++jobSeq}-${Date.now()}`,
    kind: 'playlist',
    status: 'queued',
    createdAt: Date.now(),
    title,
    uploader,
    url: url || '',
    thumbnailUrl: thumbnailUrl || items[0]?.thumbnail || '',
    targetDir,
    allowDuplicates: !!allowDuplicates,
    numberItems: !!numberItems,
    numberPad: Math.max(2, String(maxIndex).length),
    formatLabel: formatLabel || 'MP4',
    sizeBytes: items.reduce((acc, it) => acc + (it.sizeBytes || 0), 0),
    currentIndex: -1,
    cancelled: false,
    skipCurrent: false,
    items: items.map(it => ({
      id: it.id,
      playlistIndex: it.playlistIndex || null,
      url: it.url,
      title: it.title,
      thumbnail: it.thumbnail,
      duration: it.duration || 0,
      quality: it.quality,
      qualityLabel: it.qualityLabel,
      type: it.type || 'mp4',
      convertToH264: !!it.convertToH264,
      sizeBytes: it.sizeBytes || 0,
      status: 'queued',
      filePath: null,
    })),
    progress: null,
  };

  downloadQueue.push(job);
  broadcastQueue();
  processQueue();
  return { success: true, jobId: job.id };
});

ipcMain.on('cancel-job', (event, { jobId, keepOriginal } = {}) => {
  const job = downloadQueue.find(j => j.id === jobId);
  if (!job) return;
  if (job.status === 'queued') {
    removeJobFromQueue(jobId);
    safeSend('job-finished', { jobId, kind: job.kind, success: false, cancelled: true });
    return;
  }
  if (job === activeJob) {
    job.cancelled = true;
    if (activeCtl) activeCtl.cancel(!!keepOriginal);
  }
});

// Skip only the currently-downloading video of a playlist job
ipcMain.on('skip-playlist-item', (event, { jobId } = {}) => {
  const job = downloadQueue.find(j => j.id === jobId);
  if (!job || job !== activeJob || job.kind !== 'playlist') return;
  job.skipCurrent = true;
  if (activeCtl) activeCtl.cancel(false);
});

ipcMain.on("pause-download", () => {
  if (activeCtl) activeCtl.pause('user');
});

ipcMain.on("resume-download", () => {
  if (activeCtl) activeCtl.resume();
});
