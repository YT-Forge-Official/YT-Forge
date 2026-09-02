import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Search, Coffee, ArrowDownToLine } from 'lucide-react';

const KOFI_URL = 'https://ko-fi.com/D3Z1266RDI';

const Header = () => {
  const { url, handleUrlChange, handleFetchDetails, isLoading, activeJobs, isDownloading, goBackToHistory } = useAppContext();

  return (
    <header className="flex items-center gap-3">
      <Input
        type="text"
        placeholder="Paste a YouTube URL..."
        value={url}
        onChange={(e) => handleUrlChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleFetchDetails()}
        className="flex-1 h-10 bg-card border-border/50 text-sm placeholder:text-muted-foreground/60"
      />
      <Button
        onClick={handleFetchDetails}
        disabled={!url || isLoading}
        className="h-10 px-5 min-w-32.5 font-semibold"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Search className="h-4 w-4" />
            Get Video
          </>
        )}
      </Button>

      {/* Downloads — visible whenever anything is queued or downloading */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={goBackToHistory}
          >
            <ArrowDownToLine className="h-4 w-4" />
            {activeJobs.length > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                {isDownloading && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
                )}
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {activeJobs.length > 0
            ? `Downloads — ${activeJobs.length} active`
            : 'Downloads'}
        </TooltipContent>
      </Tooltip>

      {/* Ko-fi — warms to gold on hover, the one bit of colour up here */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="kofi-affordance h-10 w-10 shrink-0 text-muted-foreground"
            onClick={() => window.electronAPI.openExternalLink(KOFI_URL)}
          >
            <Coffee className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Buy me a coffee
        </TooltipContent>
      </Tooltip>
    </header>
  );
};

export default Header;
