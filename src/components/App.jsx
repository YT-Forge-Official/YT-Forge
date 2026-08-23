import React, { useState, useEffect } from 'react';
import { AppProvider, useAppContext } from '../contexts/AppContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import Header from './Header';
import HistoryView from './HistoryView';
import DetailsView from './DetailsView';
import PlaylistView from './PlaylistView';
import LoadingComponent from './LoadingComponent';
import { AlertCircle, ArrowLeft, Youtube, Loader2, ListVideo, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';

const GoogleIcon = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// ─── Main app content ─────────────────────────────────────────────────────────
const AppContent = () => {
  const {
    isLoading, videoDetails, playlistDetails, isPlaylistMode, hybridPromptUrl, fetchError,
    goBackToHistory, cancelFetchDetails, handleHybridChoice,
    ytDlpStatus, pendingFetch,
    isAgeRestricted, loginYoutube,
  } = useAppContext();

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    await loginYoutube();
    setIsLoggingIn(false);
    goBackToHistory(); // Go back so they can try fetching again
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
        <div className="flex flex-col items-center justify-center h-full gap-5">
          <div className="flex flex-col items-center gap-6 max-w-[500px] text-center bg-secondary/20 p-8 rounded-3xl border border-border/50 shadow-sm">
            <div className="space-y-3">
              <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 mb-2">
                <ListVideo className="h-7 w-7 text-primary" />
              </div>
              <p className="text-2xl font-bold tracking-tight text-foreground">Playlist Detected</p>
              <p className="text-[15px] text-muted-foreground/90 leading-relaxed px-4">
                The URL provided points to a video that is part of a larger playlist. How would you like to proceed?
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 w-full mt-2">
              <button
                className="group relative flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border border-border/60 bg-background hover:bg-secondary/40 hover:border-primary/40 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md cursor-pointer active:scale-[0.98]"
                onClick={() => handleHybridChoice('video')}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <Film className="h-8 w-8 text-foreground/70 group-hover:text-primary transition-colors z-10" strokeWidth={1.5} />
                <div className="flex flex-col items-center gap-1 z-10">
                  <span className="font-semibold text-foreground group-hover:text-primary transition-colors">Single Video</span>
                  <span className="text-xs text-muted-foreground text-center">Download only the specific video</span>
                </div>
              </button>
              
              <button
                className="group relative flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border border-border/60 bg-background hover:bg-secondary/40 hover:border-primary/40 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md cursor-pointer active:scale-[0.98]"
                onClick={() => handleHybridChoice('playlist')}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <ListVideo className="h-8 w-8 text-foreground/70 group-hover:text-primary transition-colors z-10" strokeWidth={1.5} />
                <div className="flex flex-col items-center gap-1 z-10">
                  <span className="font-semibold text-foreground group-hover:text-primary transition-colors">Entire Playlist</span>
                  <span className="text-xs text-muted-foreground text-center">Fetch all videos in the playlist</span>
                </div>
              </button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={goBackToHistory}
            className="gap-1.5 text-muted-foreground hover:text-foreground text-xs mt-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
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
                disabled={isLoggingIn}
                className="w-full mt-2 h-10 bg-white text-black hover:bg-white/90 shadow-md hover:shadow-lg transition-all"
              >
                {isLoggingIn ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <GoogleIcon className="h-5 w-5 mr-2" />
                )}
                <span className="font-medium text-[15px]">Sign in with Google</span>
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
    <AppProvider>
      <TooltipProvider delayDuration={0}>
        <AppContent />
      </TooltipProvider>
    </AppProvider>
  );
}

export default App;
