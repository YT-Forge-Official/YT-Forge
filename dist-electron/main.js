"use strict";
const { app, BrowserWindow, ipcMain, dialog, shell, net, session } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const { spawn, execFile } = require("child_process");
const fixAsar = (p) => p.replace("app.asar", "app.asar.unpacked");
const ffmpegPath = fixAsar(require("ffmpeg-static"));
const ffprobePath = fixAsar(require("ffprobe-static").path);
function getYtDlpEnv() {
  const dirs = /* @__PURE__ */ new Set([path.dirname(ffmpegPath), path.dirname(ffprobePath)]);
  const extraPath = [...dirs].join(path.delimiter);
  return {
    ...process.env,
    PATH: `${extraPath}${path.delimiter}${process.env.PATH || ""}`,
    ELECTRON_RUN_AS_NODE: "1"
  };
}
const _Store = require("electron-store");
const Store = _Store.default || _Store;
const BASE_ARGS = [
  "--no-playlist",
  "--ignore-config",
  "--retries",
  "10",
  "--retry-sleep",
  "3",
  "--fragment-retries",
  "10",
  // Explicitly command yt-dlp to use our bundled Electron executable as the Node.js runtime to solve YouTube's bot-challenges (HTTP Error 429).
  "--js-runtimes",
  `node:${process.execPath}`
];
const store = new Store();
let mainWindow;
let currentDownloadProcess = null;
let currentInfoFetchProcess = null;
let isUpdatingYtDlp = false;
let ytDlpPhase = null;
let networkCheckInterval = null;
let wasOnline = true;
function getBinaryName() {
  switch (process.platform) {
    case "win32":
      return "yt-dlp.exe";
    case "darwin":
      return "yt-dlp_macos";
    case "linux":
      return "yt-dlp_linux";
    default:
      return "yt-dlp_linux";
  }
}
function getBundledBinaryPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "bin", getBinaryName());
  }
  return path.join(app.getAppPath(), "bin", getBinaryName());
}
function getWritableBinaryPath() {
  if (!app.isPackaged) return getBundledBinaryPath();
  return path.join(app.getPath("userData"), "bin", getBinaryName());
}
function ensureYtDlpBinary() {
  const writable = getWritableBinaryPath();
  const bundled = getBundledBinaryPath();
  if (!app.isPackaged) {
    if (!fs.existsSync(writable)) {
      console.error("yt-dlp binary not found at:", writable);
      console.error("Download it from https://github.com/yt-dlp/yt-dlp/releases and place it in bin/");
      return writable;
    }
  } else {
    const dir = path.dirname(writable);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(writable)) {
      if (fs.existsSync(bundled)) {
        fs.copyFileSync(bundled, writable);
        console.log("Copied yt-dlp binary to writable location:", writable);
      } else {
        console.error("Bundled yt-dlp binary not found at:", bundled);
      }
    }
  }
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(writable, "755");
    } catch (err) {
      console.error("Failed to chmod yt-dlp binary:", err);
    }
  }
  console.log("Using yt-dlp binary at:", writable);
  return writable;
}
const ytDlpBinaryPath = ensureYtDlpBinary();
function safeSend(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}
function updateYtDlp() {
  if (currentDownloadProcess) {
    console.log("Skipping yt-dlp update — download in progress");
    return;
  }
  isUpdatingYtDlp = true;
  ytDlpPhase = "checking";
  console.log("Checking for yt-dlp updates...");
  safeSend("ytdlp-update-status", { status: "checking" });
  const proc = spawn(ytDlpBinaryPath, ["-U"], { env: getYtDlpEnv(), windowsHide: true });
  let stdoutAll = "";
  let stderrAll = "";
  let downloadingSignalled = false;
  proc.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdoutAll += text;
    if (!downloadingSignalled && (text.includes("Updating yt-dlp") || text.includes("Downloading"))) {
      downloadingSignalled = true;
      ytDlpPhase = "downloading";
      safeSend("ytdlp-update-status", { status: "downloading" });
    }
    console.log("yt-dlp update stdout:", text.trim());
  });
  proc.stderr.on("data", (chunk) => {
    stderrAll += chunk.toString();
  });
  proc.on("close", (code) => {
    isUpdatingYtDlp = false;
    ytDlpPhase = null;
    if (code !== 0) {
      console.log("yt-dlp update check failed (non-critical):", stderrAll.trim() || `exit ${code}`);
      safeSend("ytdlp-update-status", { status: "error" });
      return;
    }
    const updated = stdoutAll.includes("Updated yt-dlp") || stdoutAll.includes("Successfully updated");
    safeSend("ytdlp-update-status", { status: updated ? "updated" : "up-to-date" });
    if (stdoutAll) console.log("yt-dlp update:", stdoutAll.trim());
    if (stderrAll) console.log("yt-dlp update stderr:", stderrAll.trim());
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(ytDlpBinaryPath, "755");
      } catch (chmodErr) {
        console.error("Failed to chmod yt-dlp after update:", chmodErr);
      }
    }
    if (process.platform === "darwin") {
      execFile("xattr", ["-dr", "com.apple.quarantine", ytDlpBinaryPath], (xattrErr) => {
        if (xattrErr) console.log("xattr quarantine clear (non-critical):", xattrErr.message);
      });
    }
  });
  proc.on("error", (err) => {
    isUpdatingYtDlp = false;
    ytDlpPhase = null;
    console.log("yt-dlp update spawn error (non-critical):", err.message);
    safeSend("ytdlp-update-status", { status: "error" });
  });
}
ipcMain.handle("get-ytdlp-status", () => ytDlpPhase);
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenu(null);
  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}
function startNetworkMonitoring() {
  if (networkCheckInterval) return;
  wasOnline = net.isOnline();
  networkCheckInterval = setInterval(() => {
    const online = net.isOnline();
    if (online === wasOnline) return;
    wasOnline = online;
    if (!online && currentDownloadProcess && !currentDownloadProcess.isPaused) {
      currentDownloadProcess.pause("network");
    } else if (online && currentDownloadProcess && currentDownloadProcess.isPaused && currentDownloadProcess.pauseReason === "network") {
      currentDownloadProcess.resume();
    }
  }, 3e3);
}
ipcMain.handle("get-app-version", () => app.getVersion());
app.whenReady().then(() => {
  createWindow();
  startNetworkMonitoring();
  mainWindow.webContents.once("did-finish-load", () => {
    updateYtDlp();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  if (currentDownloadProcess) {
    currentDownloadProcess.cancel();
  }
  if (networkCheckInterval) {
    clearInterval(networkCheckInterval);
    networkCheckInterval = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
const formatBytes = (bytes, decimals = 2) => {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};
const sizeToBytes = (value, unit) => {
  const normalizedUnit = (unit || "").toUpperCase();
  const multiplierMap = {
    B: 1,
    KB: 1024,
    KIB: 1024,
    MB: 1024 ** 2,
    MIB: 1024 ** 2,
    GB: 1024 ** 3,
    GIB: 1024 ** 3,
    TB: 1024 ** 4,
    TIB: 1024 ** 4
  };
  const multiplier = multiplierMap[normalizedUnit] || 1;
  return Math.round(value * multiplier);
};
ipcMain.handle("get-history", () => store.get("downloadHistory", []));
ipcMain.handle("clear-history", () => store.set("downloadHistory", []));
ipcMain.handle("add-history-item", (event, item) => {
  const history = store.get("downloadHistory", []);
  const updated = [item, ...history];
  store.set("downloadHistory", updated);
});
ipcMain.handle("delete-history-item", (event, timestamp) => {
  const history = store.get("downloadHistory", []);
  const updated = history.filter((item) => item.timestamp !== timestamp);
  store.set("downloadHistory", updated);
  return updated;
});
ipcMain.handle("open-file-location", (event, filePath) => {
  if (fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
  } else {
    dialog.showErrorBox(
      "File Not Found",
      "The file could not be found at the original location. It may have been moved or deleted."
    );
  }
});
ipcMain.handle("open-external-link", (event, url) => shell.openExternal(url));
ipcMain.on("cancel-download", (event, options) => {
  if (currentDownloadProcess && typeof currentDownloadProcess.cancel === "function") {
    currentDownloadProcess.cancel(options == null ? void 0 : options.keepOriginal);
  }
});
ipcMain.on("pause-download", () => {
  if (currentDownloadProcess && typeof currentDownloadProcess.pause === "function") {
    currentDownloadProcess.pause();
  }
});
ipcMain.on("resume-download", () => {
  if (currentDownloadProcess && typeof currentDownloadProcess.resume === "function") {
    currentDownloadProcess.resume();
  }
});
ipcMain.on("cancel-info-fetch", () => {
  if (currentInfoFetchProcess) {
    try {
      currentInfoFetchProcess.kill("SIGTERM");
    } catch (e) {
      console.error("Failed to kill info fetch process:", e.message);
    }
    currentInfoFetchProcess = null;
  }
});
const COOKIES_PATH = path.join(app.getPath("userData"), "youtube_cookies.txt");
async function extractYouTubeCookies() {
  const cookies = await session.defaultSession.cookies.get({ domain: ".youtube.com" });
  let cookieText = "# Netscape HTTP Cookie File\n";
  cookies.forEach((cookie) => {
    const domain = cookie.domain;
    const includeSubDomain = domain.startsWith(".") ? "TRUE" : "FALSE";
    const cPath = cookie.path;
    const secure = cookie.secure ? "TRUE" : "FALSE";
    const expiry = cookie.expirationDate ? Math.floor(cookie.expirationDate) : 0;
    cookieText += `${domain}	${includeSubDomain}	${cPath}	${secure}	${expiry}	${cookie.name}	${cookie.value}
`;
  });
  fs.writeFileSync(COOKIES_PATH, cookieText, "utf8");
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
    loginWin.loadURL("https://accounts.google.com/ServiceLogin?service=youtube");
    let resolved = false;
    loginWin.webContents.on("did-navigate", async (event, url) => {
      if (url.includes("youtube.com") && !url.includes("accounts.google.com") && !resolved) {
        resolved = true;
        await extractYouTubeCookies();
        loginWin.close();
        resolve(true);
      }
    });
    loginWin.on("closed", () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
  });
});
ipcMain.handle("logout-youtube", async () => {
  const cookies = await session.defaultSession.cookies.get({ domain: ".youtube.com" });
  for (const cookie of cookies) {
    let url = (cookie.secure ? "https://" : "http://") + cookie.domain.replace(/^\./, "") + cookie.path;
    await session.defaultSession.cookies.remove(url, cookie.name);
  }
  const googleCookies = await session.defaultSession.cookies.get({ domain: ".google.com" });
  for (const cookie of googleCookies) {
    let url = (cookie.secure ? "https://" : "http://") + cookie.domain.replace(/^\./, "") + cookie.path;
    await session.defaultSession.cookies.remove(url, cookie.name);
  }
  if (fs.existsSync(COOKIES_PATH)) {
    fs.unlinkSync(COOKIES_PATH);
  }
  return true;
});
ipcMain.handle("check-youtube-auth", async () => {
  const cookies = await session.defaultSession.cookies.get({ domain: ".youtube.com", name: "LOGIN_INFO" });
  if (cookies.length > 0) {
    await extractYouTubeCookies();
    return true;
  }
  const sidCookies = await session.defaultSession.cookies.get({ domain: ".youtube.com", name: "SID" });
  if (sidCookies.length > 0) {
    await extractYouTubeCookies();
    return true;
  }
  return false;
});
function getAuthArgs() {
  if (fs.existsSync(COOKIES_PATH)) {
    return ["--cookies", COOKIES_PATH];
  }
  return [];
}
async function runYtDlpJson(url, extraArgs = [], silent = false) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ytDlpBinaryPath, [
      url,
      "-J",
      ...getAuthArgs(),
      ...BASE_ARGS,
      ...extraArgs
    ], { env: getYtDlpEnv(), windowsHide: true });
    if (!silent) currentInfoFetchProcess = proc;
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => {
      out += d.toString();
    });
    proc.stderr.on("data", (d) => {
      err += d.toString();
    });
    proc.on("close", (code) => {
      if (!silent) currentInfoFetchProcess = null;
      if (code === 0) {
        resolve(JSON.parse(out));
      } else {
        const errorMsg = err || `yt-dlp exited with code ${code}`;
        if (errorMsg.includes("Sign in to confirm your age")) {
          reject(new Error("AGE_RESTRICTED"));
        } else {
          reject(new Error(errorMsg));
        }
      }
    });
    proc.on("error", (e) => {
      currentInfoFetchProcess = null;
      reject(e);
    });
  });
}
function isBasicPlayerResponse(formats) {
  if (formats.length < 10) return true;
  const adaptiveVideo = formats.some((f) => f.vcodec && f.vcodec !== "none" && f.acodec === "none");
  return !adaptiveVideo;
}
ipcMain.handle("get-video-info", async (event, url) => {
  if (isUpdatingYtDlp) {
    return { success: false, error: "yt-dlp is updating in the background, please try again in a moment." };
  }
  try {
    console.log("Fetching video info for:", url);
    let info = await runYtDlpJson(url);
    console.log("Total formats available:", info.formats.length);
    if (isBasicPlayerResponse(info.formats)) {
      console.log("Basic player response detected — retrying with android+web player client…");
      try {
        info = await runYtDlpJson(url, [
          "--extractor-args",
          "youtube:player_client=android,web"
        ], false);
        console.log("Retry: total formats available:", info.formats.length);
      } catch (retryErr) {
        console.warn("Retry failed, falling back to initial result:", retryErr.message);
      }
    }
    info.formats.forEach((f) => {
      if (f.vcodec && f.vcodec !== "none") {
        console.log(`  fmt ${f.format_id}: ${f.width}x${f.height} vcodec=${f.vcodec} acodec=${f.acodec} size=${f.filesize || f.filesize_approx || "?"}`);
      }
    });
    const heightMap = {};
    info.formats.forEach((f) => {
      const rawH = f.height || 0;
      const rawW = f.width || 0;
      const displayH = rawW > 0 && rawH > 0 ? Math.min(rawW, rawH) : rawH;
      if (!displayH || displayH < 240) return;
      if (!f.vcodec || f.vcodec === "none") return;
      const size = f.filesize || f.filesize_approx || 0;
      const fps = f.fps || 30;
      const isAdaptive = f.acodec === "none";
      const isH264 = f.vcodec.startsWith("avc") || f.vcodec === "h264";
      const isVP9 = f.vcodec.startsWith("vp09") || f.vcodec.startsWith("vp9");
      const isAV1 = f.vcodec.startsWith("av01");
      const key = `${displayH}_${fps > 30 ? fps : 30}`;
      const codecScore = isH264 ? 2 : isVP9 ? 1 : 0;
      const score = (isAdaptive ? 4 : 0) + codecScore;
      const cur = heightMap[key];
      const curScore = cur ? (cur.isAdaptive ? 4 : 0) + (cur.isH264 ? 2 : cur.isVP9 ? 1 : 0) : -1;
      if (score > curScore || score === curScore && size > ((cur == null ? void 0 : cur.size) || 0)) {
        heightMap[key] = {
          displayHeight: displayH,
          // shorter dimension — for UI label
          ytdlpHeight: rawH,
          // actual yt-dlp height — for format filter
          fps,
          size,
          isAdaptive,
          isH264,
          isVP9,
          isAV1
        };
      }
    });
    const uniqueFormats = Object.values(heightMap).map((f) => ({
      itag: `${f.ytdlpHeight}`,
      // actual yt-dlp height, used in download format arg
      quality: `${f.displayHeight}p${f.fps > 30 ? f.fps : ""}${f.isH264 ? "" : f.isVP9 ? " (VP9)" : f.isAV1 ? " (AV1)" : ""}`,
      height: f.displayHeight,
      size: f.size,
      sizeFormatted: f.size > 0 ? formatBytes(f.size) : "N/A",
      isH264: f.isH264
    })).sort((a, b) => b.height - a.height);
    console.log("Available qualities:", uniqueFormats.map((f) => f.quality).join(", "));
    const audioFormat = info.formats.filter((f) => f.acodec !== "none" && f.vcodec === "none").sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
    const audioSize = (audioFormat == null ? void 0 : audioFormat.filesize) || (audioFormat == null ? void 0 : audioFormat.filesize_approx) || 0;
    return {
      success: true,
      videoId: info.id,
      formats: uniqueFormats.length > 0 ? uniqueFormats : [{ itag: "best", quality: "Best", size: 0, sizeFormatted: "N/A" }],
      title: info.title,
      description: info.description || "",
      thumbnailUrl: info.thumbnail,
      audioSizeFormatted: formatBytes(audioSize)
    };
  } catch (error) {
    if (error.message === "AGE_RESTRICTED") {
      return { success: false, isAgeRestricted: true, error: "The content is age-restricted. Please sign in via Google." };
    }
    console.error("Error fetching video info:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("get-single-video-info-silent", async (event, url) => {
  try {
    let info = await runYtDlpJson(url, [], true);
    if (isBasicPlayerResponse(info.formats)) {
      try {
        info = await runYtDlpJson(url, ["--extractor-args", "youtube:player_client=android,web"], true);
      } catch (retryErr) {
      }
    }
    const heightMap = {};
    info.formats.forEach((f) => {
      const rawH = f.height || 0;
      const rawW = f.width || 0;
      const displayH = rawW > 0 && rawH > 0 ? Math.min(rawW, rawH) : rawH;
      if (!displayH || displayH < 240) return;
      if (!f.vcodec || f.vcodec === "none") return;
      const size = f.filesize || f.filesize_approx || 0;
      const fps = f.fps || 30;
      const isAdaptive = f.acodec === "none";
      const isH264 = f.vcodec.startsWith("avc") || f.vcodec === "h264";
      const isVP9 = f.vcodec.startsWith("vp09") || f.vcodec.startsWith("vp9");
      const isAV1 = f.vcodec.startsWith("av01");
      const key = `${displayH}_${fps > 30 ? fps : 30}`;
      const codecScore = isH264 ? 2 : isVP9 ? 1 : 0;
      const score = (isAdaptive ? 4 : 0) + codecScore;
      const cur = heightMap[key];
      const curScore = cur ? (cur.isAdaptive ? 4 : 0) + (cur.isH264 ? 2 : cur.isVP9 ? 1 : 0) : -1;
      if (score > curScore || score === curScore && size > ((cur == null ? void 0 : cur.size) || 0)) {
        heightMap[key] = { displayHeight: displayH, ytdlpHeight: rawH, fps, size, isAdaptive, isH264, isVP9, isAV1 };
      }
    });
    const uniqueFormats = Object.values(heightMap).map((f) => ({
      itag: `${f.ytdlpHeight}`,
      quality: `${f.displayHeight}p${f.fps > 30 ? f.fps : ""}${f.isH264 ? "" : f.isVP9 ? " (VP9)" : f.isAV1 ? " (AV1)" : ""}`,
      height: f.displayHeight,
      size: f.size,
      sizeFormatted: f.size > 0 ? formatBytes(f.size) : "N/A",
      isH264: f.isH264
    })).sort((a, b) => b.height - a.height);
    return {
      success: true,
      videoId: info.id,
      formats: uniqueFormats.length > 0 ? uniqueFormats : [{ itag: "best", quality: "Best", size: 0, sizeFormatted: "N/A" }]
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle("get-playlist-info", async (event, url) => {
  if (isUpdatingYtDlp) {
    return { success: false, error: "yt-dlp is updating in the background, please try again in a moment." };
  }
  try {
    let cleanUrl = url;
    try {
      const u = new URL(url);
      const listId = u.searchParams.get("list");
      if (listId) {
        cleanUrl = `https://www.youtube.com/playlist?list=${listId}`;
      }
    } catch (e) {
    }
    console.log("Fetching playlist info for:", cleanUrl);
    const info = await runYtDlpJson(cleanUrl, ["--flat-playlist", "--yes-playlist"]);
    const entries = info.entries || [];
    const videos = entries.filter((v) => v.id && v.title && v.title !== "[Private video]" && v.title !== "[Deleted video]").map((v) => ({
      id: v.id,
      url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
      title: v.title,
      duration: v.duration || 0,
      uploader: v.uploader || v.channel || info.uploader || info.channel || "Unknown",
      thumbnail: v.thumbnails && v.thumbnails.length > 0 ? v.thumbnails[v.thumbnails.length - 1].url : `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`
    }));
    return {
      success: true,
      title: info.title || "Unknown Playlist",
      uploader: info.uploader || info.channel || "Unknown",
      description: info.description || "",
      videos
    };
  } catch (error) {
    console.error("Error fetching playlist info:", error);
    return {
      success: false,
      error: error.message,
      isAgeRestricted: error.message === "AGE_RESTRICTED"
    };
  }
});
ipcMain.handle("choose-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});
ipcMain.handle("download-thumbnail", async (event, { url, title }) => {
  const safeTitle = title.replace(/[\\/:"*?<>|]/g, "");
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "Save Thumbnail",
    defaultPath: `${safeTitle}_thumbnail.jpg`,
    buttonLabel: "Save Image",
    filters: [{ name: "JPEG Image", extensions: ["jpg"] }]
  });
  if (canceled || !filePath) return { success: false, error: "Save dialog was canceled." };
  return new Promise((resolve) => {
    const fileStream = fs.createWriteStream(filePath);
    const request = https.get(url, (response) => {
      if (response.statusCode !== 200) {
        fs.unlink(filePath, () => {
        });
        resolve({ success: false, error: `Download failed. Status: ${response.statusCode}` });
        return;
      }
      response.pipe(fileStream);
    });
    fileStream.on("finish", () => fileStream.close(() => resolve({ success: true, path: filePath })));
    request.on("error", (err) => {
      fs.unlink(filePath, () => {
      });
      resolve({ success: false, error: err.message });
    });
  });
});
function deletePartialDownloadFiles(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log("Deleted partial file:", filePath);
    }
  } catch (err) {
    console.error("Failed to delete partial file:", filePath, err.message);
  }
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const tempPrefix = base + ".f";
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith(tempPrefix) && entry !== path.basename(filePath)) {
        const tempPath = path.join(dir, entry);
        try {
          fs.unlinkSync(tempPath);
          console.log("Deleted yt-dlp temp file:", tempPath);
        } catch (e) {
          console.error("Failed to delete yt-dlp temp file:", tempPath, e.message);
        }
      }
    }
  } catch (e) {
    console.error("Failed to scan directory for temp files:", e.message);
  }
}
ipcMain.handle("download-video", async (event, { videoId, url, quality, qualityLabel, type, title, thumbnailUrl, convertToH264, targetDir, allowDuplicates, skipHistory }) => {
  if (isUpdatingYtDlp) {
    return { success: false, error: "yt-dlp is updating in the background, please try again in a moment." };
  }
  const safeTitle = title.replace(/[\\/:"*?<>|]/g, "");
  const ext = type === "mp4" ? "mp4" : "mp3";
  let filePath;
  let canceled = false;
  if (targetDir) {
    filePath = path.join(targetDir, `${safeTitle}.${ext}`);
    if (fs.existsSync(filePath)) {
      if (allowDuplicates) {
        let counter = 1;
        while (fs.existsSync(filePath)) {
          filePath = path.join(targetDir, `${safeTitle} (${counter}).${ext}`);
          counter++;
        }
      } else {
        try {
          fs.unlinkSync(filePath);
          console.log("Deleted existing file to force fresh download");
        } catch (err) {
          console.error("Failed to delete existing file:", err);
        }
      }
    }
  } else {
    const dialogResult = await dialog.showSaveDialog(mainWindow, {
      title: `Save ${type.toUpperCase()}`,
      defaultPath: `${safeTitle}.${ext}`,
      buttonLabel: "Save",
      filters: type === "mp4" ? [{ name: "MPEG-4 Video", extensions: ["mp4"] }] : [{ name: "MP3 Audio", extensions: ["mp3"] }]
    });
    canceled = dialogResult.canceled;
    filePath = dialogResult.filePath;
    if (canceled || !filePath) return { success: false, error: "Save dialog was canceled." };
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log("Deleted existing file to force fresh download");
      } catch (err) {
        console.error("Failed to delete existing file:", err);
      }
    }
  }
  if (canceled || !filePath) return { success: false, error: "Save dialog was canceled." };
  let isCancelled = false;
  let isPaused = false;
  let pauseReason = null;
  let ytDlpProcess = null;
  let ffmpegProcess = null;
  let keepOriginalOnCancel = false;
  let downloadStage = "starting";
  let downloadStartTime = Date.now();
  let totalPauseDuration = 0;
  let pauseStartTime = 0;
  let speedWindow = [];
  let lastPayloadTime = 0;
  currentDownloadProcess = {
    cancel: (keepOriginal = false) => {
      isCancelled = true;
      keepOriginalOnCancel = keepOriginal;
      if (ytDlpProcess) {
        if (isPaused && process.platform !== "win32") {
          try {
            process.kill(-ytDlpProcess.pid, "SIGCONT");
          } catch (e) {
          }
        }
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(ytDlpProcess.pid), "/f", "/t"], { windowsHide: true });
        } else {
          try {
            process.kill(-ytDlpProcess.pid, "SIGTERM");
          } catch (_) {
            ytDlpProcess.kill("SIGTERM");
          }
        }
      }
      if (ffmpegProcess) {
        if (isPaused && process.platform !== "win32") {
          try {
            process.kill(-ffmpegProcess.pid, "SIGCONT");
          } catch (e) {
          }
        }
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(ffmpegProcess.pid), "/f", "/t"], { windowsHide: true });
        } else {
          try {
            process.kill(-ffmpegProcess.pid, "SIGTERM");
          } catch (_) {
            ffmpegProcess.kill("SIGTERM");
          }
        }
      }
      isPaused = false;
      pauseReason = null;
      pauseStartTime = 0;
    },
    pause: (reason = "user") => {
      if (isPaused || !ytDlpProcess && !ffmpegProcess || isCancelled) return;
      if (downloadStage === "merging" || downloadStage === "processing") return;
      isPaused = true;
      pauseReason = reason;
      pauseStartTime = Date.now();
      if (process.platform !== "win32") {
        try {
          if (ytDlpProcess) process.kill(-ytDlpProcess.pid, "SIGSTOP");
          if (ffmpegProcess) process.kill(-ffmpegProcess.pid, "SIGSTOP");
          console.log(`SIGSTOP sent to process group`);
        } catch (e) {
          console.error("SIGSTOP failed:", e.message);
          try {
            if (ytDlpProcess) ytDlpProcess.kill("SIGSTOP");
            if (ffmpegProcess) ffmpegProcess.kill("SIGSTOP");
          } catch (e2) {
          }
        }
      }
      console.log(`Download paused (${reason})`);
      safeSend("download-progress", { paused: true, reason, stage: downloadStage });
    },
    resume: () => {
      if (!isPaused || !ytDlpProcess && !ffmpegProcess || isCancelled) return;
      isPaused = false;
      pauseReason = null;
      if (pauseStartTime) {
        totalPauseDuration += Date.now() - pauseStartTime;
        pauseStartTime = 0;
      }
      if (process.platform !== "win32") {
        try {
          if (ytDlpProcess) process.kill(-ytDlpProcess.pid, "SIGCONT");
          if (ffmpegProcess) process.kill(-ffmpegProcess.pid, "SIGCONT");
          console.log(`SIGCONT sent to process group`);
        } catch (e) {
          console.error("SIGCONT failed:", e.message);
          try {
            if (ytDlpProcess) ytDlpProcess.kill("SIGCONT");
            if (ffmpegProcess) ffmpegProcess.kill("SIGCONT");
          } catch (e2) {
          }
        }
      }
      console.log("Download resumed");
      safeSend("download-progress", { paused: false, reason: null, stage: downloadStage });
    },
    get isPaused() {
      return isPaused;
    },
    get pauseReason() {
      return pauseReason;
    },
    get stage() {
      return downloadStage;
    }
  };
  try {
    let formatArg;
    if (type === "mp3") {
      formatArg = "bestaudio[ext=m4a]/bestaudio";
    } else {
      const h = parseInt(quality);
      if (!isNaN(h)) {
        formatArg = `bestvideo[height=${h}][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height=${h}][vcodec^=avc]+bestaudio/bestvideo[height=${h}][vcodec!^=av01]+bestaudio[ext=m4a]/bestvideo[height=${h}][vcodec!^=av01]+bestaudio/bestvideo[height=${h}]+bestaudio[ext=m4a]/bestvideo[height=${h}]+bestaudio/bestvideo[height<=${h}][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=${h}][vcodec^=avc]+bestaudio/bestvideo[height<=${h}][vcodec!^=av01]+bestaudio[ext=m4a]/bestvideo[height<=${h}][vcodec!^=av01]+bestaudio/bestvideo[height<=${h}]+bestaudio/best`;
      } else {
        formatArg = "bestvideo[vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc]+bestaudio/bestvideo[vcodec!^=av01]+bestaudio[ext=m4a]/bestvideo[vcodec!^=av01]+bestaudio/bestvideo+bestaudio[ext=m4a]/bestvideo+bestaudio/best";
      }
    }
    console.log("Download request - Selected format:", formatArg, "Quality itag:", quality, "Type:", type);
    const args = [
      url,
      "--format",
      formatArg,
      "--output",
      filePath,
      "--ffmpeg-location",
      ffmpegPath,
      "--newline",
      ...getAuthArgs(),
      ...BASE_ARGS
    ];
    if (type === "mp3") {
      args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0");
    } else {
      args.push("--merge-output-format", "mp4");
    }
    console.log("Starting yt-dlp with command:", ytDlpBinaryPath, args.join(" "));
    ytDlpProcess = spawn(ytDlpBinaryPath, args, { env: getYtDlpEnv(), detached: true, windowsHide: true });
    safeSend("download-progress", { percent: 0, downloadedBytes: 0, totalBytes: 0, stage: "starting" });
    let lastPercent = -1;
    let stdoutBuf = "";
    let stageCount = 0;
    ytDlpProcess.stdout.on("data", (chunk) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop();
      lines.forEach((line) => {
        if (!line.trim()) return;
        console.log("yt-dlp:", line);
        if (line.includes("[download] Destination:")) {
          stageCount++;
          if (type === "mp3") {
            downloadStage = "audio";
          } else {
            downloadStage = stageCount === 1 ? "video" : "audio";
          }
          lastPercent = -1;
          speedWindow = [];
        } else if (line.includes("[Merger]") || line.includes("[Mux]")) {
          downloadStage = "merging";
          if (!isPaused) safeSend("download-progress", { percent: -1, downloadedBytes: 0, totalBytes: 0, stage: "merging" });
        } else if (line.includes("[ExtractAudio]") || line.includes("[FFmpegMetadata]")) {
          downloadStage = "processing";
          if (!isPaused) safeSend("download-progress", { percent: -1, downloadedBytes: 0, totalBytes: 0, stage: "processing" });
        }
        if (isPaused) return;
        const downloadMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+)([KMGTi]+B)/i);
        let percentValue = null;
        let downloadedBytes = 0;
        let totalBytes = 0;
        if (downloadMatch) {
          percentValue = Math.min(100, parseFloat(downloadMatch[1]));
          const totalValue = parseFloat(downloadMatch[2]);
          const unit = downloadMatch[3];
          totalBytes = sizeToBytes(totalValue, unit);
          downloadedBytes = Math.round(totalBytes * (percentValue / 100));
        } else {
          const bare = line.match(/(?:^|\s)(\d{1,3}\.?\d*)%/);
          if (bare) percentValue = Math.min(100, parseFloat(bare[1]));
        }
        if (percentValue !== null && downloadedBytes > 0) {
          const now2 = Date.now();
          if (speedWindow.length === 0 || speedWindow[speedWindow.length - 1].t !== now2) {
            speedWindow.push({ t: now2, b: downloadedBytes });
          }
          while (speedWindow.length > 0 && now2 - speedWindow[0].t > 1e4) {
            speedWindow.shift();
          }
        }
        const now = Date.now();
        if (percentValue !== null && percentValue !== lastPercent || now - lastPayloadTime > 500) {
          if (percentValue !== null) lastPercent = percentValue;
          let currentSpeed = 0;
          let currentEta = 0;
          if (speedWindow.length > 1) {
            const oldest = speedWindow[0];
            const newest = speedWindow[speedWindow.length - 1];
            const timeDiffSec = (newest.t - oldest.t) / 1e3;
            const bytesDiff = newest.b - oldest.b;
            if (timeDiffSec > 0 && bytesDiff > 0) {
              currentSpeed = bytesDiff / timeDiffSec;
              if (totalBytes > downloadedBytes) {
                currentEta = Math.round((totalBytes - downloadedBytes) / currentSpeed);
              }
            }
          }
          let elapsedSec = Math.floor((now - downloadStartTime - totalPauseDuration) / 1e3);
          if (elapsedSec < 0) elapsedSec = 0;
          lastPayloadTime = now;
          safeSend("download-progress", {
            percent: lastPercent !== -1 ? lastPercent : 0,
            downloadedBytes,
            totalBytes,
            stage: downloadStage,
            speed: currentSpeed,
            eta: currentEta,
            elapsed: elapsedSec
          });
        }
      });
    });
    ytDlpProcess.stderr.on("data", (data) => {
      console.error("yt-dlp stderr:", data.toString());
    });
    await new Promise((resolve, reject) => {
      ytDlpProcess.on("close", (code) => {
        if (isCancelled) {
          reject(new Error("Download was canceled."));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
      ytDlpProcess.on("error", (err) => reject(err));
    });
    if (isCancelled) throw new Error("Download was canceled.");
    if (convertToH264 && type === "mp4" && !isCancelled) {
      downloadStage = "converting";
      speedWindow = [];
      const tempOutput = filePath + ".tmp.mp4";
      safeSend("download-progress", { percent: 0, downloadedBytes: 0, totalBytes: 0, stage: "converting" });
      await new Promise((resolve, reject) => {
        const args2 = [
          "-y",
          "-i",
          filePath,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "23",
          "-c:a",
          "copy",
          tempOutput
        ];
        console.log("Starting offline FFmpeg conversion:", ffmpegPath, args2.join(" "));
        ffmpegProcess = spawn(ffmpegPath, args2, { detached: true, windowsHide: true });
        let totalDurationSec = 0;
        ffmpegProcess.stderr.on("data", (data) => {
          const out = data.toString();
          const dirMatch = out.match(/Duration:\s+(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          if (dirMatch && !totalDurationSec) {
            totalDurationSec = parseInt(dirMatch[1]) * 3600 + parseInt(dirMatch[2]) * 60 + parseFloat(dirMatch[3]);
          }
          const timeMatch = out.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          if (timeMatch && totalDurationSec > 0 && !isPaused) {
            const currentSec = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
            let percentValue = currentSec / totalDurationSec * 100;
            if (percentValue > 100) percentValue = 100;
            const now = Date.now();
            if (speedWindow.length === 0 || speedWindow[speedWindow.length - 1].t !== now) {
              speedWindow.push({ t: now, b: currentSec });
            }
            while (speedWindow.length > 0 && now - speedWindow[0].t > 1e4) {
              speedWindow.shift();
            }
            if (now - lastPayloadTime > 500) {
              lastPayloadTime = now;
              let elapsedSec = Math.floor((now - downloadStartTime - totalPauseDuration) / 1e3);
              if (elapsedSec < 0) elapsedSec = 0;
              let currentSpeed = 0;
              let currentEta = 0;
              if (speedWindow.length > 1) {
                const oldest = speedWindow[0];
                const newest = speedWindow[speedWindow.length - 1];
                const timeDiffSec = (newest.t - oldest.t) / 1e3;
                const processedDiff = newest.b - oldest.b;
                if (timeDiffSec > 0 && processedDiff > 0) {
                  currentSpeed = processedDiff / timeDiffSec;
                  const remainingVideoSec = totalDurationSec - currentSec;
                  if (remainingVideoSec > 0) {
                    currentEta = Math.round(remainingVideoSec / currentSpeed);
                  }
                }
              }
              safeSend("download-progress", {
                percent: percentValue,
                downloadedBytes: 0,
                totalBytes: 0,
                stage: "converting",
                speed: currentSpeed,
                eta: currentEta,
                elapsed: elapsedSec
              });
            }
          }
        });
        ffmpegProcess.on("close", (code) => {
          if (isCancelled) {
            if (keepOriginalOnCancel) {
              resolve();
            } else {
              reject(new Error("Conversion was canceled."));
            }
          } else if (code === 0) {
            try {
              fs.renameSync(tempOutput, filePath);
              console.log("Conversion successful. Overwrote original file.");
            } catch (e) {
              console.error("Rename failed after conversion", e);
            }
            resolve();
          } else {
            reject(new Error(`ffmpeg exited with code ${code}`));
          }
        });
        ffmpegProcess.on("error", (err) => reject(err));
      });
      if (isCancelled && !keepOriginalOnCancel) throw new Error("Conversion was canceled.");
    }
    console.log("Download complete! File saved at:", filePath);
    const finalSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    safeSend("download-progress", {
      percent: 100,
      downloadedBytes: finalSize,
      totalBytes: finalSize,
      stage: "done"
    });
    if (!skipHistory) {
      const history = store.get("downloadHistory", []);
      const label = type === "mp3" ? "AUDIO" : qualityLabel;
      const newHistoryItem = {
        id: videoId,
        title,
        thumbnailUrl,
        url,
        format: `${label} (${type.toUpperCase()})`,
        path: filePath,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      const updatedHistory = [newHistoryItem, ...history.filter((h) => h.id !== videoId || h.path !== filePath)];
      store.set("downloadHistory", updatedHistory);
    }
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (isCancelled) {
      if (keepOriginalOnCancel) {
        try {
          fs.unlinkSync(filePath + ".tmp.mp4");
        } catch (e) {
        }
      } else {
        deletePartialDownloadFiles(filePath);
        try {
          fs.unlinkSync(filePath + ".tmp.mp4");
        } catch (e) {
        }
      }
    }
    currentDownloadProcess = null;
  }
});
