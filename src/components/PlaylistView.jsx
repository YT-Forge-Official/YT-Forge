import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { formatBytes } from '../utils/formatBytes';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
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
import {
  ArrowLeft, Download, FolderOpen, CheckCircle2, AlertCircle,
  Play, Pause, X, Clock, HardDrive, SkipForward, ListVideo, Info, ImageDown,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Kbd } from '@/components/ui/kbd';

const formatTime = (totalSeconds) => {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formatDuration = (seconds) => {
  if (!seconds) return 'Live';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
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

const canPause = window.electronAPI.platform !== 'win32';

/** Deduplicate formats by itag (yt-dlp height) — the download format arg only
 *  cares about height, so keep the best (highest-fps) entry per height. */
const dedupeFormats = (formats) => {
  const seen = new Set();
  const out = [];
  for (const f of formats || []) {
    if (f.itag === 'best' || seen.has(f.itag)) continue;
    seen.add(f.itag);
    out.push(f);
  }
  return out;
};

// Estimated size multiplier for the offline VP9/AV1 → H.264 conversion
const H264_SIZE_FACTOR = 1.9;

const PlaylistView = () => {
  const {
    playlistDetails,
    goBackToHistory,
    jobs,
    activeJobs,
    jobProgress,
    jobResults,
    boundJobId,
    setBoundJobId,
  } = useAppContext();

  if (!playlistDetails) return null;

  const boundJob = useMemo(
    () => (boundJobId ? jobs.find(j => j.id === boundJobId && j.kind === 'playlist') : null),
    [jobs, boundJobId]
  );
  const boundResult = boundJobId ? jobResults[boundJobId] : null;
  const inProgressMode = !!boundJob || !!boundResult;

  // ── Selection state ────────────────────────────────────────────────────────
  const [selectedVideos, setSelectedVideos] = useState(new Set(playlistDetails.videos.map(v => v.id)));
  const [globalQuality, setGlobalQuality] = useState('best');
  const [globalH264, setGlobalH264] = useState(false);
  // Overwrite is off by default — existing files get a " (n)" suffix instead
  const [allowDuplicates, setAllowDuplicates] = useState(true);
  const [videoFormats, setVideoFormats] = useState({});     // id -> { isLoading, formats, audioSize }
  const [videoQualities, setVideoQualities] = useState({}); // id -> explicit user choice
  const [videoH264, setVideoH264] = useState({});           // id -> bool (individual override)

  // ── Parallel background format prefetch ───────────────────────────────────
  useEffect(() => {
    if (inProgressMode) return;
    if (!playlistDetails?.videos?.length) return;

    setVideoFormats(prev => {
      const next = { ...prev };
      for (const v of playlistDetails.videos) {
        if (!next[v.id]) next[v.id] = { isLoading: true, formats: [], audioSize: 0 };
      }
      return next;
    });

    window.electronAPI.onPlaylistFormatResult((res) => {
      setVideoFormats(prev => ({
        ...prev,
        [res.id]: {
          isLoading: false,
          formats: res.success ? dedupeFormats(res.formats) : [],
          audioSize: res.audioSize || 0,
        },
      }));
    });

    window.electronAPI.prefetchPlaylistFormats(
      playlistDetails.videos.map(v => ({ id: v.id, url: v.url }))
    );

    return () => {
      window.electronAPI.cancelPlaylistPrefetch();
    };
  }, [playlistDetails, inProgressMode]);

  // ── Quality & size resolution helpers ─────────────────────────────────────
  const resolveQuality = useCallback((videoId) => {
    const explicit = videoQualities[videoId];
    if (explicit) return explicit;
    if (globalQuality === 'audio') return 'audio';
    const fmts = videoFormats[videoId]?.formats;
    if (globalQuality === 'best' || globalQuality === 'custom' || !fmts?.length) return 'best';
    const cap = parseInt(globalQuality);
    const match = fmts.find(f => f.height <= cap); // fmts sorted best-first
    // Nothing at or below the cap (e.g. capping at 360p on a video that only
    // offers 720p+). Fall back to the SMALLEST format available, not "best" —
    // asking for a low cap should never hand back the largest file.
    return String((match || fmts[fmts.length - 1]).itag);
  }, [videoQualities, globalQuality, videoFormats]);

  const resolveFormat = useCallback((videoId) => {
    const q = resolveQuality(videoId);
    if (q === 'audio') return null;
    const fmts = videoFormats[videoId]?.formats;
    if (!fmts?.length) return null;
    if (q === 'best') return fmts[0];
    return fmts.find(f => String(f.itag) === q) || null;
  }, [resolveQuality, videoFormats]);

  // Whether H.264 conversion will actually run for this video
  const effectiveConvert = useCallback((videoId) => {
    const q = resolveQuality(videoId);
    if (q === 'audio') return false;
    const fmt = resolveFormat(videoId);
    if (!fmt || fmt.isH264) return false;
    return globalH264 || !!videoH264[videoId];
  }, [resolveQuality, resolveFormat, globalH264, videoH264]);

  // Estimated on-disk size, accounting for the conversion multiplier
  const itemSizeBytes = useCallback((videoId) => {
    const entry = videoFormats[videoId];
    const q = resolveQuality(videoId);
    if (q === 'audio') return entry?.audioSize || 0;
    const fmt = resolveFormat(videoId);
    if (!fmt || !(fmt.size > 0)) return 0;
    const base = fmt.size + (entry?.audioSize || 0);
    return effectiveConvert(videoId) ? Math.round(base * H264_SIZE_FACTOR) : base;
  }, [videoFormats, resolveQuality, resolveFormat, effectiveConvert]);

  const handleGlobalQualityChange = (val) => {
    if (val === 'custom') return; // display-only
    setGlobalQuality(val);
    setVideoQualities({});
    setVideoH264({});
  };

  const handleIndividualQualityChange = (id, val) => {
    setVideoQualities(prev => ({ ...prev, [id]: val }));
    if (globalQuality !== 'custom') setGlobalQuality('custom');
  };

  const toggleVideo = (id) => {
    const next = new Set(selectedVideos);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedVideos(next);
  };

  const handleSelectAll = () => setSelectedVideos(new Set(playlistDetails.videos.map(v => v.id)));
  const handleSelectNone = () => setSelectedVideos(new Set());

  // Total estimated size across selected videos (where known)
  const totalEstimate = useMemo(() => {
    let bytes = 0;
    let unknown = 0;
    for (const v of playlistDetails.videos) {
      if (!selectedVideos.has(v.id)) continue;
      const size = itemSizeBytes(v.id);
      if (size > 0) bytes += size; else unknown++;
    }
    return { bytes, unknown };
  }, [playlistDetails.videos, selectedVideos, itemSizeBytes]);

  const startBatchDownload = async () => {
    if (selectedVideos.size === 0) return;

    // Ask for the destination when the user commits — same as single videos
    const targetDir = await window.electronAPI.chooseDirectory();
    if (!targetDir) return;

    const items = playlistDetails.videos
      .filter(v => selectedVideos.has(v.id))
      .map(v => {
        const q = resolveQuality(v.id);
        const fmt = resolveFormat(v.id);
        const isAudio = q === 'audio';
        return {
          id: v.id,
          url: v.url,
          title: v.title,
          thumbnail: v.thumbnail,
          duration: v.duration,
          type: isAudio ? 'mp3' : 'mp4',
          // "best" must resolve to the video's actual top height — passing the
          // literal string made yt-dlp's fallback chain pick 1080p H.264 even
          // for 4K videos.
          quality: isAudio ? 'best' : (q === 'best' && fmt ? String(fmt.itag) : q),
          qualityLabel: isAudio ? 'MP3' : (fmt?.quality || 'Best'),
          convertToH264: effectiveConvert(v.id),
          sizeBytes: itemSizeBytes(v.id),
        };
      });

    const formatLabel =
      globalQuality === 'audio' ? 'AUDIO (MP3)'
        : globalQuality === 'best' ? 'Best (MP4)'
        : globalQuality === 'custom' ? 'Custom (MP4)'
        : `Up to ${globalQuality}p (MP4)`;

    const res = await window.electronAPI.queuePlaylist({
      title: playlistDetails.title,
      uploader: playlistDetails.uploader,
      url: playlistDetails.sourceUrl || '',
      targetDir,
      allowDuplicates,
      formatLabel,
      thumbnailUrl: items[0]?.thumbnail || '',
      items,
    });
    if (res.success) {
      setBoundJobId(res.jobId);
    } else {
      console.error('Failed to queue playlist:', res.error);
    }
  };

  // ── Progress-mode derived values ───────────────────────────────────────────
  // Keep a snapshot of items so the list stays visible after the job finishes
  // (finished jobs leave the main-process queue)
  const [itemsSnapshot, setItemsSnapshot] = useState([]);
  useEffect(() => {
    if (boundJob?.items?.length) setItemsSnapshot(boundJob.items);
  }, [boundJob]);

  const progress = (boundJobId && jobProgress[boundJobId]) || {};
  const items = boundJob?.items || itemsSnapshot;
  const completedCount = items.filter(it => it.status === 'completed').length;
  const doneCount = items.filter(it => ['completed', 'error', 'skipped', 'cancelled'].includes(it.status)).length;
  const currentItem = boundJob?.status === 'downloading' ? items.find(it => it.status === 'downloading') : null;
  const isQueuedJob = boundJob?.status === 'queued';
  const queuePosition = isQueuedJob ? activeJobs.findIndex(j => j.id === boundJobId) + 1 : 0;
  const overallPercent = items.length > 0
    ? Math.min(100, ((doneCount + (currentItem ? (progress.percent || 0) / 100 : 0)) / items.length) * 100)
    : 0;
  const isPaused = !!progress.paused;
  const pauseReason = progress.pauseReason || null;
  const stage = progress.stage || 'starting';

  const progressText = useMemo(() => {
    const { percent = 0, downloadedBytes = 0, totalBytes = 0 } = progress;
    if (stage === 'merging' || stage === 'processing') return 'Merging audio & video…';
    if (stage === 'converting') return `Converting — ${(percent || 0).toFixed(0)}%`;
    if (totalBytes > 0) return `${percent.toFixed(1)}% — ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`;
    if (percent > 0) return `${percent.toFixed(1)}%`;
    return 'Starting…';
  }, [progress, stage]);

  // ══════════════════════════════════════════════════════════════════════════
  // PROGRESS MODE — bound to an in-flight (or finished) playlist job
  // ══════════════════════════════════════════════════════════════════════════
  if (inProgressMode) {
    const finished = !boundJob && boundResult;

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex-none border-b border-border/40 pb-4 space-y-3.5">
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={goBackToHistory} className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex items-center gap-1.5 text-xs">
                Back<Kbd>esc</Kbd>
              </TooltipContent>
            </Tooltip>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate tracking-tight text-foreground leading-tight">{boundJob?.title || playlistDetails.title}</h2>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {finished
                  ? `${boundResult.completedCount ?? completedCount} of ${items.length || (boundResult.completedCount ?? 0)} videos downloaded`
                  : isQueuedJob
                    ? `${items.length} videos • waiting in queue`
                    : `${completedCount} of ${items.length} videos completed`}
              </p>
            </div>

            {!finished && (
              <div className="flex items-center gap-1.5 shrink-0">
                {!isQueuedJob && canPause && (
                  isPaused && pauseReason !== 'network' ? (
                    <Button variant="secondary" size="sm" className="h-8 text-xs gap-1.5 px-3" onClick={() => window.electronAPI.resumeDownload()}>
                      <Play className="h-3.5 w-3.5" /> Resume
                    </Button>
                  ) : !isPaused ? (
                    <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 px-3 text-muted-foreground hover:text-foreground" onClick={() => window.electronAPI.pauseDownload()} disabled={stage === 'merging' || stage === 'processing'}>
                      <Pause className="h-3.5 w-3.5" /> Pause
                    </Button>
                  ) : null
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="h-8 text-xs font-medium px-3 gap-1.5">
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel playlist download?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The current video will be stopped and the rest of the playlist will be cancelled. Videos already completed will be kept.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep downloading</AlertDialogCancel>
                      <AlertDialogAction onClick={() => window.electronAPI.cancelJob({ jobId: boundJobId })} className="bg-destructive text-white hover:bg-destructive/90">
                        Cancel Download
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>

          {/* Overall progress / status banner */}
          {finished ? (
            (() => {
              const nDone = boundResult.completedCount ?? completedCount;
              const wasCancelled = !!boundResult.cancelled;
              const ok = boundResult.success || nDone > 0;
              return (
                <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border/40 bg-secondary/20'}`}>
                  {ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className={`text-[13px] flex-1 ${ok ? 'text-emerald-700 dark:text-emerald-300/90' : 'text-muted-foreground'}`}>
                    {wasCancelled
                      ? nDone > 0
                        ? `Cancelled — ${nDone} completed ${nDone === 1 ? 'video was' : 'videos were'} kept`
                        : 'Download cancelled'
                      : ok
                        ? 'Playlist download complete'
                        : 'Download failed — no videos were saved'}
                  </span>
                  {ok && boundResult.path && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300"
                      onClick={() => window.electronAPI.openFileOrFolder({ filePath: null, fallbackDir: boundResult.path })}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Open Folder
                    </Button>
                  )}
                </div>
              );
            })()
          ) : isQueuedJob ? (
            <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-secondary/20 px-4 py-3">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-[13px] text-foreground/80 flex-1">
                In queue {queuePosition > 1 ? `— position ${queuePosition}` : '— starting soon…'}
              </span>
              {boundJob?.sizeBytes > 0 && (
                <span className="text-[11px] font-mono text-muted-foreground">{formatBytes(boundJob.sizeBytes)}</span>
              )}
            </div>
          ) : (
            <div className={`rounded-xl border px-4 py-3 ${isPaused ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/30 bg-secondary/20'}`}>
              <div className="flex justify-between items-center gap-3 mb-2 min-w-0">
                <span className={`text-xs font-medium whitespace-nowrap ${isPaused ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                  {isPaused
                    ? (pauseReason === 'network' ? 'Waiting for connection…' : 'Paused')
                    : `Downloading ${Math.min(doneCount + 1, items.length)} of ${items.length}`}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                  {Math.round(overallPercent)}%
                </span>
              </div>
              <Progress value={overallPercent} paused={isPaused} className="h-1.5" />
            </div>
          )}
        </div>

        {/* Items list */}
        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="flex flex-col gap-2.5 py-3.5 pb-6">
            {items.map((it) => {
              const isCurrent = currentItem?.id === it.id;
              const rowState = it.status;

              const thumbnail = (
                <div className="relative w-24 aspect-video rounded-lg overflow-hidden shrink-0 bg-secondary/30 border border-border/30 group">
                  <img src={it.thumbnail} alt="" className="w-full h-full object-cover" onError={thumbFallback} />
                  <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm font-semibold group-hover:opacity-0 transition-opacity">
                    {formatDuration(it.duration)}
                  </div>
                  {rowState === 'completed' && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:opacity-0 transition-opacity">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400 drop-shadow-md" />
                    </div>
                  )}
                  <button
                    className="absolute inset-0 m-auto flex items-center justify-center gap-1 rounded-md bg-black/60 backdrop-blur-sm px-2 py-1 text-[10px] text-white/80 hover:text-white hover:bg-black/80 transition-all opacity-0 group-hover:opacity-100 cursor-pointer border-none h-fit w-fit z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.electronAPI.downloadThumbnail({
                        url: it.thumbnail,
                        title: it.title,
                      });
                    }}
                    title="Download Thumbnail"
                  >
                    <ImageDown className="h-3 w-3" />
                  </button>
                </div>
              );

              const info = (
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                  <h3 className="font-medium text-[13px] truncate text-foreground leading-snug" title={it.title}>
                    {it.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="truncate">{it.qualityLabel}{it.convertToH264 ? ' → H.264' : ''}</span>
                    {it.sizeBytes > 0 && (
                      <>
                        <span className="text-border">·</span>
                        <span className="font-mono shrink-0 tabular-nums">{formatBytes(it.sizeBytes)}</span>
                      </>
                    )}
                  </div>
                </div>
              );

              // Active item — amber stays confined to the progress panel; the
              // card itself keeps its normal "this one is running" treatment
              if (isCurrent) {
                return (
                  <div key={it.id} className="flex flex-col gap-3 p-3 rounded-xl border bg-primary/[0.04] border-primary/40 transition-all duration-200">
                    {/* Row 1 — thumbnail, title, skip */}
                    <div className="flex items-center gap-3.5">
                      {thumbnail}
                      {info}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.electronAPI.skipPlaylistItem({ jobId: boundJobId })}
                        className="shrink-0 h-7 text-[11px] px-2.5 gap-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        Skip
                      </Button>
                    </div>

                    {/* Row 2 — live stats, same language as the single-video view */}
                    <div className="flex rounded-lg border border-border/30 bg-secondary/30 divide-x divide-border/30 overflow-hidden">
                      {[
                        {
                          label: 'Speed',
                          value: !isPaused && progress.speed > 0
                            ? (stage === 'converting' ? `${progress.speed.toFixed(2)}x` : `${formatBytes(progress.speed)}/s`)
                            : '--',
                        },
                        { label: 'Elapsed', value: formatTime(progress.elapsed) },
                        {
                          label: 'Time Left',
                          value: !isPaused && progress.speed > 0 && progress.eta > 0
                            ? formatTime(progress.eta)
                            : '--:--',
                        },
                      ].map(stat => (
                        <div key={stat.label} className="flex-1 px-2 py-1.5 flex flex-col items-center justify-center min-w-0">
                          <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">
                            {stat.label}
                          </span>
                          <span className="text-xs font-mono tabular-nums font-medium text-foreground">
                            {stat.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Row 3 — stage + progress bar */}
                    <div className={`rounded-lg border px-3 py-2.5 ${isPaused ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/30 bg-secondary/30'}`}>
                      <div className="flex justify-between items-center gap-3 mb-2 min-w-0">
                        <span className={`text-[11px] font-medium whitespace-nowrap ${isPaused ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                          {isPaused
                            ? (pauseReason === 'network' ? 'Waiting for connection…' : 'Paused')
                            : (stage === 'converting' ? 'Converting to H.264…' : stage === 'merging' ? 'Merging…' : 'Downloading…')}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums tracking-tight text-muted-foreground whitespace-nowrap truncate min-w-0">
                          {progressText}
                        </span>
                      </div>
                      <Progress
                        value={progress.percent || 0}
                        indeterminate={(progress.percent || 0) <= 0 && !isPaused}
                        paused={isPaused}
                        className="h-1"
                      />
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={it.id}
                  className={`flex items-center gap-3.5 p-3 rounded-xl border bg-secondary/10 border-border/30 transition-all duration-200
                    ${rowState === 'completed' ? 'opacity-60' : ''}
                    ${['skipped', 'cancelled', 'error'].includes(rowState) ? 'opacity-45' : ''}
                  `}
                >
                  {thumbnail}
                  {info}

                  {/* Status */}
                  <div className="flex items-center shrink-0 pr-1">
                    {rowState === 'queued' && <span className="text-[10px] font-semibold text-muted-soft uppercase tracking-widest">Queued</span>}
                    {rowState === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-500/80" />}
                    {rowState === 'error' && (
                      <Tooltip>
                        <TooltipTrigger asChild><AlertCircle className="h-4 w-4 text-destructive-foreground/70" /></TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">Download failed</TooltipContent>
                      </Tooltip>
                    )}
                    {rowState === 'skipped' && <span className="text-[10px] font-semibold text-muted-soft uppercase tracking-widest">Skipped</span>}
                    {rowState === 'cancelled' && <span className="text-[10px] font-semibold text-muted-soft uppercase tracking-widest">Stopped</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SELECTION MODE
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none border-b border-border/40 pb-3.5 space-y-3">
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={goBackToHistory} className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex items-center gap-1.5 text-xs">
              Back<Kbd>esc</Kbd>
            </TooltipContent>
          </Tooltip>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate tracking-tight text-foreground leading-tight flex items-center gap-2">
              <ListVideo className="h-4.5 w-4.5 text-muted-foreground shrink-0" />
              <span className="truncate">{playlistDetails.title}</span>
            </h2>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {playlistDetails.videos.length} videos • {playlistDetails.uploader}
            </p>
          </div>
        </div>

        <div className="ml-11 flex flex-col gap-2.5">
          {/* Options row */}
          <div className="flex items-center gap-2">
            <Select value={globalQuality} onValueChange={handleGlobalQualityChange}>
              <SelectTrigger className="w-44 h-9 text-xs font-medium bg-secondary/30 border-border/50 hover:bg-secondary/50 transition-colors shrink-0">
                <SelectValue placeholder="Quality" />
              </SelectTrigger>
              <SelectContent>
                {globalQuality === 'custom' && <SelectItem value="custom" className="text-xs italic">Custom</SelectItem>}
                <SelectItem value="best" className="text-xs">Best Available</SelectItem>
                <SelectItem value="2160" className="text-xs">4K (2160p)</SelectItem>
                <SelectItem value="1440" className="text-xs">2K (1440p)</SelectItem>
                <SelectItem value="1080" className="text-xs">1080p</SelectItem>
                <SelectItem value="720" className="text-xs">720p</SelectItem>
                <SelectItem value="480" className="text-xs">480p</SelectItem>
                <SelectItem value="360" className="text-xs">360p</SelectItem>
                <SelectItem value="240" className="text-xs">240p</SelectItem>
                <SelectItem value="audio" className="text-xs">Audio only (MP3)</SelectItem>
              </SelectContent>
            </Select>

            {/* Playlist-wide H.264 conversion */}
            <label
              className={`flex items-center gap-2 h-9 px-3 rounded-md border border-border/50 bg-secondary/30 transition-colors select-none
                ${globalQuality === 'audio' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-secondary/50'}`}
            >
              <Checkbox
                checked={globalH264}
                disabled={globalQuality === 'audio'}
                onCheckedChange={(c) => setGlobalH264(!!c)}
                className="h-3.5 w-3.5 rounded-[3px] cursor-pointer"
              />
              <span className="text-xs font-medium text-foreground/80 leading-none whitespace-nowrap">
                Convert to H.264
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors outline-none" />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-60">
                  Re-encodes VP9/AV1 videos to H.264 on-device after downloading, so they open in Premiere, Final Cut and iMovie. Only applies to videos that need it. Uses extra CPU and time.
                </TooltipContent>
              </Tooltip>
            </label>

            {/* Overwrite */}
            <Tooltip>
              <TooltipTrigger asChild>
                <label className="flex items-center gap-2 h-9 px-3 rounded-md border border-border/50 bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer select-none">
                  <Checkbox
                    checked={!allowDuplicates}
                    onCheckedChange={(c) => setAllowDuplicates(!c)}
                    className="h-3.5 w-3.5 rounded-[3px] cursor-pointer"
                  />
                  <span className="text-xs font-medium text-foreground/80 leading-none whitespace-nowrap">
                    Overwrite files
                  </span>
                </label>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                If checked, existing files with the same name will be replaced.
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Selection + download row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-medium text-foreground/80 tabular-nums">{selectedVideos.size} selected</span>
              <div className="h-3.5 w-px bg-border/60" />
              <button onClick={handleSelectAll} className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">All</button>
              <button onClick={handleSelectNone} className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">None</button>
            </div>

            <div className="flex items-center gap-3">
              {totalEstimate.bytes > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                  <HardDrive className="h-3.5 w-3.5 opacity-60" />
                  <span className="tabular-nums">
                    {totalEstimate.unknown > 0 ? '≥ ' : '~'}{formatBytes(totalEstimate.bytes)}
                  </span>
                </div>
              )}
              <Button
                className="h-9 px-5 gap-2 font-semibold shadow-sm"
                onClick={startBatchDownload}
                disabled={selectedVideos.size === 0}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Video list */}
      <ScrollArea className="flex-1 -mx-2 px-2">
        <div className="flex flex-col gap-2 py-3 pb-6">
          {playlistDetails.videos.map((video) => {
            const isSelected = selectedVideos.has(video.id);
            const entry = videoFormats[video.id];
            const isLoadingFormats = !entry || entry.isLoading;
            const fmts = entry?.formats || [];
            const effQuality = resolveQuality(video.id);
            const effFormat = resolveFormat(video.id);
            const showH264 = effQuality !== 'audio' && !!effFormat && !effFormat.isH264;
            const size = itemSizeBytes(video.id);
            const converted = effectiveConvert(video.id);

            return (
              <div
                key={video.id}
                className={`flex items-center gap-3.5 p-3 rounded-xl border transition-all duration-200
                  ${isSelected ? 'bg-secondary/15 border-border/40' : 'bg-background border-border/20 opacity-50 hover:opacity-80'}
                `}
              >
                {/* Checkbox */}
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleVideo(video.id)}
                  className="cursor-pointer h-4 w-4 rounded-[4px] shrink-0"
                />

                {/* Thumbnail */}
                <div className="relative w-24 aspect-video rounded-lg overflow-hidden shrink-0 bg-secondary/30 border border-border/30 group">
                  <img src={video.thumbnail} alt="" className="w-full h-full object-cover" onError={thumbFallback} />
                  <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm font-semibold group-hover:opacity-0 transition-opacity">
                    {formatDuration(video.duration)}
                  </div>
                  <button
                    className="absolute inset-0 m-auto flex items-center justify-center gap-1 rounded-md bg-black/60 backdrop-blur-sm px-2 py-1 text-[10px] text-white/80 hover:text-white hover:bg-black/80 transition-all opacity-0 group-hover:opacity-100 cursor-pointer border-none h-fit w-fit"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.electronAPI.downloadThumbnail({
                        url: video.thumbnail,
                        title: video.title,
                      });
                    }}
                    title="Download Thumbnail"
                  >
                    <ImageDown className="h-3 w-3" />
                  </button>
                </div>

                {/* Title + meta */}
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                  <h3
                    className="font-medium text-[13px] truncate cursor-pointer hover:text-primary transition-colors leading-snug"
                    onClick={() => window.electronAPI.openExternalLink(video.url)}
                    title={video.title}
                  >
                    {video.title}
                  </h3>
                  <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground">
                    <p className="truncate">{video.uploader}</p>
                    {!isLoadingFormats && size > 0 && (
                      <>
                        <span className="text-border shrink-0">·</span>
                        <span className="font-mono text-muted-soft shrink-0 tabular-nums">
                          {converted ? '~' : ''}{formatBytes(size)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Per-video controls */}
                <div className="flex flex-col justify-center gap-1.5 w-[172px] shrink-0">
                  {isLoadingFormats ? (
                    <>
                      <div className="w-full h-8 rounded-md bg-secondary/40 animate-pulse" />
                      <div className="w-1/2 h-3.5 rounded bg-secondary/30 animate-pulse self-end" />
                    </>
                  ) : (
                    <>
                      <Select
                        value={effQuality}
                        onValueChange={(val) => handleIndividualQualityChange(video.id, val)}
                      >
                        <SelectTrigger className="w-full h-8 text-[11px] bg-secondary/25 hover:bg-secondary/45 border-border/40 transition-colors px-2.5">
                          <SelectValue placeholder="Quality" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="best" className="text-[11px]">
                            {fmts.length > 0 ? `Best · ${fmts[0].quality}` : 'Best Available'}
                          </SelectItem>
                          {fmts.map(f => (
                            <SelectItem key={f.itag} value={String(f.itag)} className="text-[11px]">
                              {f.quality}
                            </SelectItem>
                          ))}
                          <SelectItem value="audio" className="text-[11px]">Audio only</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* No tooltip here on purpose — the playlist-wide control
                          in the header already explains what this does. */}
                      {showH264 && (
                        <label
                          htmlFor={`h264-${video.id}`}
                          className={`flex items-center gap-1.5 justify-end pr-0.5 select-none transition-opacity
                            ${globalH264 ? 'opacity-50' : 'cursor-pointer'}`}
                        >
                          <Checkbox
                            id={`h264-${video.id}`}
                            checked={globalH264 || !!videoH264[video.id]}
                            disabled={globalH264}
                            onCheckedChange={(val) => setVideoH264(prev => ({ ...prev, [video.id]: !!val }))}
                            className="h-3.5 w-3.5 rounded-[3px] cursor-pointer"
                          />
                          <span className="text-[11px] text-muted-foreground leading-none whitespace-nowrap">
                            Convert to H.264
                          </span>
                        </label>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default PlaylistView;
