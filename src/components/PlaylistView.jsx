import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
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
  ArrowLeft, Download, FolderOpen, ListVideo, 
  CheckCircle2, AlertCircle, Play, Pause, 
  WifiOff, Info, X, RefreshCw
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const formatTime = (totalSeconds) => {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, dm = 2, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const PlaylistView = () => {
  const { 
    playlistDetails, 
    goBackToHistory, 
    isDownloading,
    setIsDownloading,
    refreshHistory
  } = useAppContext();

  if (!playlistDetails) return null;

  const [selectedVideos, setSelectedVideos] = useState(new Set(playlistDetails.videos.map(v => v.id)));
  const [globalQuality, setGlobalQuality] = useState('best');
  const [targetDir, setTargetDir] = useState(null);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  
  useEffect(() => {
    console.log("PLAYLIST VIEW MOUNTED! IF YOU DON'T SEE THIS, THE NEW FILE ISN'T LOADING.");
  }, []);

  const [videoFormats, setVideoFormats] = useState({});
  const [videoQualities, setVideoQualities] = useState({});
  const [videoH264, setVideoH264] = useState({});

  const handleGlobalQualityChange = (val) => {
    setGlobalQuality(val);
    setVideoQualities({});
    setVideoH264({});
  };
  
  const handleIndividualQualityChange = (id, val) => {
    setVideoQualities(prev => ({ ...prev, [id]: val }));
    if (globalQuality !== 'custom') setGlobalQuality('custom');
  };
  
  const handleIndividualH264Change = (id, val) => {
    setVideoH264(prev => ({ ...prev, [id]: val }));
    if (globalQuality !== 'custom') setGlobalQuality('custom');
  };
  
  // Download Queue State
  const [downloadQueue, setDownloadQueue] = useState([]);
  const [currentDownloadIndex, setCurrentDownloadIndex] = useState(-1);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);

  // Active Download Progress State
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [downloadStage, setDownloadStage] = useState('starting');
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState(null);

  const toggleVideo = (id) => {
    const next = new Set(selectedVideos);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedVideos(next);
  };

  const handleSelectAll = () => setSelectedVideos(new Set(playlistDetails.videos.map(v => v.id)));
  const handleSelectNone = () => setSelectedVideos(new Set());

  const handleChooseFolder = async () => {
    const dir = await window.electronAPI.chooseDirectory();
    if (dir) setTargetDir(dir);
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'Live';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startBatchDownload = async () => {
    if (!targetDir) {
      alert("Please choose a destination folder first.");
      return;
    }
    const toDownload = playlistDetails.videos
      .filter(v => selectedVideos.has(v.id))
      .map(v => ({
        ...v,
        customQuality: videoQualities[v.id] || (globalQuality === 'custom' ? 'best' : globalQuality),
        customH264: videoH264[v.id] || false
      }));
    if (toDownload.length === 0) return;

    setDownloadQueue(toDownload);
    setCurrentDownloadIndex(0);
    setIsBatchDownloading(true);
    setIsDownloading(true);
    setProgress(0);
    setProgressText('Preparing download...');
    setDownloadStage('starting');
  };

  const cancelBatchDownload = () => {
    window.electronAPI.cancelDownload({ keepOriginal: false });
    setIsBatchDownloading(false);
    setIsDownloading(false);
    setIsPaused(false);
    setPauseReason(null);
  };

  // Background format fetcher
  useEffect(() => {
    if (!playlistDetails || !playlistDetails.videos) return;
    let isCancelled = false;
    const fetchQueue = async () => {
      for (const video of playlistDetails.videos) {
        if (isCancelled) break;
        
        // Mark as loading safely
        setVideoFormats(prev => {
          if (prev[video.id]) return prev;
          return { ...prev, [video.id]: { isLoading: true, formats: [] } };
        });
        
        try {
          const res = await window.electronAPI.getSingleVideoInfoSilent(video.url);
          if (isCancelled) break;
          
          setVideoFormats(prev => {
            if (res.success && res.formats) {
              return { ...prev, [video.id]: { isLoading: false, formats: res.formats } };
            }
            return { ...prev, [video.id]: { isLoading: false, formats: [] } };
          });
        } catch(e) {
          if (!isCancelled) {
            setVideoFormats(prev => ({ ...prev, [video.id]: { isLoading: false, formats: [] } }));
          }
        }
      }
    };
    fetchQueue();
    return () => { isCancelled = true; };
  }, [playlistDetails]);

  // The Queue Manager Effect
  useEffect(() => {
    let isCancelled = false;
    
    const runNextDownload = async () => {
      if (!isBatchDownloading || currentDownloadIndex < 0 || currentDownloadIndex >= downloadQueue.length) {
        if (isBatchDownloading && currentDownloadIndex >= downloadQueue.length) {
          // Finished
          setIsBatchDownloading(false);
          setIsDownloading(false);
          
          // Save a consolidated playlist history item
          const historyItem = {
            id: 'playlist-' + Date.now(),
            type: 'playlist',
            title: playlistDetails.title,
            uploader: playlistDetails.uploader,
            thumbnailUrl: downloadQueue[0]?.thumbnail || '',
            url: playlistDetails.videos[0]?.url || '',
            format: globalQuality === 'audio' ? 'AUDIO (MP3)' : (globalQuality === 'best' ? 'Best (MP4)' : `${globalQuality}p (MP4)`),
            path: targetDir,
            timestamp: new Date().toISOString(),
            downloadedVideos: downloadQueue.map(v => ({ 
              id: v.id,
              title: v.title, 
              url: v.url, 
              thumbnailUrl: v.thumbnail,
              duration: v.duration,
              filePath: v.filePath
            }))
          };
          await window.electronAPI.addHistoryItem(historyItem);
          await refreshHistory();
          goBackToHistory();
        }
        return;
      }

      const video = downloadQueue[currentDownloadIndex];
      const effQuality = video.customQuality;
      const type = effQuality === 'audio' ? 'mp3' : 'mp4';
      const qualityParam = effQuality === 'audio' ? 'best' : effQuality;
      
      const options = {
        videoId: video.id,
        url: video.url,
        title: video.title,
        thumbnailUrl: video.thumbnail,
        type: type,
        quality: qualityParam,
        qualityLabel: effQuality === 'audio' ? 'MP3' : (effQuality === 'best' ? 'Best' : `${effQuality}p`),
        convertToH264: video.customH264,
        targetDir: targetDir,
        allowDuplicates: allowDuplicates,
        skipHistory: true
      };

      try {
        const result = await window.electronAPI.downloadVideo(options);
        if (!isCancelled) {
           if (result && result.success && result.path) {
             setDownloadQueue(prev => {
               const newQ = [...prev];
               newQ[currentDownloadIndex] = { ...newQ[currentDownloadIndex], filePath: result.path };
               return newQ;
             });
           }
           setCurrentDownloadIndex(prev => prev + 1);
        }
      } catch (err) {
        console.error("Batch download error:", err);
        if (!isCancelled) {
           setCurrentDownloadIndex(prev => prev + 1);
        }
      }
    };

    if (isBatchDownloading && currentDownloadIndex >= 0) {
      runNextDownload();
    }

    return () => { isCancelled = true; };
  }, [isBatchDownloading, currentDownloadIndex, downloadQueue, targetDir, globalQuality, allowDuplicates]);

  // Progress Listener
  useEffect(() => {
    const listener = (data) => {
      if (data.paused !== undefined) {
        setIsPaused(data.paused);
        setPauseReason(data.reason || null);
        if (data.stage) setDownloadStage(data.stage);
        return;
      }

      const { percent = 0, downloadedBytes = 0, totalBytes = 0, stage = 'starting', speed = 0, eta = 0, elapsed = 0 } = data;
      setProgress(percent);
      setDownloadStage(stage);
      setSpeed(speed);
      setEta(eta);
      setElapsed(elapsed);

      if (stage === 'merging' || stage === 'processing') {
        setProgressText('Merging Audio & Video...');
      } else if (totalBytes > 0) {
        setProgressText(`${percent.toFixed(1)}% — ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`);
      } else if (percent > 0) {
        setProgressText(`${percent.toFixed(1)}%`);
      } else {
        setProgressText('Starting download...');
      }
    };
    window.electronAPI.onDownloadProgress(listener);
  }, []);

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header & Main Controls Area */}
      <div className="flex-none border-b border-border/40 p-5 space-y-4">
        {/* Top Header Row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <Button variant="ghost" size="icon" onClick={goBackToHistory} className="mt-0.5 shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground" disabled={isBatchDownloading}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold truncate tracking-tight text-foreground">{playlistDetails.title}</h2>
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {playlistDetails.videos.length} videos • by {playlistDetails.uploader}
              </p>
            </div>
          </div>

          {/* Right side controls - only show when NOT downloading */}
          {!isBatchDownloading && (
            <div className="flex items-center gap-2 shrink-0">
              <Select value={globalQuality} onValueChange={handleGlobalQualityChange}>
                <SelectTrigger className="w-[140px] h-9 text-xs font-medium bg-secondary/30 border-border/50 hover:bg-secondary/50 transition-colors">
                  <SelectValue placeholder="Quality" />
                </SelectTrigger>
                <SelectContent>
                  {globalQuality === 'custom' && <SelectItem value="custom" className="text-xs italic">Custom</SelectItem>}
                  <SelectItem value="best" className="text-xs">Best Available MP4</SelectItem>
                  <SelectItem value="2160" className="text-xs">Up to 4K (2160p)</SelectItem>
                  <SelectItem value="1440" className="text-xs">Up to 2K (1440p)</SelectItem>
                  <SelectItem value="1080" className="text-xs">Up to 1080p</SelectItem>
                  <SelectItem value="720" className="text-xs">Up to 720p</SelectItem>
                  <SelectItem value="audio" className="text-xs">Audio Only (MP3)</SelectItem>
                </SelectContent>
              </Select>

              <Button 
                variant="outline" 
                size="sm"
                className={`h-9 px-3 gap-2 border-border/50 bg-secondary/30 hover:bg-secondary/50 transition-colors text-xs font-medium ${targetDir ? 'text-primary border-primary/30' : ''}`}
                onClick={handleChooseFolder}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="truncate max-w-[120px]">{targetDir ? targetDir.split(/[\\/]/).pop() : "Choose Folder"}</span>
              </Button>
            </div>
          )}

          {/* Active Download Top Right Controls */}
          {isBatchDownloading && (
            <div className="flex items-center gap-2 shrink-0">
               <span className="text-sm font-semibold text-foreground mr-2">
                  {currentDownloadIndex + 1} / {downloadQueue.length}
               </span>
               <AlertDialog>
                 <AlertDialogTrigger asChild>
                   <Button variant="destructive" size="sm" className="h-8 text-xs font-medium px-3 gap-1.5 shadow-sm">
                     <X className="h-3.5 w-3.5" />
                     Cancel
                   </Button>
                 </AlertDialogTrigger>
                 <AlertDialogContent>
                   <AlertDialogHeader>
                     <AlertDialogTitle>Cancel Playlist Download?</AlertDialogTitle>
                     <AlertDialogDescription>
                       The current video download will be stopped, and the rest of the playlist will be cancelled. Videos already completed will remain.
                     </AlertDialogDescription>
                   </AlertDialogHeader>
                   <AlertDialogFooter>
                     <AlertDialogCancel>Continue downloading</AlertDialogCancel>
                     <AlertDialogAction onClick={cancelBatchDownload} className="bg-destructive text-white hover:bg-destructive/90">
                       Cancel Download
                     </AlertDialogAction>
                   </AlertDialogFooter>
                 </AlertDialogContent>
               </AlertDialog>
            </div>
          )}
        </div>

        {/* Action Bar (Download & Selection) */}
        {!isBatchDownloading && (
          <div className="flex items-center justify-between bg-secondary/10 px-4 py-2.5 rounded-xl border border-border/30">
            {/* Selection */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-foreground/80 w-16">{selectedVideos.size} selected</span>
              <div className="h-4 w-px bg-border/50" />
              <Button variant="ghost" size="sm" onClick={handleSelectAll} className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground">Select All</Button>
              <Button variant="ghost" size="sm" onClick={handleSelectNone} className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground">Clear</Button>
            </div>

            {/* Overwrite & Download */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                 <Checkbox 
                   id="overwrite"
                   checked={!allowDuplicates}
                   onCheckedChange={(c) => setAllowDuplicates(!c)}
                   className="h-3.5 w-3.5 rounded-[3px] data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground cursor-pointer"
                 />
                 <label htmlFor="overwrite" className="text-xs font-medium text-muted-foreground select-none cursor-pointer leading-none">
                   Overwrite files
                 </label>
                 <TooltipProvider>
                   <Tooltip>
                     <TooltipTrigger asChild>
                       <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help ml-0.5 outline-none" />
                     </TooltipTrigger>
                     <TooltipContent side="top" className="text-xs">
                       If checked, any existing files with the same name will be replaced.
                     </TooltipContent>
                   </Tooltip>
                 </TooltipProvider>
              </div>

              <Button 
                size="sm"
                className="h-8 px-4 gap-2 transition-all shadow-sm font-semibold"
                onClick={startBatchDownload}
                disabled={selectedVideos.size === 0}
              >
                <Download className="h-3.5 w-3.5" />
                Download Selected
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* List Area */}
      <ScrollArea className="flex-1 px-5 pt-3 pb-6">
        <div className="space-y-2">
          {playlistDetails.videos.map((video) => {
            const isSelected = selectedVideos.has(video.id);
            const isCurrent = currentDownloadIndex >= 0 && downloadQueue[currentDownloadIndex]?.id === video.id;
            const isFinished = currentDownloadIndex >= 0 && downloadQueue.findIndex(v => v.id === video.id) < currentDownloadIndex;
            
            return (
              <div 
                key={video.id}
                className={`flex items-stretch gap-4 p-2.5 rounded-xl border transition-all duration-200 group
                  ${isSelected ? 'bg-secondary/10 border-primary/20 shadow-sm' : 'bg-background border-border/20 opacity-70 hover:opacity-100'}
                  ${isCurrent ? 'bg-primary/5 border-primary/50 shadow-md' : ''}
                  ${isFinished ? 'opacity-50 grayscale-[20%]' : ''}
                `}
              >
                {/* Checkbox Col */}
                <div className="flex flex-col justify-center shrink-0 pl-1">
                  <Checkbox 
                    checked={isSelected}
                    onCheckedChange={() => toggleVideo(video.id)}
                    disabled={isBatchDownloading}
                    className="cursor-pointer h-4 w-4 rounded-[4px]"
                  />
                </div>

                {/* Thumbnail Col */}
                <div className="relative w-[110px] aspect-video rounded-lg overflow-hidden shrink-0 bg-secondary/30 border border-border/30">
                  <img 
                    src={video.thumbnail} 
                    alt="" 
                    className="w-full h-full object-cover" 
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
                  <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm font-semibold">
                    {formatDuration(video.duration)}
                  </div>
                  {isFinished && (
                     <div className="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-[1px]">
                        <CheckCircle2 className="h-6 w-6 text-primary drop-shadow-md" />
                     </div>
                  )}
                </div>

                {/* Info & Progress Col */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h3 
                    className={`font-semibold text-sm truncate mb-0.5 ${!isBatchDownloading ? 'cursor-pointer hover:text-primary transition-colors hover:underline' : 'text-foreground'}`}
                    onClick={() => {
                      if (!isBatchDownloading) window.electronAPI.openExternalLink(video.url);
                    }}
                    title={video.title}
                  >
                    {video.title}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">{video.uploader}</p>
                  
                  {/* Inline Progress for active download */}
                  {isCurrent && (
                    <div className="mt-3 flex flex-col gap-2 pr-2 animate-in fade-in duration-200">
                       {/* Slim Stats Row */}
                       <div className="flex bg-secondary/30 border border-border/30 rounded-md divide-x divide-border/30 overflow-hidden shadow-sm">
                         <div className="flex-1 px-2 py-1.5 flex items-center justify-between">
                           <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Speed</span>
                           <span className="text-[10px] font-mono font-medium text-foreground">
                             {!isPaused && speed > 0 ? `${formatBytes(speed)}/s` : '--'}
                           </span>
                         </div>
                         <div className="flex-1 px-2 py-1.5 flex items-center justify-between">
                           <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Elapsed</span>
                           <span className="text-[10px] font-mono font-medium text-foreground">{formatTime(elapsed)}</span>
                         </div>
                         <div className="flex-1 px-2 py-1.5 flex items-center justify-between">
                           <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Left</span>
                           <span className="text-[10px] font-mono font-medium text-foreground">{!isPaused && speed > 0 && eta > 0 ? formatTime(eta) : '--:--'}</span>
                         </div>
                       </div>
                       
                       {/* Progress Bar & Text */}
                       <div className={`rounded-md border px-2.5 py-2 ${isPaused ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/30 bg-secondary/30'}`}>
                         <div className="flex justify-between items-center gap-3 mb-2 min-w-0">
                           <span className={`text-[10px] font-medium whitespace-nowrap ${isPaused ? 'text-amber-400' : 'text-foreground'}`}>
                             {isPaused 
                               ? (pauseReason === 'network' ? 'Waiting for connection...' : 'Paused') 
                               : (downloadStage === 'starting' ? 'Starting...' : 'Downloading...')}
                           </span>
                           <span className="text-[10px] font-mono tabular-nums tracking-tight text-muted-foreground whitespace-nowrap truncate min-w-0">
                             {progressText}
                           </span>
                         </div>
                         <Progress 
                           value={progress} 
                           indeterminate={progress <= 0 && !isPaused}
                           paused={isPaused} 
                           className="h-1.5" 
                         />
                       </div>
                       
                       {/* Actions */}
                       <div className="flex justify-end gap-2 mt-0.5">
                          <Button variant="ghost" size="sm" onClick={() => window.electronAPI.cancelDownload({ keepOriginal: false })} className="h-6 text-[10px] px-2 text-destructive hover:text-destructive hover:bg-destructive/10">
                            Cancel Item
                          </Button>
                          {isPaused && pauseReason !== 'network' ? (
                            <Button variant="ghost" size="sm" onClick={() => window.electronAPI.resumeDownload()} className="h-6 text-[10px] px-2 gap-1 hover:bg-secondary/50 text-foreground">
                              <Play className="h-3 w-3" /> Resume
                            </Button>
                          ) : !isPaused ? (
                            <Button variant="ghost" size="sm" onClick={() => window.electronAPI.pauseDownload()} className="h-6 text-[10px] px-2 gap-1 hover:bg-secondary/50 text-muted-foreground hover:text-foreground" disabled={downloadStage === 'merging' || downloadStage === 'processing'}>
                              <Pause className="h-3 w-3" /> Pause
                            </Button>
                          ) : null}
                       </div>
                    </div>
                  )}
                </div>

                {/* Settings Col */}
                {!isBatchDownloading && (
                  <div className="flex flex-col justify-center items-end shrink-0 gap-2 w-[140px] min-w-[140px] pl-2 border-l border-border/20">
                    {videoFormats[video.id]?.isLoading ? (
                      <div className="flex items-center justify-center w-full h-8 text-muted-foreground">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      </div>
                    ) : (
                      <>
                        <Select 
                          value={videoQualities[video.id] || (globalQuality === 'custom' ? 'best' : globalQuality)} 
                          onValueChange={(val) => handleIndividualQualityChange(video.id, val)}
                        >
                          <SelectTrigger className="w-full h-7 text-[10px] bg-secondary/20 hover:bg-secondary/40 border-border/40 transition-colors">
                            <SelectValue placeholder="Quality" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="best" className="text-[10px]">Best Available</SelectItem>
                            {videoFormats[video.id]?.formats?.map(f => (
                              <SelectItem key={f.itag} value={f.height?.toString() || f.itag} className="text-[10px]">{f.quality}</SelectItem>
                            ))}
                            <SelectItem value="audio" className="text-[10px]">Audio Only</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1.5 w-full justify-end">
                          <label className="text-[9px] text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground transition-colors" htmlFor={`h264-${video.id}`}>
                            Convert to H.264
                          </label>
                          <Checkbox 
                            id={`h264-${video.id}`}
                            checked={videoH264[video.id] || false}
                            onCheckedChange={(val) => handleIndividualH264Change(video.id, val)}
                            className="h-3 w-3 rounded-[3px]"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default PlaylistView;
// force HMR trigger
