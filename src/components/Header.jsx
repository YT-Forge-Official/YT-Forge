import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Search, ArrowDownToLine } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { LANDING_URL } from '@/lib/links';

const Header = () => {
  const { url, handleUrlChange, handleFetchDetails, isLoading, activeJobs, isDownloading, goBackToHistory } = useAppContext();

  // px-[21px] matches the card's inner inset below (20px padding + 1px border),
  // so this row shares a column with Downloads / Settings / Clear.
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

      {/* The mark, doing what a brand mark does: linking to the site */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="YT-Forge website"
            className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => window.electronAPI.openExternalLink(LANDING_URL)}
          >
            <Logo className="w-[17px]! h-[11.2px]!" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          YT-Forge website ↗
        </TooltipContent>
      </Tooltip>
    </header>
  );
};

export default Header;
