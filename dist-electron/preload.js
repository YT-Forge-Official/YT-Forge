"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
  getVideoInfo: (url) => ipcRenderer.invoke("get-video-info", url),
  getSingleVideoInfoSilent: (url) => ipcRenderer.invoke("get-single-video-info-silent", url),
  getPlaylistInfo: (url) => ipcRenderer.invoke("get-playlist-info", url),
  chooseDirectory: () => ipcRenderer.invoke("choose-directory"),
  downloadPlaylist: (options) => ipcRenderer.invoke("download-playlist", options),
  downloadVideo: (options) => ipcRenderer.invoke("download-video", options),
  downloadThumbnail: (options) => ipcRenderer.invoke("download-thumbnail", options),
  getHistory: () => ipcRenderer.invoke("get-history"),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  addHistoryItem: (item) => ipcRenderer.invoke("add-history-item", item),
  deleteHistoryItem: (timestamp) => ipcRenderer.invoke("delete-history-item", timestamp),
  openFileLocation: (filePath) => ipcRenderer.invoke("open-file-location", filePath),
  openExternalLink: (url) => ipcRenderer.invoke("open-external-link", url),
  loginYoutube: () => ipcRenderer.invoke("login-youtube"),
  logoutYoutube: () => ipcRenderer.invoke("logout-youtube"),
  checkYoutubeAuth: () => ipcRenderer.invoke("check-youtube-auth"),
  cancelDownload: (options) => ipcRenderer.send("cancel-download", options),
  cancelInfoFetch: () => ipcRenderer.send("cancel-info-fetch"),
  pauseDownload: () => ipcRenderer.send("pause-download"),
  resumeDownload: () => ipcRenderer.send("resume-download"),
  onDownloadProgress: (callback) => {
    ipcRenderer.removeAllListeners("download-progress");
    ipcRenderer.on("download-progress", (_event, value) => callback(value));
  },
  onYtDlpUpdateStatus: (callback) => {
    ipcRenderer.removeAllListeners("ytdlp-update-status");
    ipcRenderer.on("ytdlp-update-status", (_event, value) => callback(value));
  },
  getYtDlpStatus: () => ipcRenderer.invoke("get-ytdlp-status"),
  // App auto-update APIs
  getAppVersion: () => ipcRenderer.invoke("get-app-version")
});
