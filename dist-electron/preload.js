"use strict";
const { contextBridge, ipcRenderer } = require("electron");
const subscribe = (channel) => (callback) => {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, (_event, value) => callback(value));
};
contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  // Info fetching
  getVideoInfo: (url) => ipcRenderer.invoke("get-video-info", url),
  getPlaylistInfo: (url) => ipcRenderer.invoke("get-playlist-info", url),
  cancelInfoFetch: () => ipcRenderer.send("cancel-info-fetch"),
  // Playlist format prefetching (parallel, streamed results)
  prefetchPlaylistFormats: (videos) => ipcRenderer.invoke("prefetch-playlist-formats", videos),
  cancelPlaylistPrefetch: () => ipcRenderer.send("cancel-playlist-prefetch"),
  onPlaylistFormatResult: subscribe("playlist-format-result"),
  // Download queue
  queueVideo: (options) => ipcRenderer.invoke("queue-video", options),
  queuePlaylist: (options) => ipcRenderer.invoke("queue-playlist", options),
  getQueue: () => ipcRenderer.invoke("get-queue"),
  cancelJob: (options) => ipcRenderer.send("cancel-job", options),
  skipPlaylistItem: (options) => ipcRenderer.send("skip-playlist-item", options),
  pauseDownload: () => ipcRenderer.send("pause-download"),
  resumeDownload: () => ipcRenderer.send("resume-download"),
  onQueueUpdated: subscribe("queue-updated"),
  onDownloadProgress: subscribe("download-progress"),
  onJobFinished: subscribe("job-finished"),
  // Files & folders
  chooseDirectory: () => ipcRenderer.invoke("choose-directory"),
  downloadThumbnail: (options) => ipcRenderer.invoke("download-thumbnail", options),
  openFileLocation: (filePath) => ipcRenderer.invoke("open-file-location", filePath),
  openFileOrFolder: (options) => ipcRenderer.invoke("open-file-or-folder", options),
  fileExists: (filePath) => ipcRenderer.invoke("file-exists", filePath),
  openExternalLink: (url) => ipcRenderer.invoke("open-external-link", url),
  // History
  getHistory: () => ipcRenderer.invoke("get-history"),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  addHistoryItem: (item) => ipcRenderer.invoke("add-history-item", item),
  updateHistoryItem: (item) => ipcRenderer.invoke("update-history-item", item),
  deleteHistoryItem: (timestamp) => ipcRenderer.invoke("delete-history-item", timestamp),
  onHistoryUpdated: subscribe("history-updated"),
  // YouTube auth
  loginYoutube: () => ipcRenderer.invoke("login-youtube"),
  logoutYoutube: () => ipcRenderer.invoke("logout-youtube"),
  checkYoutubeAuth: () => ipcRenderer.invoke("check-youtube-auth"),
  // yt-dlp update status
  onYtDlpUpdateStatus: subscribe("ytdlp-update-status"),
  getYtDlpStatus: () => ipcRenderer.invoke("get-ytdlp-status"),
  // App version
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  // Appearance — read synchronously at preload time so the renderer can paint
  // the right theme on its very first frame (no flash on startup).
  initialAppearance: ipcRenderer.sendSync("get-appearance-sync"),
  getAppearance: () => ipcRenderer.invoke("get-appearance"),
  setAppearance: (preference) => ipcRenderer.invoke("set-appearance", preference),
  onAppearanceChanged: subscribe("appearance-changed")
});
