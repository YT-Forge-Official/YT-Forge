import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { cn } from '@/lib/utils';

/**
 * Sun ⇄ moon appearance switch.
 *
 * A track with both icons ghosted in place and a knob that slides between
 * them; the icon inside the knob swaps with a rotate + scale cross-fade, so
 * the sun appears to set as the moon rises.
 */
const ThemeToggle = ({ className }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggleTheme}
      className={cn(
        'group relative inline-flex h-8 w-[60px] shrink-0 cursor-pointer items-center rounded-full',
        'border border-border/60 bg-secondary/40 dark:bg-background/70 transition-colors duration-200',
        'hover:bg-secondary/60 dark:hover:bg-background',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
    >
      {/* Track icons — the destination hints, dimmed under the knob */}
      <Sun
        className={cn(
          'pointer-events-none absolute left-[7px] h-3.5 w-3.5 transition-opacity duration-200',
          isDark ? 'opacity-45' : 'opacity-0'
        )}
        strokeWidth={2}
      />
      <Moon
        className={cn(
          'pointer-events-none absolute right-[7px] h-3.5 w-3.5 transition-opacity duration-200',
          isDark ? 'opacity-0' : 'opacity-45'
        )}
        strokeWidth={2}
      />

      {/* Knob */}
      <span
        data-theme-motion
        className={cn(
          'pointer-events-none relative z-10 flex h-6 w-6 items-center justify-center rounded-full',
          'bg-card dark:bg-secondary shadow-sm ring-1 ring-border/70 transition-transform duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)]',
          isDark ? 'translate-x-[31px]' : 'translate-x-[3px]'
        )}
      >
        <Sun
          data-theme-motion
          className={cn(
            'absolute h-3.5 w-3.5 text-amber-500 transition-all duration-300',
            isDark ? 'scale-50 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'
          )}
          strokeWidth={2.25}
        />
        <Moon
          data-theme-motion
          className={cn(
            'absolute h-3.5 w-3.5 text-indigo-300 transition-all duration-300',
            isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-90 opacity-0'
          )}
          strokeWidth={2.25}
        />
      </span>
    </button>
  );
};

export { ThemeToggle };
