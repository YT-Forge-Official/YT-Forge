import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Trash2, FolderOpen, X, Settings, ExternalLink, CheckCircle2, ArrowUpCircle, Youtube, Loader2, LogOut, ListVideo, ArrowLeft } from 'lucide-react';

const GoogleIcon = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const HistoryView = () => {
  const { history, setHistory, isAuthenticated, loginYoutube, logoutYoutube } = useAppContext();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState('');
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [versionChecked, setVersionChecked] = useState(false);
  const [selectedPlaylistHistory, setSelectedPlaylistHistory] = useState(null);

  useEffect(() => {
    let mounted = true;
    window.electronAPI.getAppVersion().then(v => {
      if (!mounted) return;
      setAppVersion(v);
      fetch('https://api.github.com/repos/Shaikh-Suja-Rahaman/YT-Forge/releases/latest')
        .then(res => res.json())
        .then(data => {
          if (!mounted || !data?.tag_name) return;
          const latest = data.tag_name.replace(/^v/, '');
          setLatestVersion(latest);
          if (latest.localeCompare(v, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
            setHasNewVersion(true);
          }
          setVersionChecked(true);
        })
        .catch(() => setVersionChecked(true));
    });
    return () => { mounted = false; };
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    await loginYoutube();
    setIsLoggingIn(false);
  };

  const handleClearHistory = async () => {
    await window.electronAPI.clearHistory();
    setHistory([]);
  };

  const handleDeleteItem = async (timestamp) => {
    const updated = await window.electronAPI.deleteHistoryItem(timestamp);
    setHistory(updated);
  };

  return (
    <div className="flex flex-col h-full">

      {selectedPlaylistHistory ? (
        <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="flex-none border-b border-border/40 pb-4 mb-4">
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="icon" onClick={() => setSelectedPlaylistHistory(null)} className="shrink-0 mt-0.5 h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold truncate tracking-tight text-foreground flex items-center gap-2">
                  {selectedPlaylistHistory.title}
                </h2>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span className="font-medium bg-secondary/50 px-1.5 py-0.5 rounded border border-border/40">Playlist</span>
                  <span>•</span>
                  <span>{selectedPlaylistHistory.downloadedVideos?.length} videos</span>
                  <span>•</span>
                  <span className="truncate hover:underline cursor-pointer" onClick={() => window.electronAPI.openFileLocation(selectedPlaylistHistory.path)}>
                    {selectedPlaylistHistory.path}
                  </span>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.electronAPI.openFileLocation(selectedPlaylistHistory.path)} className="shrink-0 gap-2 h-8 text-xs ml-2">
                <FolderOpen className="h-3.5 w-3.5" />
                Open Folder
              </Button>
            </div>
          </div>
          
          <ScrollArea className="flex-1 -mx-2 px-2">
            <div className="flex flex-col gap-2 pb-6">
              {selectedPlaylistHistory.downloadedVideos?.map((v, i) => {
                const formatDuration = (seconds) => {
                  if (!seconds) return '';
                  const h = Math.floor(seconds / 3600);
                  const m = Math.floor((seconds % 3600) / 60);
                  const s = seconds % 60;
                  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                  return `${m}:${s.toString().padStart(2, '0')}`;
                };

                return (
                  <div key={v.id || i} className="group flex items-stretch justify-between gap-4 p-2.5 rounded-xl border border-border/40 bg-secondary/10 hover:bg-secondary/30 transition-all hover:border-primary/20">
                    <div className="relative w-[110px] aspect-video rounded-lg overflow-hidden shrink-0 bg-secondary/30 border border-border/30">
                      <img 
                        src={v.thumbnailUrl || ''} 
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
                      {v.duration && (
                        <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm font-semibold">
                          {formatDuration(v.duration)}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col gap-1 justify-center">
                      <p className="text-sm font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-colors hover:underline" onClick={() => window.electronAPI.openExternalLink(v.url)} title={v.title}>{v.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{v.url}</p>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50 hover:text-white" onClick={() => window.electronAPI.openFileLocation(v.filePath || selectedPlaylistHistory.path)}>
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            Open Folder
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50 hover:text-white" onClick={async () => {
                              const newHistory = [...history];
                              const historyItemIndex = newHistory.findIndex(h => h.timestamp === selectedPlaylistHistory.timestamp);
                              if (historyItemIndex !== -1) {
                                newHistory[historyItemIndex].downloadedVideos = newHistory[historyItemIndex].downloadedVideos.filter((_, index) => index !== i);
                                setHistory(newHistory);
                                await window.electronAPI.addHistoryItem(newHistory[historyItemIndex]);
                                setSelectedPlaylistHistory({...newHistory[historyItemIndex]});
                              }
                            }}>
                              <X className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            Remove
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 mb-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Downloads
        </h2>

        <div className="flex items-center gap-2">

          {/* ── Settings button ── */}
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="relative text-muted-foreground hover:text-white gap-1.5 h-7 text-xs"
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
                </AlertDialogTrigger>
              </TooltipTrigger>

              {hasNewVersion && (
                <TooltipContent side="bottom" className="text-xs">
                  Newer version available
                </TooltipContent>
              )}
            </Tooltip>

            <AlertDialogContent className="sm:max-w-md bg-background border border-border/30 shadow-2xl p-0 overflow-hidden outline-none rounded-xl">
              <div className="p-6 max-h-[80vh] overflow-y-auto">
                <AlertDialogHeader className="space-y-6">
                  {/* Settings Header */}
                  <div className="flex items-center justify-between">
                    <AlertDialogTitle className="text-xl font-bold tracking-tight">
                      Settings
                    </AlertDialogTitle>
                    <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-md bg-secondary/50 text-muted-foreground border border-border/40">
                      YT-Forge v{appVersion || '—'}
                    </span>
                  </div>

                  {/* Updates Section */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground/80">App Updates</h3>
                    <div className={`flex items-center gap-3 rounded-xl px-4 py-3.5 transition-colors ${hasNewVersion ? 'bg-primary/10 border border-primary/20' : 'bg-secondary/40 border border-border/40'}`}>
                      {hasNewVersion ? (
                        <>
                          <ArrowUpCircle className="w-5 h-5 text-primary shrink-0" />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-semibold text-primary">Update available</span>
                            <AlertDialogDescription className="text-xs text-muted-foreground m-0 p-0">
                              Version <span className="font-semibold text-foreground">v{latestVersion}</span> is available on GitHub.
                            </AlertDialogDescription>
                          </div>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-emerald-500/80 shrink-0" />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-foreground/90">You're up to date</span>
                            <AlertDialogDescription className="text-xs text-muted-foreground m-0 p-0">
                              {versionChecked ? 'Running the latest release.' : 'Checking for updates…'}
                            </AlertDialogDescription>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* YouTube Auth Section */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-foreground/80 flex items-center gap-2">
                        YouTube Authentication
                      </h3>
                      {isAuthenticated ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-sm shadow-emerald-500/5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Signed In</span>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">
                          Not Signed In
                        </span>
                      )}
                    </div>
                    
                    <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 space-y-4">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Sign in to download <strong className="text-foreground/80 font-medium">age-restricted videos</strong>. 
                        
                        Normal downloads work without signing in.
                      </p>
                      
                      {isAuthenticated ? (
                        <div className="flex flex-col gap-2 pt-1">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="w-full h-9">
                                <LogOut className="w-4 h-4 mr-2" />
                                Sign Out
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Sign out of YouTube?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  You won't be able to download age-restricted videos until you sign in again.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={logoutYoutube} className="bg-destructive text-white hover:bg-destructive/90">
                                  Sign Out
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ) : (
                        <div className="pt-1">
                          <Button 
                            variant="default" 
                            size="sm" 
                            onClick={handleLogin} 
                            disabled={isLoggingIn} 
                            className="w-full h-9 bg-white text-black hover:bg-white/90 shadow-sm transition-all"
                          >
                            {isLoggingIn ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <GoogleIcon className="w-4 h-4 mr-2" />
                            )}
                            <span className="font-medium text-sm">Sign in with Google</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </AlertDialogHeader>
              </div>

              {/* Footer */}
              <div className="px-6 py-3 bg-muted/20 border-t border-border/30 flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2"
                  onClick={() => window.electronAPI.openExternalLink('https://github.com/Shaikh-Suja-Rahaman/YT-Forge/releases/latest')}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View releases on GitHub
                </Button>
                <AlertDialogCancel className="h-8 px-4 text-xs m-0">
                  Close
                </AlertDialogCancel>
              </div>
            </AlertDialogContent>
          </AlertDialog>

          {/* ── Clear history button ── */}
          {history.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white gap-1.5 h-7 text-xs">
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
      {/* ── End Header ── */}

      {/* History List — identical to original */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex flex-col gap-2.5">
          {history.length > 0 ? (
            history.map((item) => (
              <div
                key={item.timestamp}
                className="group flex items-center gap-4 rounded-lg p-3 hover:bg-secondary/40 transition-colors min-w-0"
              >
                {/* Thumbnail */}
                <div className="relative shrink-0">
                  <img
                    src={item.thumbnailUrl}
                    className="w-28 aspect-video rounded-md object-cover bg-secondary/30"
                    alt=""
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
                  {item.type === 'playlist' && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center rounded-md transition-colors duration-200 group-hover:bg-black/50">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/50 backdrop-blur-md rounded-full border border-white/10 shadow-lg">
                        <ListVideo className="h-4 w-4 text-white" />
                        <span className="text-[10px] font-bold text-white tracking-wider">
                          {item.downloadedVideos?.length} VIDEOS
                        </span>
                      </div>
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
                  <span className="text-xs text-muted-foreground/70 font-medium">
                    {item.format} {item.type === 'playlist' ? '• Playlist' : ''}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {/* Folder button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground/50 hover:text-white"
                        onClick={() => window.electronAPI.openFileLocation(item.path)}
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                       {item.type === 'playlist' ? 'Open Playlist Folder' : 'Show in Folder'}
                    </TooltipContent>
                  </Tooltip>

                  {/* Delete single item button */}
                  <AlertDialog>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground/50 hover:text-white"
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
                          This item will be deleted from the download history. This action cannot be undone.
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
          ) : (
            <div className="flex flex-col items-center justify-center h-100 text-muted-foreground">
              <p className="text-sm">Your download history will appear here.</p>
            </div>
          )}
        </div>
      </div>
      
        </>
      )}
    </div>
  );
};

export default HistoryView;