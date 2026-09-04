import React from 'react';
import { cn } from '@/lib/utils';

/**
 * A keycap. Used to advertise a shortcut next to the control it drives, so the
 * keyboard path is discoverable without a cheat-sheet.
 */
const Kbd = ({ children, className = '' }) => (
  <kbd
    className={cn(
      `inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-[5px] border border-border/60 bg-background/80
      font-sans text-[10px] font-semibold leading-none text-muted-soft shadow-[0_1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_0_rgba(0,0,0,0.4)]`,
      className
    )}
  >
    {children}
  </kbd>
);

export { Kbd };
