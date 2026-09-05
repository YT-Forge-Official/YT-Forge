import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { formatBytes } from '../utils/formatBytes';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Kbd } from '@/components/ui/kbd';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Download,
  ImageDown,
  Loader2,
  HardDrive,
  CheckCircle2,
  Info,
  Pause,
  Play,
  WifiOff,
  Check,
  Clock,
  X,
  AlertCircle,
} from 'lucide-react';

const formatTime = (totalSeconds) => {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const stageLabels = {
  starting: 'Preparing download...',
  video: 'Downloading video...',
  audio: 'Downloading audio...',
  merging: 'Merging video & audio...',
  processing: 'Processing audio...',
  converting: 'Converting to H.264...',
  done: 'Complete!',
};

const canPause = window.electronAPI.platform !== 'win32';

const DetailsView = () => {
  const {
    videoDetails: details,
    goBackToHistory,
    jobs,
    activeJobs,
    jobProgress,
    jobResults,
    boundJobId,
  } = useAppContext();

  const [selectedQuality, setSelectedQuality] = useState(
    String(details.formats[0]?.itag || "")
  );
  // Sources with no video track at all (SoundCloud, Bandcamp, podcast feeds)
  // only have one sensible output — offering MP4 would produce a soundtrack
  // sealed in a video container.
  const [selectedType, setSelectedType] = useState(details.isAudioOnly ? "mp3" : "mp4");
  const [convertToH264, setConvertToH264] = useState(false);
  const [jobId, setJobId] = useState(boundJobId);

  // Re-bind when the view is re-opened from the active downloads list
  useEffect(() => {
    setJobId(boundJobId);
  }, [boundJobId]);

  // This view stays mounted when the user fetches another link straight from
  // the details screen, so the selectors have to follow the new video rather
  // than keep the previous one's choices. Without this, arriving at an
  // audio-only source with MP4 still selected leaves the format dropdown
  // pointing at an option that is no longer in the list.
  useEffect(() => {
    if (details.isAudioOnly) setSelectedType('mp3');
    setSelectedQuality(String(details.formats[0]?.itag || ''));
  }, [details.videoId, details.webpageUrl, details.isAudioOnly, details.formats]);

  const job = useMemo(() => jobs.find(j => j.id === jobId) || null, [jobs, jobId]);
  const result = jobId ? jobResults[jobId] : null;
  const progress = (jobId && jobProgress[jobId]) || {};

  const isQueued = job?.status === 'queued';
  const isDownloadingJob = job?.status === 'downloading';
  const isBusy = isQueued || isDownloadingJob;

  // If this job is bound (re-opened view), lock selectors to the job's settings
  useEffect(() => {
    if (job && job.kind === 'video') {
      if (job.quality) setSelectedQuality(String(job.quality));
      if (job.type) setSelectedType(job.type);
      setConvertToH264(!!job.convertToH264);
    }
  }, [job?.id]);

  const queuePosition = useMemo(() => {
    if (!isQueued) return 0;
    return activeJobs.findIndex(j => j.id === jobId) + 1;
  }, [isQueued, activeJobs, jobId]);

  const isVP9 = useMemo(() => {
    if (selectedType === 'mp3') return false;
    const format = details.formats.find(f => String(f.itag) === selectedQuality);
    return format ? !format.isH264 : false;
  }, [selectedQuality, selectedType, details.formats]);

  const selectedFormat = useMemo(
    () => details.formats.find(f => String(f.itag) === selectedQuality),
    [details.formats, selectedQuality]
  );

  const estimatedSize = useMemo(() => {
    if (selectedType === 'mp3') {
      return details.audioSizeFormatted || 'N/A';
    }
    if (!selectedFormat || !selectedFormat.sizeFormatted) return "N/A";
    if (convertToH264 && isVP9 && selectedFormat.size > 0) {
      return `~${formatBytes(selectedFormat.size * 1.9)}`;
    }
    return selectedFormat.sizeFormatted;
  }, [selectedType, selectedFormat, details.audioSizeFormatted, convertToH264, isVP9]);

  // Clear the finished-state binding if the user changes format or quality
  useEffect(() => {
    if (result) setJobId(null);
  }, [selectedQuality, selectedType]);

  const progressText = useMemo(() => {
    const { percent = 0, downloadedBytes = 0, totalBytes = 0, stage = 'starting' } = progress;
    if (stage === 'merging' || stage === 'processing') return stageLabels[stage];
    if (totalBytes > 0) return `${percent.toFixed(1)}% — ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`;
    if (percent > 0) return `${percent.toFixed(1)}%`;
    return 'Starting...';
  }, [progress]);

  const handleDownload = async () => {
    const qualityLabel = selectedFormat?.quality;
    // Canonical URL — the search bar may have changed since this video was
    // fetched, so use the page URL yt-dlp reported for THIS video.
    //
    // Do not rebuild this from `videoId`: outside YouTube the id is
    // extractor-local (PornHub's is '65a46f8847bef'), and pasting it into a
    // youtube.com/watch link produced a dead URL that failed every download
    // while metadata and thumbnail still loaded fine.
    const canonicalUrl = details.webpageUrl || details.sourceUrl || '';

    const options = {
      videoId: details.videoId,
      url: canonicalUrl,
      title: details.title,
      thumbnailUrl: details.thumbnailUrl,
      quality: selectedQuality,
      qualityLabel,
      type: selectedType,
      convertToH264: convertToH264 && isVP9,
      sizeBytes: selectedType === 'mp3' ? (details.audioSize || 0) : (selectedFormat?.size || 0),
      // Snapshot of everything needed to restore this view from the queue
      meta: { ...details },
    };

    const res = await window.electronAPI.queueVideo(options);
    if (res.success) {
      setJobId(res.jobId);
    } else if (!res.canceled) {
      console.error(`Error: ${res.error}`);
    }
  };

  const handleCancelDownload = (keepOriginal = false) => {
    if (!jobId) return;
    window.electronAPI.cancelJob({ jobId, keepOriginal: !!keepOriginal });
  };

  const handleThumbnailDownload = async () => {
    const result = await window.electronAPI.downloadThumbnail({
      url: details.thumbnailUrl,
      title: details.title,
    });
    if (!result.success) {
      console.error(`Error: ${result.error}`);
    }
  };

  const isPaused = !!progress.paused;
  const pauseReason = progress.pauseReason || null;
  const downloadStage = progress.stage || 'starting';
  const percent = progress.percent || 0;
  const speed = progress.speed || 0;
  const eta = progress.eta || 0;
  const elapsed = progress.elapsed || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={goBackToHistory}
        className="self-start -ml-2 mb-4 gap-1.5 text-muted-foreground hover:text-foreground h-7 text-xs"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
        <Kbd className="ml-0.5">esc</Kbd>
      </Button>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
        {/* Left Column — Thumbnail, Controls, Download */}
        <div className="flex flex-col min-w-0">
          {/* Thumbnail with save overlay */}
          <div className="relative rounded-lg overflow-hidden bg-secondary group">
            <img
              src={details.thumbnailUrl}
              className="w-full aspect-video object-cover bg-secondary/30"
              alt="Video Thumbnail"
              onError={(e) => {
                if (e.target.src.includes('maxresdefault')) {
                  e.target.src = e.target.src.replace(/maxresdefault\.(jpg|webp)/, 'hqdefault.jpg');
                } else if (e.target.src.includes('sd2.jpg') || e.target.src.includes('sddefault.jpg')) {
                  e.target.src = e.target.src.replace(/sd2\.jpg|sddefault\.jpg/, 'hqdefault.jpg');
                } else {
                  e.target.style.opacity = 0;
                }
              }}
            />
            <button
              className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/60 backdrop-blur-sm px-2 py-1 text-[10px] text-white/80 hover:text-white hover:bg-black/80 transition-all opacity-0 group-hover:opacity-100 cursor-pointer border-none"
              onClick={handleThumbnailDownload}
            >
              <ImageDown className="h-3 w-3" />
              Save
            </button>
          </div>

          {/* Controls section */}
          <div className="flex flex-col gap-2.5 mt-4">
            {/* Format & Quality — equal grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <Select
                value={selectedType}
                onValueChange={setSelectedType}
                disabled={isBusy}
              >
                <SelectTrigger className="h-9 bg-secondary/50 border-border/50 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {!details.isAudioOnly && <SelectItem value="mp4">MP4 (Video)</SelectItem>}
                  <SelectItem value="mp3">MP3 (Audio)</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={selectedQuality}
                onValueChange={setSelectedQuality}
                disabled={isBusy || selectedType === "mp3" || details.formats.length === 0}
              >
                <SelectTrigger className="h-9 bg-secondary/50 border-border/50 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {details.formats.map((f) => (
                    <SelectItem key={`${f.itag}-${f.fps || ''}`} value={String(f.itag)}>
                      {f.quality}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* VP9 compatibility note & Conversion Toggle */}
            {isVP9 && !isBusy && (
              <div className="flex flex-col gap-3 p-3 rounded-lg border border-border/40 bg-secondary/20">
                <div className="flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-500/70 mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-foreground/90 font-medium">
                      Compatibility Warning
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground mr-2">
                      VP9 / AV1 may not be supported by some editors <span className="text-amber-600/70 dark:text-amber-500/50">(Premiere Pro, Final Cut)</span> and older players.
                    </p>
                  </div>
                </div>

                <div className="h-px bg-border/40 w-full" />

                <label className="flex items-start gap-3 cursor-pointer group mt-0.5">
                  <div className={`mt-0.5 flex items-center justify-center w-4 h-4 rounded-[4px] border transition-colors shrink-0 ${convertToH264 ? 'bg-primary border-primary text-primary-foreground' : 'border-border/60 bg-background group-hover:border-primary/50'}`}>
                    {convertToH264 && <Check className="w-3 h-3" strokeWidth={3} />}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium leading-none select-none group-hover:text-foreground transition-colors">Convert to H.264 (MP4)</span>
                    <span className="text-[11px] text-muted-foreground select-none leading-snug">Requires heavy CPU and extra processing time</span>
                  </div>
                  <input type="checkbox" className="hidden" checked={convertToH264} onChange={(e) => setConvertToH264(e.target.checked)} />
                </label>
              </div>
            )}

            {/* Primary action area */}
            {isQueued ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-secondary/20 px-3.5 py-2.5">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[13px] font-medium text-foreground leading-tight">In queue</span>
                    <span className="text-[11px] text-muted-foreground leading-snug">
                      {queuePosition > 1 ? `Position ${queuePosition} — starts automatically` : 'Starting soon…'}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2.5 text-xs text-destructive-foreground/80 hover:text-destructive-foreground hover:bg-destructive/15 shrink-0"
                    onClick={() => handleCancelDownload(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : isDownloadingJob ? (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-[1fr,auto] gap-2.5">
                  {isPaused && pauseReason !== 'network' ? (
                    <Button className="gap-2 h-9" onClick={() => window.electronAPI.resumeDownload()}>
                      <Play className="h-4 w-4" />
                      Resume
                    </Button>
                  ) : !isPaused && canPause ? (
                    <Button
                      variant="secondary"
                      className="gap-2 h-9"
                      onClick={() => window.electronAPI.pauseDownload()}
                      disabled={downloadStage === 'merging' || downloadStage === 'processing'}
                    >
                      <Pause className="h-4 w-4" />
                      Pause
                    </Button>
                  ) : !isPaused ? (
                    <Button disabled variant="secondary" className="gap-2 h-9">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Downloading
                    </Button>
                  ) : (
                    <Button disabled className="gap-2 h-9">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Waiting...
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        className="h-9 px-4"
                      >
                        Cancel
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {downloadStage === 'converting' ? 'Cancel conversion?' : 'Cancel download?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {downloadStage === 'converting'
                            ? 'The video has already been downloaded. You can stop the conversion and keep the original (VP9 / AV1) file, or delete everything altogether.'
                            : 'The download will be stopped and the partial file will be deleted. This action cannot be undone.'}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className={downloadStage === 'converting' ? "sm:justify-between w-full" : ""}>
                        {downloadStage === 'converting' ? (
                          <>
                            <AlertDialogCancel>Keep converting</AlertDialogCancel>
                            <div className="flex items-center gap-2">
                              <AlertDialogAction
                                className="bg-transparent border border-border text-foreground hover:bg-secondary"
                                onClick={() => handleCancelDownload(true)}
                              >
                                Stop, keep original
                              </AlertDialogAction>
                              <AlertDialogAction
                                onClick={() => handleCancelDownload(false)}
                                className="bg-destructive text-white hover:bg-destructive/80"
                              >
                                Delete all
                              </AlertDialogAction>
                            </div>
                          </>
                        ) : (
                          <>
                            <AlertDialogCancel>Keep downloading</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleCancelDownload(false)}
                              className="bg-destructive text-white hover:bg-destructive/80"
                            >
                              Yes, cancel
                            </AlertDialogAction>
                          </>
                        )}
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                {/* Network-paused info badge */}
                {isPaused && pauseReason === 'network' && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/5 border border-amber-500/15">
                    <WifiOff className="h-3 w-3 text-amber-600 dark:text-amber-500/70 shrink-0" />
                    <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-500/70">
                      No internet — will resume automatically
                    </p>
                  </div>
                )}
              </div>
            ) : result?.success ? (
              <Button
                variant="outline"
                className="w-full gap-2 h-9 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300"
                onClick={() => window.electronAPI.openFileLocation(result.path)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Show in Folder
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2.5">
                  <Button className="gap-2 h-9" onClick={handleDownload}>
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                  <div className="flex items-center justify-center rounded-md border border-border/50 bg-secondary/40 text-xs text-muted-foreground font-medium h-9 gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 opacity-60" />
                    {estimatedSize}
                  </div>
                </div>
                {result && !result.success && !result.cancelled && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-destructive/5 border border-destructive/15">
                    <AlertCircle className="h-3 w-3 text-destructive/80 shrink-0" />
                    <p className="text-[11px] leading-snug text-destructive/80">
                      Download failed — please try again
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Progress Area (pushed to bottom) */}
          {isDownloadingJob && (
            <div className="mt-auto pt-4 flex flex-col gap-2">
              {/* Stats Row */}
              {(downloadStage === 'video' || downloadStage === 'audio' || downloadStage === 'converting') && percent > 0 && (
                <div className="flex bg-secondary/30 border border-border/30 rounded-lg divide-x divide-border/30 overflow-hidden shadow-sm animate-in fade-in duration-200">
                  <div className="flex-1 px-2 py-1.5 flex flex-col items-center justify-center">
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Speed</span>
                    <span className="text-xs font-mono tabular-nums font-medium text-foreground">
                      {!isPaused && speed > 0 ? (downloadStage === 'converting' ? `${speed.toFixed(2)}x` : `${formatBytes(speed)}/s`) : '--'}
                    </span>
                  </div>
                  <div className="flex-1 px-2 py-1.5 flex flex-col items-center justify-center">
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Elapsed</span>
                    <span className="text-xs font-mono tabular-nums font-medium text-foreground">{formatTime(elapsed)}</span>
                  </div>
                  <div className="flex-1 px-2 py-1.5 flex flex-col items-center justify-center">
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Time Left</span>
                    <span className="text-xs font-mono tabular-nums font-medium text-foreground">{!isPaused && speed > 0 && eta > 0 ? formatTime(eta) : '--:--'}</span>
                  </div>
                </div>
              )}

              <div className={`rounded-lg border p-3 ${isPaused
                ? 'border-amber-500/20 bg-amber-500/5'
                : 'border-border/30 bg-secondary/30'
                }`}>
                <div className="flex justify-between items-center gap-3 mb-2 min-w-0">
                  <span className={`text-xs font-medium whitespace-nowrap ${isPaused ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
                    }`}>
                    {isPaused
                      ? pauseReason === 'network'
                        ? 'Waiting for connection...'
                        : 'Paused'
                      : stageLabels[downloadStage] || 'Downloading...'}
                  </span>
                  <span className="text-[11px] font-mono tabular-nums tracking-tight text-muted-foreground whitespace-nowrap truncate min-w-0">
                    {progressText}
                  </span>
                </div>
                <Progress
                  value={percent}
                  indeterminate={percent <= 0 && !isPaused}
                  paused={isPaused}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Column — Title & Description */}
        <div className="flex flex-col min-w-0 min-h-0">
          <h3 className="text-base font-semibold leading-snug mb-3 truncate" title={details.title}>
            {details.title}
          </h3>
          <div className="flex-1 overflow-y-auto rounded-lg bg-secondary/20 border border-border/20 min-h-0">
            <div className="p-4">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                {details.description || 'No description available.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailsView;
