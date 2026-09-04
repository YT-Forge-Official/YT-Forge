import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppProvider, useAppContext } from '../contexts/AppContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import Header from './Header';
import HistoryView from './HistoryView';
import DetailsView from './DetailsView';
import PlaylistView from './PlaylistView';
import SettingsDialog from './SettingsDialog';
import LoadingComponent from './LoadingComponent';
import { AlertCircle, ArrowLeft, Youtube, Loader2, ListVideo, Film, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const GoogleIcon = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// ─── Keycap ───────────────────────────────────────────────────────────────────
const Kbd = ({ children, className = '' }) => (
  <kbd
    className={`inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-[5px] border border-border/60 bg-background/80
      font-sans text-[10px] font-semibold leading-none text-muted-foreground/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_0_rgba(0,0,0,0.4)] ${className}`}
  >
    {children}
  </kbd>
);

// ─── Playlist / single-video disambiguation prompt ────────────────────────────
const HybridPrompt = ({ url, onChoose, onCancel }) => {
  const firstOptionRef = useRef(null);

  const listId = useMemo(() => {
    try { return new URL(url).searchParams.get('list') || ''; } catch { return ''; }
  }, [url]);

  // This panel is usually opened by pressing Enter in the URL field. That same
  // keystroke is still being processed when we mount, so focusing an option
  // right away lets Enter's default action activate it and silently skip the
  // choice. Focus on the next frame, and ignore any activation that arrives in
  // the opening moments (covers key-repeat too).
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
    const raf = requestAnimationFrame(() => firstOptionRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  const choose = useCallback((key) => {
    if (Date.now() - openedAt.current < 300) return;
    onChoose(key);
  }, [onChoose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
      const typing = /^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '');
      if (typing) return;
      if (e.key === '1') { e.preventDefault(); choose('video'); }
      else if (e.key === '2') { e.preventDefault(); choose('playlist'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose, onCancel]);

  const options = [
    {
      key: 'video',
      icon: Film,
      shortcut: '1',
      title: 'Just this video',
      description: 'Download only the video the link points to',
    },
    {
      key: 'playlist',
      icon: ListVideo,
      shortcut: '2',
      title: 'The entire playlist',
      description: 'Fetch every video, then pick what to keep',
    },
  ];

  return (
    <div className="flex items-center justify-center h-full animate-in fade-in zoom-in-95 duration-200">
      <div className="w-full max-w-[520px] rounded-2xl border border-border/50 bg-secondary/[0.12] shadow-[0_16px_40px_-28px_rgba(0,0,0,0.22)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_16px_40px_-24px_rgba(0,0,0,0.9)] overflow-hidden">
        {/* Heading */}
        <div className="flex items-start gap-3.5 px-5 pt-5 pb-4">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-background/70 border border-border/50 shrink-0">
            <ListVideo className="h-4 w-4 text-foreground/70" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground leading-none">
              Playlist detected
            </h2>
            <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-1.5">
              This link points to a video that sits inside a playlist.
            </p>
          </div>
        </div>

        <div className="h-px bg-border/40" />

        {/* Choices */}
        <div className="p-2.5 flex flex-col gap-1.5">
          {options.map((opt, i) => (
            <button
              key={opt.key}
              ref={i === 0 ? firstOptionRef : null}
              onClick={() => choose(opt.key)}
              className="group flex items-center gap-3.5 w-full text-left px-3 py-3 rounded-xl border border-transparent
                hover:bg-secondary/40 hover:border-border/50
                focus:outline-none focus:bg-secondary/40 focus:border-border/60 focus:ring-1 focus:ring-ring/40
                active:scale-[0.995] transition-all duration-150 cursor-pointer"
            >
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-background/60 border border-border/40 shrink-0 transition-colors group-hover:border-border/70">
                <opt.icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" strokeWidth={1.75} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium text-foreground/90 leading-none transition-colors group-hover:text-foreground">
                  {opt.title}
                </div>
                <div className="text-[11.5px] text-muted-foreground/80 leading-none mt-1.5 truncate">
                  {opt.description}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Kbd className="opacity-60 group-hover:opacity-100 transition-opacity">{opt.shortcut}</Kbd>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:text-muted-foreground group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>

        <div className="h-px bg-border/40" />

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-background/25">
          {listId ? (
            <span className="font-mono text-[10.5px] text-muted-foreground/50 truncate min-w-0" title={listId}>
              {listId}
            </span>
          ) : <span />}
          <button
            onClick={onCancel}
            className="flex items-center gap-2 shrink-0 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Cancel
            <Kbd>esc</Kbd>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main app content ─────────────────────────────────────────────────────────
const AppContent = () => {
  const {
    isLoading, videoDetails, playlistDetails, isPlaylistMode, hybridPromptUrl, fetchError,
    goBackToHistory, cancelFetchDetails, handleHybridChoice,
    ytDlpStatus, pendingFetch,
    isAgeRestricted, openSettings,
  } = useAppContext();

  const handleLogin = () => {
    openSettings('account');
  };


  const renderCardContent = () => {
    if (isLoading) {
      return (
        <LoadingComponent
          onCancel={cancelFetchDetails}
          ytDlpStatus={ytDlpStatus}
          pendingFetch={pendingFetch}
          isPlaylistMode={isPlaylistMode}
        />
      );
    }
    if (hybridPromptUrl) {
      return (
        <HybridPrompt
          url={hybridPromptUrl}
          onChoose={handleHybridChoice}
          onCancel={goBackToHistory}
        />
      );
    }

    if (isPlaylistMode && playlistDetails) return <PlaylistView />;
    if (videoDetails) return <DetailsView />;
    if (fetchError) {
      if (isAgeRestricted) {
        return (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="flex flex-col items-center gap-4 max-w-md text-center bg-secondary/30 p-8 rounded-2xl border border-border/40">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 shadow-sm shadow-red-500/10 mb-2">
                <Youtube className="h-7 w-7 text-red-500" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-semibold text-foreground">Age-Restricted Content</p>
                <p className="text-sm text-muted-foreground leading-relaxed px-4">
                  This video requires you to confirm your age. Please sign in to your YouTube account to continue downloading.
                </p>
              </div>
              <Button
                variant="default"
                onClick={handleLogin}
                className="w-full mt-2 h-10 bg-white text-neutral-900 border border-black/10 hover:bg-neutral-50 dark:border-transparent dark:hover:bg-white/90 shadow-md hover:shadow-lg transition-all"
              >
                <GoogleIcon className="h-5 w-5 mr-2" />
                <span className="font-medium text-[15px]">Open Settings to Sign in</span>
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={goBackToHistory}
              className="gap-1.5 text-muted-foreground hover:text-foreground text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Go back
            </Button>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <div className="flex flex-col items-center gap-3 max-w-sm text-center">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Couldn't fetch video</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The URL may be invalid, or the video might be unavailable. Please check and try again.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={goBackToHistory}
            className="gap-1.5 text-muted-foreground hover:text-foreground text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to history
          </Button>
        </div>
      );
    }
    return <HistoryView />;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <Header />
      <SettingsDialog />
      <Card className="flex-1 overflow-hidden border-border/50">
        <CardContent className="flex flex-col h-full p-5">
          {renderCardContent()}
        </CardContent>
      </Card>
    </div>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <TooltipProvider delayDuration={0}>
          <AppContent />
        </TooltipProvider>
      </AppProvider>
    </ThemeProvider>
  );
}

export default App;
