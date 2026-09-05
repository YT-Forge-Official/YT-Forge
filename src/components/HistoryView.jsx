import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { formatBytes } from '../utils/formatBytes';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { shouldIgnoreShortcut } from '../hooks/useGlobalShortcuts';
import {
  Trash2, FolderOpen, X, Settings, ExternalLink, CheckCircle2,
  ArrowUpCircle, Loader2, LogOut, ListVideo, ArrowLeft, Clock,
  ArrowRight, Pause, Play, AlertTriangle, FileVideo,
  ChevronLeft, ChevronRight, Sun, Moon, Github, Coffee, Info,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Logo } from '@/components/ui/logo';
import { useTheme } from '../contexts/ThemeContext';
import { LANDING_URL, KOFI_URL, GITHUB_URL, RELEASES_URL } from '@/lib/links';

// History entries shown per page. In-progress downloads live in their own
// section and never count towards this — a playlist is a single entry.
const HISTORY_PAGE_SIZE = 15;

/**
 * Page numbers to render, collapsing long runs into an ellipsis so the control
 * never outgrows its row: 1 … prev current next … last
 */
const buildPageList = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const wanted = [1, total, current, current - 1, current + 1]
    .filter(p => p >= 1 && p <= total)
    .sort((a, b) => a - b);

  const out = [];
  let prev = 0;
  for (const p of wanted) {
    if (p === prev) continue;
    if (prev && p - prev > 1) out.push(`gap-${prev}`);
    out.push(p);
    prev = p;
  }
  return out;
};


const thumbFallback = (e) => {
  if (e.target.src.includes('maxresdefault')) {
    e.target.src = e.target.src.replace(/maxresdefault\.(jpg|webp)/, 'hqdefault.jpg');
  } else if (e.target.src.includes('sd2.jpg') || e.target.src.includes('sddefault.jpg')) {
    e.target.src = e.target.src.replace(/sd2\.jpg|sddefault\.jpg/, 'hqdefault.jpg');
  } else {
    e.target.style.opacity = 0;
  }
};

const formatDuration = (seconds) => {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const canPause = window.electronAPI.platform !== 'win32';

// ─── Active download card ─────────────────────────────────────────────────────
const ActiveDownloadCard = ({ job }) => {
  const { jobProgress, viewJob } = useAppContext();
  const progress = jobProgress[job.id] || {};
  const isDownloading = job.status === 'downloading';
  const isPaused = !!progress.paused;
  const percent = progress.percent || 0;
  const speed = progress.speed || 0;
  const stage = progress.stage || 'starting';

  const isPlaylist = job.kind === 'playlist';
  const items = job.items || [];
  const doneCount = items.filter(it => ['completed', 'error', 'skipped', 'cancelled'].includes(it.status)).length;
  const overallPercent = isPlaylist && items.length > 0
    ? Math.min(100, ((doneCount + (isDownloading ? percent / 100 : 0)) / items.length) * 100)
    : percent;

  const statusLine = useMemo(() => {
    if (job.status === 'queued') {
      const parts = ['Queued'];
      if (isPlaylist) parts.push(`${items.length} videos`);
      if (job.sizeBytes > 0) parts.push(`~${formatBytes(job.sizeBytes)}`);
      return parts.join(' • ');
    }
    if (isPaused) {
      return progress.pauseReason === 'network' ? 'Waiting for connection…' : 'Paused';
    }
    if (isPlaylist) {
      const parts = [`Video ${Math.min(doneCount + 1, items.length)} of ${items.length}`];
      if (speed > 0 && stage !== 'converting') parts.push(`${formatBytes(speed)}/s`);
      return parts.join(' • ');
    }
    if (stage === 'converting') return `Converting to H.264 • ${percent.toFixed(0)}%`;
    if (stage === 'merging' || stage === 'processing') return 'Processing…';
    const parts = [`${percent.toFixed(0)}%`];
    if (speed > 0) parts.push(`${formatBytes(speed)}/s`);
    return parts.join(' • ');
  }, [job.status, isPaused, isPlaylist, doneCount, items.length, percent, speed, stage, progress.pauseReason, job.sizeBytes]);

  return (
    <div
      className="group flex items-center gap-4 rounded-xl border border-border/40 bg-secondary/15 p-3 hover:bg-secondary/30 hover:border-border/60 transition-all cursor-pointer min-w-0"
      onClick={() => viewJob(job)}
    >
      {/* Thumbnail */}
      <div className="relative shrink-0 w-24 aspect-video rounded-lg overflow-hidden bg-secondary/30 border border-border/30">
        <img src={job.thumbnailUrl} className="w-full h-full object-cover" alt="" onError={thumbFallback} />
        {/* Square corners on purpose: the parent's overflow-hidden clips this to
            the exact inner curve. Giving it its own radius makes it miss by the
            border width and leaks the thumbnail at the corners. */}
        {isPlaylist && (
          <div className="absolute right-0 inset-y-0 w-[34%] bg-black/75 flex flex-col items-center justify-center gap-0.5">
            <ListVideo className="h-3.5 w-3.5 text-white/90" />
            <span className="text-[9px] font-bold text-white/90 leading-none">{items.length}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col min-w-0 flex-1 gap-1.5">
        <span className="text-sm font-medium text-foreground/90 truncate leading-tight" title={job.title}>
          {job.title}
        </span>
        <div className="flex items-center gap-2 min-w-0">
          {job.status === 'queued' ? (
            <Clock className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          ) : isPaused ? (
            <Pause className="h-3 w-3 text-amber-600 dark:text-amber-400/80 shrink-0" />
          ) : (
            <Loader2 className="h-3 w-3 text-primary/70 shrink-0 animate-spin" />
          )}
          <span className={`text-[11px] truncate font-medium ${isPaused ? 'text-amber-600 dark:text-amber-400/90' : 'text-muted-foreground'}`}>
            {statusLine}
          </span>
        </div>
        {isDownloading && (
          <Progress
            value={overallPercent}
            indeterminate={overallPercent <= 0 && !isPaused}
            paused={isPaused}
            className="h-1"
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        {isDownloading && canPause && !(stage === 'merging' || stage === 'processing') && (
          isPaused && progress.pauseReason !== 'network' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/60 hover:text-foreground" onClick={() => window.electronAPI.resumeDownload()}>
                  <Play className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Resume</TooltipContent>
            </Tooltip>
          ) : !isPaused ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/60 hover:text-foreground" onClick={() => window.electronAPI.pauseDownload()}>
                  <Pause className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Pause</TooltipContent>
            </Tooltip>
          ) : null
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/60 hover:text-foreground" onClick={() => viewJob(job)}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Open</TooltipContent>
        </Tooltip>

        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/60 hover:text-destructive-foreground hover:bg-destructive/15">
                  <X className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Cancel</TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {job.status === 'queued' ? 'Remove from queue?' : isPlaylist ? 'Cancel playlist download?' : 'Cancel download?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {job.status === 'queued'
                  ? 'This download will be removed from the queue before it starts.'
                  : isPlaylist
                    ? 'The current video will be stopped and the rest of the playlist will be cancelled. Videos already completed will be kept.'
                    : 'The download will be stopped and the partial file will be deleted.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => window.electronAPI.cancelJob({ jobId: job.id })}
                className="bg-destructive text-white hover:bg-destructive/80"
              >
                {job.status === 'queued' ? 'Remove' : 'Cancel Download'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};


// ─── Playlist history detail view ─────────────────────────────────────────────
const PlaylistHistoryDetail = ({ playlist, onBack, onPlaylistUpdated }) => {
  const { history, setHistory } = useAppContext();
  const [fileStatus, setFileStatus] = useState({}); // videoId/index -> bool

  const videos = playlist.downloadedVideos || [];

  // Check which files still exist on disk (drives the folder icon behavior)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const entries = await Promise.all(
        videos.map(async (v, i) => {
          const exists = v.filePath ? await window.electronAPI.fileExists(v.filePath) : false;
          return [v.id || i, exists];
        })
      );
      if (mounted) setFileStatus(Object.fromEntries(entries));
    })();
    return () => { mounted = false; };
  }, [playlist.timestamp, videos.length]);

  // Escape backs out to the history list. The global handler can't do this one:
  // from its side we're still on the history screen, with nothing to leave.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || shouldIgnoreShortcut(e)) return;
      if (/^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '')) return;
      e.preventDefault();
      onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const handleRemoveVideo = async (index) => {
    const updatedItem = {
      ...playlist,
      downloadedVideos: videos.filter((_, i) => i !== index),
    };

    if (updatedItem.downloadedVideos.length === 0) {
      // Last video removed — drop the whole playlist entry
      const updated = await window.electronAPI.deleteHistoryItem(playlist.timestamp);
      setHistory(updated);
      onBack();
      return;
    }

    const updated = await window.electronAPI.updateHistoryItem(updatedItem);
    setHistory(updated);
    onPlaylistUpdated(updatedItem);
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="flex-none border-b border-border/40 pb-4 mb-1">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack} className="shrink-0 mt-0.5 h-8 w-8 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2
              className={`text-lg font-semibold truncate tracking-tight text-foreground${playlist.url ? ' cursor-pointer hover:underline' : ''}`}
              onClick={playlist.url ? () => window.electronAPI.openExternalLink(playlist.url) : undefined}
              title={playlist.title}
            >
              {playlist.title}
            </h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground min-w-0">
              <span className="inline-flex items-center gap-1 font-medium text-muted-foreground shrink-0">
                <ListVideo className="h-3 w-3" />
                {videos.length} {videos.length === 1 ? 'video' : 'videos'}
              </span>
              <span className="text-border shrink-0">•</span>
              <span className="shrink-0">{playlist.format}</span>
              <span className="text-border shrink-0">•</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="truncate hover:text-foreground hover:underline cursor-pointer transition-colors"
                    onClick={() => window.electronAPI.openFileOrFolder({ filePath: null, fallbackDir: playlist.path })}
                  >
                    {playlist.path}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Open folder</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.electronAPI.openFileOrFolder({ filePath: null, fallbackDir: playlist.path })}
            className="shrink-0 gap-2 h-8 text-xs"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Open Folder
          </Button>
        </div>
      </div>

      {/* Video list */}
      <ScrollArea className="flex-1 -mx-2 px-2">
        <div className="flex flex-col gap-2 py-3 pb-6">
          {videos.map((v, i) => {
            const exists = fileStatus[v.id || i];
            return (
              <div key={`${v.id || i}-${playlist.timestamp}`} className="group flex items-center gap-3.5 p-2.5 rounded-xl border border-border/30 bg-secondary/10 hover:bg-secondary/25 hover:border-border/50 transition-all min-w-0">
                {/* Thumbnail */}
                <div className="relative w-24 aspect-video rounded-lg overflow-hidden shrink-0 bg-secondary/30 border border-border/30">
                  <img
                    src={v.thumbnailUrl || ''}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={thumbFallback}
                  />
                  {v.duration ? (
                    <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm font-semibold">
                      {formatDuration(v.duration)}
                    </div>
                  ) : null}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1 flex flex-col gap-1 justify-center">
                  <p
                    className="text-[13px] font-medium text-foreground truncate cursor-pointer hover:text-primary transition-colors leading-snug"
                    onClick={() => window.electronAPI.openExternalLink(v.url)}
                    title={v.title}
                  >
                    {v.title}
                  </p>
                  <div className="flex items-center gap-1.5 min-w-0">
                    {v.format && (
                      <>
                        <span className="text-[11px] text-muted-soft font-medium shrink-0">{v.format}</span>
                        <span className="text-border text-[11px] shrink-0">•</span>
                      </>
                    )}
                    {exists === false && v.filePath ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-500/70 font-medium shrink-0">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        File moved or deleted
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-soft truncate">{v.url}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground/50 hover:text-foreground"
                        onClick={() => window.electronAPI.openFileOrFolder({ filePath: v.filePath, fallbackDir: playlist.path })}
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {exists ? 'Show file in folder' : 'Open playlist folder'}
                    </TooltipContent>
                  </Tooltip>

                  <AlertDialog>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50 hover:text-foreground">
                            <X className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Remove</TooltipContent>
                    </Tooltip>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove video from history?</AlertDialogTitle>
                        <AlertDialogDescription>
                          "{v.title}" will be removed from this playlist's history. The downloaded file on disk won't be touched.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleRemoveVideo(i)} className="bg-destructive text-white hover:bg-destructive/80">
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

// ─── History pagination ───────────────────────────────────────────────────────
const HistoryPagination = ({ page, totalPages, total, onChange }) => {
  const from = (page - 1) * HISTORY_PAGE_SIZE + 1;
  const to = Math.min(page * HISTORY_PAGE_SIZE, total);

  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  const arrowClass = (disabled) =>
    `flex items-center justify-center h-7 w-7 rounded-md border border-border/40 transition-colors ${
      disabled
        ? 'text-muted-foreground/25 bg-transparent cursor-default'
        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 hover:border-border/70 cursor-pointer'
    }`;

  return (
    <div className="flex-none flex items-center justify-between gap-3 pt-3 mt-1 border-t border-border/30">
      <span className="text-[11px] text-muted-soft tabular-nums">
        {from}–{to} of {total}
      </span>

      <div className="flex items-center gap-1">
        <button
          className={arrowClass(atStart)}
          onClick={() => !atStart && onChange(page - 1)}
          disabled={atStart}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {buildPageList(page, totalPages).map((p) =>
          typeof p === 'number' ? (
            <button
              key={p}
              onClick={() => p !== page && onChange(p)}
              className={`h-7 min-w-7 px-1.5 rounded-md text-[11px] font-medium tabular-nums transition-colors ${
                p === page
                  ? 'bg-secondary/70 text-foreground border border-border/60 cursor-default'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40 border border-transparent cursor-pointer'
              }`}
            >
              {p}
            </button>
          ) : (
            <span key={p} className="h-7 w-5 flex items-end justify-center pb-1.5 text-[11px] text-muted-soft select-none">
              …
            </span>
          )
        )}

        <button
          className={arrowClass(atEnd)}
          onClick={() => !atEnd && onChange(page + 1)}
          disabled={atEnd}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

// ─── Main history view ────────────────────────────────────────────────────────
const HistoryView = () => {
  const { history, setHistory, activeJobs, openSettings, hasNewVersion } = useAppContext();
  const [selectedPlaylistHistory, setSelectedPlaylistHistory] = useState(null);
  const [page, setPage] = useState(1);
  const scrollRef = useRef(null);

  // Pagination covers history entries only — active jobs sit in their own
  // section above and never shift the page boundaries.
  const totalPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));

  // Clearing or deleting entries can leave the current page out of range
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(
    () => history.slice((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE),
    [history, page]
  );

  const goToPage = (next) => {
    setPage(next);
    scrollRef.current?.scrollTo({ top: 0 });
  };



  const handleClearHistory = async () => {
    await window.electronAPI.clearHistory();
    setHistory([]);
  };

  const handleDeleteItem = async (timestamp) => {
    const updated = await window.electronAPI.deleteHistoryItem(timestamp);
    setHistory(updated);
  };

  if (selectedPlaylistHistory) {
    return (
      <PlaylistHistoryDetail
        playlist={selectedPlaylistHistory}
        onBack={() => setSelectedPlaylistHistory(null)}
        onPlaylistUpdated={setSelectedPlaylistHistory}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Downloads
        </h2>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="kofi-affordance text-muted-foreground gap-1.5 h-7 text-xs"
                onClick={() => window.electronAPI.openExternalLink(KOFI_URL)}
              >
                <Coffee className="h-3 w-3" />
                Buy me a coffee
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Enjoying YT-Forge? Treat the developer to a coffee! ❤️
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openSettings('general')}
                className="relative text-muted-foreground hover:text-foreground gap-1.5 h-7 text-xs"
              >
                <Settings className="h-3 w-3" />
                Settings
                {hasNewVersion && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            {hasNewVersion && (
              <TooltipContent side="bottom" className="text-xs">
                Newer version available
              </TooltipContent>
            )}
          </Tooltip>

          {history.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1.5 h-7 text-xs">
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear download history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove all download history entries. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearHistory} className="bg-destructive text-white hover:bg-destructive/80">
                    Clear History
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        {/* ── Active downloads ── */}
        {activeJobs.length > 0 && (
          <div className="flex flex-col gap-2 mb-5 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 px-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-soft">In Progress</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="You can queue multiple downloads"
                    className="text-muted-soft/70 hover:text-muted-soft transition-colors focus:outline-none"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">You can queue multiple downloads</TooltipContent>
              </Tooltip>
              <div className="flex-1 h-px bg-border/40" />
            </div>
            {activeJobs.map((job) => (
              <ActiveDownloadCard key={job.id} job={job} />
            ))}

            {history.length > 0 && (
              <div className="flex items-center gap-2 px-0.5 mt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-soft">History</span>
                <div className="flex-1 h-px bg-border/40" />
              </div>
            )}
          </div>
        )}

        {/* ── History list ── */}
        <div key={page} className="flex flex-col gap-2.5 animate-in fade-in duration-200">
          {history.length > 0 ? (
            pageItems.map((item, index) => (
              <div
                key={`${item.timestamp}-${index}`}
                className="group flex items-center gap-4 rounded-lg p-3 hover:bg-secondary/40 transition-colors min-w-0"
              >
                {/* Thumbnail */}
                <div
                  className={`relative shrink-0 w-24 aspect-video rounded-md overflow-hidden bg-secondary/30 ${item.type === 'playlist' ? 'cursor-pointer' : ''}`}
                  onClick={() => item.type === 'playlist' && setSelectedPlaylistHistory(item)}
                >
                  <img
                    src={item.thumbnailUrl}
                    className="w-full h-full object-cover"
                    alt=""
                    onError={thumbFallback}
                  />
                  {item.type === 'playlist' && (
                    <div className="absolute right-0 inset-y-0 w-[34%] bg-black/75 flex flex-col items-center justify-center gap-0.5 transition-colors group-hover:bg-black/85">
                      <ListVideo className="h-3.5 w-3.5 text-white/90" />
                      <span className="text-[10px] font-bold text-white/90 leading-none tabular-nums">
                        {item.downloadedVideos?.length}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-col min-w-0 flex-1 gap-1">
                  <span
                    className="hover:underline text-sm font-medium text-foreground/90 truncate block text-left hover:text-foreground transition-colors cursor-pointer leading-tight"
                    onClick={() => {
                      if (item.type === 'playlist') {
                        setSelectedPlaylistHistory(item);
                      } else {
                        window.electronAPI.openExternalLink(item.url);
                      }
                    }}
                    title={item.title}
                  >
                    {item.title}
                  </span>
                  <span className="text-xs text-muted-soft font-medium">
                    {item.type === 'playlist'
                      ? `Playlist • ${item.downloadedVideos?.length} videos • ${item.format}`
                      : item.format}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {item.type === 'playlist' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground/50 hover:text-foreground"
                          onClick={() => setSelectedPlaylistHistory(item)}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">View videos</TooltipContent>
                    </Tooltip>
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground/50 hover:text-foreground"
                        onClick={() => {
                          if (item.type === 'playlist') {
                            window.electronAPI.openFileOrFolder({ filePath: null, fallbackDir: item.path });
                          } else {
                            window.electronAPI.openFileLocation(item.path);
                          }
                        }}
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {item.type === 'playlist' ? 'Open playlist folder' : 'Show in folder'}
                    </TooltipContent>
                  </Tooltip>

                  <AlertDialog>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground/50 hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Remove
                      </TooltipContent>
                    </Tooltip>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove from history?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {item.type === 'playlist'
                            ? 'This playlist and all its entries will be removed from the download history. Files on disk won\'t be touched.'
                            : 'This item will be deleted from the download history. This action cannot be undone.'}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteItem(item.timestamp)} className="bg-destructive text-white hover:bg-destructive/80">
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))
          ) : activeJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-1.5">
              <p className="text-sm">Your download history will appear here.</p>
              <p className="text-xs text-muted-soft">Paste a YouTube link above to get started.</p>
            </div>
          ) : null}
        </div>
      </div>

      {history.length > 0 && (
        <HistoryPagination
          page={page}
          totalPages={totalPages}
          total={history.length}
          onChange={goToPage}
        />
      )}
    </div>
  );
};

export default HistoryView;
