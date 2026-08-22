import React from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LoadingComponent = ({ onCancel, ytDlpStatus, pendingFetch, isPlaylistMode }) => {
  const showUpdateStage = pendingFetch && (ytDlpStatus === 'checking' || ytDlpStatus === 'downloading' || ytDlpStatus === 'updated' || ytDlpStatus === 'up-to-date' || ytDlpStatus === 'error');

  const getTitle = () => {
    if (showUpdateStage) {
      if (ytDlpStatus === 'downloading') return 'Updating packages';
      if (ytDlpStatus === 'checking') return 'Checking packages';
      if (ytDlpStatus === 'updated') return 'Packages updated';
      if (ytDlpStatus === 'up-to-date') return 'Packages up to date';
      if (ytDlpStatus === 'error') return 'Update failed';
    }
    return isPlaylistMode ? 'Fetching Playlist Info' : 'Fetching Video Info';
  };

  const getSubtitle = () => {
    if (showUpdateStage) {
      if (ytDlpStatus === 'downloading') return 'Installing the latest yt-dlp, almost done…';
      if (ytDlpStatus === 'checking') return 'Verifying yt-dlp is up to date…';
      if (ytDlpStatus === 'updated') return 'Successfully installed the latest version.';
      if (ytDlpStatus === 'up-to-date') return 'You are running the latest version.';
      if (ytDlpStatus === 'error') return 'Will retry next time you start the app.';
    }
    return 'This may take a moment…';
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <Loader2
        className={`h-8 w-8 animate-spin transition-colors duration-700 ${showUpdateStage && ytDlpStatus !== 'updated' && ytDlpStatus !== 'up-to-date' ? 'text-yellow-400' : 'text-muted-foreground'
          }`}
      />

      <div className="flex flex-col items-center gap-1.5">
        <span className="text-sm font-medium text-foreground/80">
          {getTitle()}
        </span>
        <span className="text-xs text-muted-foreground/60">
          {getSubtitle()}
        </span>
      </div>




      {onCancel && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="gap-1.5 text-muted-foreground hover:text-foreground text-xs mt-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Cancel
        </Button>
      )}
    </div>
  );
};

export default LoadingComponent;
