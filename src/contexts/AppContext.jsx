import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';

const AppContext = createContext();

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const [url, setUrl] = useState("");
  // Held here so the "/" shortcut can reach the URL field from anywhere.
  const urlInputRef = useRef(null);
  const [videoDetails, setVideoDetails] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [ytDlpStatus, setYtDlpStatus] = useState(null);
  // True when user clicked "Get Video" while yt-dlp was still updating
  const [pendingFetch, setPendingFetch] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [isAgeRestricted, setIsAgeRestricted] = useState(false);

  const [playlistDetails, setPlaylistDetails] = useState(null);
  const [isPlaylistMode, setIsPlaylistMode] = useState(false);
  const [hybridPromptUrl, setHybridPromptUrl] = useState(null);

  // ── Download queue state (mirrors the main-process queue) ────────────────
  const [jobs, setJobs] = useState([]);
  const [jobProgress, setJobProgress] = useState({}); // jobId -> latest progress payload
  const [jobResults, setJobResults] = useState({});   // jobId -> { success, path, error, cancelled, ... }
  // The job the current Details/Playlist view is bound to (so re-opening an
  // active download shows the exact same view it was started from)
  const [boundJobId, setBoundJobId] = useState(null);

  // ── Settings state ────────────────────────────────────────────────────────────
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');

  const openSettings = useCallback((tab = 'general') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const fetchIdRef = useRef(0);
  const urlRef = useRef(url);
  urlRef.current = url;
  const wasAuthenticatedRef = useRef(false);

  useEffect(() => {
    window.electronAPI.onYtDlpUpdateStatus(({ status }) => {
      setYtDlpStatus(status);
    });
  }, []);

  // Fetch history on mount + refresh whenever main process writes new entries
  useEffect(() => {
    window.electronAPI.getHistory().then(setHistory);
    window.electronAPI.onHistoryUpdated(() => {
      window.electronAPI.getHistory().then(setHistory);
    });
  }, []);

  // Queue subscriptions
  useEffect(() => {
    window.electronAPI.getQueue().then(setJobs);
    window.electronAPI.onQueueUpdated(setJobs);
    window.electronAPI.onDownloadProgress((p) => {
      if (!p || !p.jobId) return;
      setJobProgress(prev => {
        const old = prev[p.jobId] || {};
        // Pause/resume status events carry no byte counts — merge them
        if (p.paused !== undefined && p.percent === undefined) {
          return { ...prev, [p.jobId]: { ...old, paused: p.paused, pauseReason: p.reason || null, stage: p.stage || old.stage } };
        }
        return { ...prev, [p.jobId]: { ...old, ...p, paused: false, pauseReason: null } };
      });
    });
    window.electronAPI.onJobFinished((r) => {
      if (!r || !r.jobId) return;
      setJobResults(prev => ({ ...prev, [r.jobId]: r }));
    });
  }, []);

  // Check initial youtube auth state
  useEffect(() => {
    window.electronAPI.checkYoutubeAuth().then((ok) => {
      setIsAuthenticated(ok);
      wasAuthenticatedRef.current = ok;
    });
  }, []);

  const refreshAuth = useCallback(async () => {
    const ok = await window.electronAPI.checkYoutubeAuth();
    if (!ok && wasAuthenticatedRef.current) {
      // Session that used to work no longer does — surface it so the user can re-login
      setAuthExpired(true);
    }
    if (ok) setAuthExpired(false);
    wasAuthenticatedRef.current = ok;
    setIsAuthenticated(ok);
    return ok;
  }, []);

  const loginYoutube = async () => {
    const success = await window.electronAPI.loginYoutube();
    if (success) {
      setIsAuthenticated(true);
      setAuthExpired(false);
      wasAuthenticatedRef.current = true;
    }
    return success;
  };

  const logoutYoutube = async () => {
    await window.electronAPI.logoutYoutube();
    setIsAuthenticated(false);
    setAuthExpired(false);
    wasAuthenticatedRef.current = false;
  };

  // ── Version checking ──────────────────────────────────────────────────────────
  const [appVersion, setAppVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState('');
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [versionChecked, setVersionChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    window.electronAPI.getAppVersion().then(v => {
      if (!mounted) return;
      setAppVersion(v);
      fetch('https://api.github.com/repos/YT-Forge-Official/YT-Forge/releases/latest')
        .then(res => res.json())
        .then(data => {
          if (!mounted || !data?.tag_name) return;
          const latest = data.tag_name.replace(/^v/, '');
          setLatestVersion(latest);
          setHasNewVersion(latest !== v);
          setVersionChecked(true);
        })
        .catch(() => {
          if (mounted) setVersionChecked(true);
        });
    });
    return () => { mounted = false; };
  }, []);

  // The actual fetch logic — uses urlRef so it's always fresh
  const runFetch = useCallback(async () => {
    const currentUrl = urlRef.current;
    if (!currentUrl) return;
    setIsLoading(true);
    setFetchError(null);
    setIsAgeRestricted(false);
    setIsPlaylistMode(false);
    setBoundJobId(null);
    const currentFetchId = ++fetchIdRef.current;
    try {
      const result = await window.electronAPI.getVideoInfo(currentUrl);
      if (currentFetchId !== fetchIdRef.current) return;
      if (result.success) {
        setVideoDetails(result);
      } else {
        console.error(`Error: ${result.error}`);
        setVideoDetails(null);
        if (result.isAgeRestricted) {
          setIsAgeRestricted(true);
          setIsAuthenticated(false);
        }
        setFetchError(result.error);
      }
    } catch (error) {
      if (currentFetchId !== fetchIdRef.current) return;
      console.error("Failed to fetch video details:", error);
      setVideoDetails(null);
      setFetchError(error.message || 'Something went wrong');
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const isYtDlpBusy = ytDlpStatus === 'checking' || ytDlpStatus === 'downloading';

  const handleFetchDetails = () => {
    if (!urlRef.current) return;
    if (isYtDlpBusy) {
      setPendingFetch(true);
      setIsLoading(true);
      setFetchError(null);

      try {
        const u = new URL(urlRef.current);
        const hasList = u.searchParams.has('list');
        const hasVideo = u.searchParams.has('v') || urlRef.current.includes('youtu.be/') || urlRef.current.includes('/shorts/');
        if (hasList && !hasVideo) {
          setIsPlaylistMode(true);
        }
      } catch (e) {}

      return;
    }

    try {
      const u = new URL(urlRef.current);
      const hasList = u.searchParams.has('list');
      const hasVideo = u.searchParams.has('v') || urlRef.current.includes('youtu.be/') || urlRef.current.includes('/shorts/');

      if (hasList && hasVideo) {
        setHybridPromptUrl(urlRef.current);
        return;
      } else if (hasList && !hasVideo) {
        runPlaylistFetch();
        return;
      }
    } catch (e) {}

    runFetch();
  };

  const handleHybridChoice = (choice) => {
    setHybridPromptUrl(null);
    if (choice === 'playlist') {
      runPlaylistFetch();
    } else {
      runFetch();
    }
  };

  const runPlaylistFetch = useCallback(async () => {
    const currentUrl = urlRef.current;
    if (!currentUrl) return;
    setIsLoading(true);
    setFetchError(null);
    setIsAgeRestricted(false);
    setIsPlaylistMode(true);
    setBoundJobId(null);
    const currentFetchId = ++fetchIdRef.current;

    try {
      const result = await window.electronAPI.getPlaylistInfo(currentUrl);
      if (currentFetchId !== fetchIdRef.current) return;
      if (result.success) {
        setPlaylistDetails({ ...result, sourceUrl: currentUrl });
      } else {
        console.error(`Error: ${result.error}`);
        setPlaylistDetails(null);
        if (result.isAgeRestricted) {
          setIsAgeRestricted(true);
          setIsAuthenticated(false);
        }
        setFetchError(result.error);
      }
    } catch (error) {
      if (currentFetchId !== fetchIdRef.current) return;
      console.error("Failed to fetch playlist details:", error);
      setPlaylistDetails(null);
      setFetchError(error.message || 'Something went wrong');
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // When yt-dlp finishes and there's a pending fetch queued, auto-trigger it
  const pendingFetchRef = useRef(pendingFetch);
  pendingFetchRef.current = pendingFetch;

  useEffect(() => {
    const done = !ytDlpStatus || ytDlpStatus === 'updated' || ytDlpStatus === 'up-to-date' || ytDlpStatus === 'error';
    if (!done) return;
    if (!pendingFetchRef.current) return;
    const timer = setTimeout(() => {
      setPendingFetch(false);
      try {
        const u = new URL(urlRef.current);
        const hasList = u.searchParams.has('list');
        const hasVideo = u.searchParams.has('v') || urlRef.current.includes('youtu.be/') || urlRef.current.includes('/shorts/');

        if (hasList && hasVideo) {
          setIsLoading(false);
          setHybridPromptUrl(urlRef.current);
        } else if (hasList && !hasVideo) {
          runPlaylistFetch();
        } else {
          runFetch();
        }
      } catch (e) {
        runFetch();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [ytDlpStatus, runFetch, runPlaylistFetch]);

  const goBackToHistory = () => {
    setUrl("");
    setVideoDetails(null);
    setPlaylistDetails(null);
    setIsPlaylistMode(false);
    setHybridPromptUrl(null);
    setFetchError(null);
    setIsAgeRestricted(false);
    setPendingFetch(false);
    setIsLoading(false);
    setBoundJobId(null);
    window.electronAPI.cancelPlaylistPrefetch();
  };

  const cancelFetchDetails = () => {
    fetchIdRef.current++;
    window.electronAPI.cancelInfoFetch();
    goBackToHistory();
  };

  const handleUrlChange = (newUrl) => {
    setUrl(newUrl);
    if (!newUrl.trim()) {
      setVideoDetails(null);
      setPlaylistDetails(null);
      setIsPlaylistMode(false);
      setHybridPromptUrl(null);
      setFetchError(null);
      setIsAgeRestricted(false);
      setBoundJobId(null);
    }
  };

  const refreshHistory = async () => {
    const data = await window.electronAPI.getHistory();
    setHistory(data);
  };

  /**
   * Open the view for an in-flight job — restores the exact Details/Playlist
   * view the download was started from.
   */
  const viewJob = (job) => {
    setFetchError(null);
    setHybridPromptUrl(null);
    setIsAgeRestricted(false);
    setIsLoading(false);
    if (job.kind === 'video') {
      setPlaylistDetails(null);
      setIsPlaylistMode(false);
      setVideoDetails(job.meta || {
        videoId: job.videoId,
        title: job.title,
        thumbnailUrl: job.thumbnailUrl,
        description: '',
        formats: [],
      });
    } else {
      setVideoDetails(null);
      setPlaylistDetails({
        title: job.title,
        uploader: job.uploader,
        videos: (job.items || []).map(it => ({
          id: it.id,
          url: it.url,
          title: it.title,
          duration: it.duration,
          thumbnail: it.thumbnail,
          uploader: job.uploader,
        })),
      });
      setIsPlaylistMode(true);
    }
    setBoundJobId(job.id);
  };

  const activeJobs = useMemo(() => jobs.filter(j => j.status === 'queued' || j.status === 'downloading'), [jobs]);
  const isDownloading = activeJobs.some(j => j.status === 'downloading');

  const value = {
    url,
    urlInputRef,
    videoDetails,
    playlistDetails,
    isPlaylistMode,
    hybridPromptUrl,
    history,
    isLoading,
    fetchError,
    ytDlpStatus,
    pendingFetch,
    isYtDlpBusy,
    isAuthenticated,
    authExpired,
    isAgeRestricted,
    // queue
    jobs,
    activeJobs,
    isDownloading,
    jobProgress,
    jobResults,
    boundJobId,
    setBoundJobId,
    viewJob,
    // settings
    isSettingsOpen,
    settingsTab,
    openSettings,
    closeSettings,
    // versions
    appVersion,
    latestVersion,
    hasNewVersion,
    versionChecked,
    // actions
    setUrl,
    setVideoDetails,
    setPlaylistDetails,
    setHistory,
    setIsLoading,
    handleUrlChange,
    handleFetchDetails,
    handleHybridChoice,
    cancelFetchDetails,
    goBackToHistory,
    refreshHistory,
    loginYoutube,
    logoutYoutube,
    refreshAuth,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
