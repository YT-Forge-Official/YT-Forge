import React from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LoadingComponent = ({ onCancel, ytDlpStatus, pendingFetch, isPlaylistMode }) => {
  const showUpdateStage = pendingFetch && (ytDlpStatus === 'checking' || ytDlpStatus === 'downloading');

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <Loader2
        className={`h-8 w-8 animate-spin transition-colors duration-700 ${showUpdateStage ? 'text-yellow-400' : 'text-muted-foreground'
          }`}
      />

      <div className="flex flex-col items-center gap-1.5">
        <span className="text-sm font-medium text-foreground/80">
          {showUpdateStage
            ? ytDlpStatus === 'downloading' ? 'Updating packages' : 'Checking packages'
            : isPlaylistMode ? 'Fetching Playlist Info' : 'Fetching Video Info'}
        </span>
        <span className="text-xs text-muted-foreground/60">
          {showUpdateStage
            ? ytDlpStatus === 'downloading'
              ? 'Installing the latest yt-dlp, almost done…'
              : 'Verifying yt-dlp is up to date…'
            : 'This may take a moment…'}
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
