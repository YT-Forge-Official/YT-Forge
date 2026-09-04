import { useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';

const isTypingTarget = (el) =>
  !!el && (/^(INPUT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable);

// Radix dismisses its own layers on Escape but lets the event keep bubbling, so
// without this a single Escape would close the quality select *and* navigate
// away from the screen behind it. Dialogs and alert dialogs carry their role;
// an open Select renders a listbox. Tooltips (role="tooltip") are deliberately
// not in here — with delayDuration 0 one is open half the time.
const isLayerOpen = () =>
  !!document.querySelector('[role="dialog"],[role="alertdialog"],[role="listbox"]');

/**
 * True when a keystroke is already spoken for and the app should keep its hands
 * off it. Exported so screens with their own local Escape (the playlist
 * drill-down in history) can apply the same rules.
 */
export const shouldIgnoreShortcut = (e) =>
  e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || isLayerOpen();

/**
 * App-wide keyboard shortcuts:
 *   /      focus the URL field
 *   enter  fetch, when focus is loose and there's a URL to fetch
 *   esc    cancel a running fetch, or back out of a view
 *
 * The hybrid playlist/video prompt owns its own keys (1, 2, esc) while it's up,
 * so this stands down for it.
 */
export const useGlobalShortcuts = () => {
  const {
    url, urlInputRef,
    isLoading, videoDetails, playlistDetails, fetchError, hybridPromptUrl, isSettingsOpen,
    handleFetchDetails, cancelFetchDetails, goBackToHistory,
  } = useAppContext();

  useEffect(() => {
    const onKey = (e) => {
      if (isSettingsOpen || shouldIgnoreShortcut(e)) return;
      const typing = isTypingTarget(e.target);

      if (e.key === 'Escape') {
        // Escape in the URL field just releases focus — the field handles that
        // itself, and swallowing it here would strand the caret.
        if (typing || hybridPromptUrl) return;
        if (isLoading) { e.preventDefault(); cancelFetchDetails(); return; }
        if (videoDetails || playlistDetails || fetchError) { e.preventDefault(); goBackToHistory(); }
        return;
      }

      if (typing) return;

      if (e.key === '/') {
        if (hybridPromptUrl) return;
        e.preventDefault();
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
        return;
      }

      // A focused button already owns Enter, and the URL field has its own
      // handler — so only act on it when nothing in particular has focus.
      if (e.key === 'Enter') {
        if (document.activeElement && document.activeElement !== document.body) return;
        if (hybridPromptUrl || isLoading || videoDetails || playlistDetails || fetchError) return;
        if (!url.trim()) return;
        e.preventDefault();
        handleFetchDetails();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    url, urlInputRef, isLoading, videoDetails, playlistDetails, fetchError,
    hybridPromptUrl, isSettingsOpen, handleFetchDetails, cancelFetchDetails, goBackToHistory,
  ]);
};
