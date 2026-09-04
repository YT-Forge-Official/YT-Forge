import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Kbd } from '@/components/ui/kbd';
import { Loader2, Search, ArrowDownToLine } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { LANDING_URL } from '@/lib/links';

const Header = () => {
  const { url, urlInputRef, handleUrlChange, handleFetchDetails, isLoading, activeJobs, isDownloading, goBackToHistory } = useAppContext();
  const [urlFocused, setUrlFocused] = useState(false);

  // px-[21px] matches the card's inner inset below (20px padding + 1px border),
  // so this row shares a column with Downloads / Settings / Clear.
  return (
    <header className="flex items-center gap-3">
      <div className="relative flex-1">
        <Input
          ref={urlInputRef}
          type="text"
          placeholder="Paste a YouTube URL..."
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          onFocus={() => setUrlFocused(true)}
          onBlur={() => setUrlFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleFetchDetails();
            // Escape hands focus back to the app so the global shortcuts apply
            // again. The URL stays — losing a pasted link to a stray keypress
            // would be worse than the extra keystroke to clear it.
            else if (e.key === "Escape") e.currentTarget.blur();
          }}
          className="h-10 bg-card border-border/50 text-sm placeholder:text-muted-soft pr-10"
        />
        {/* Advertises the focus shortcut, and gets out of the way once used */}
        <Kbd
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150 ${
            urlFocused || url ? 'opacity-0' : 'opacity-60'
          }`}
        >
          /
        </Kbd>
      </div>
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
