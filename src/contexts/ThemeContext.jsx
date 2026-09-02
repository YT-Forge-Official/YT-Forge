import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

const PREFERENCES = ['system', 'light', 'dark'];

/** Paint the resolved theme onto <html>. `dark` drives every Tailwind token. */
const paint = (resolved) => {
  document.documentElement.classList.toggle('dark', resolved !== 'light');
};

/**
 * Cross-fade colours for the length of a switch only, so the transition never
 * interferes with ordinary hover/enter animations.
 */
const paintWithFade = (resolved) => {
  const el = document.documentElement;
  el.classList.add('theme-transition');
  window.clearTimeout(el._themeFadeTimer);
  el._themeFadeTimer = window.setTimeout(
    () => el.classList.remove('theme-transition'),
    260
  );
  paint(resolved);
};

/**
 * Read the persisted appearance (exposed synchronously by the preload) and
 * apply it before React mounts, so the first frame is already in the right
 * palette. Defaults to following the system.
 */
export const applyStoredTheme = () => {
  const { preference = 'system', resolved = 'dark' } =
    window.electronAPI?.initialAppearance || {};
  paint(resolved);
  return { preference, resolved };
};

export const ThemeProvider = ({ children }) => {
  const [state, setState] = useState(() => ({
    preference: window.electronAPI?.initialAppearance?.preference || 'system',
    resolved: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  }));

  // The main process owns the value: re-sync once on mount, then follow the OS
  // for as long as the preference stays on 'system'.
  useEffect(() => {
    let cancelled = false;

    window.electronAPI?.getAppearance?.().then((appearance) => {
      if (cancelled || !appearance) return;
      setState((prev) => {
        if (appearance.resolved !== prev.resolved) paint(appearance.resolved);
        return appearance;
      });
    });

    window.electronAPI?.onAppearanceChanged?.((appearance) => {
      if (!appearance) return;
      setState((prev) => {
        if (appearance.resolved !== prev.resolved) paintWithFade(appearance.resolved);
        return appearance;
      });
    });

    return () => { cancelled = true; };
  }, []);

  const setPreference = useCallback(async (preference) => {
    const next = PREFERENCES.includes(preference) ? preference : 'system';

    // Optimistic for the two explicit choices — the main process confirms with
    // the authoritative value (and resolves 'system' against the OS).
    if (next !== 'system') {
      paintWithFade(next);
      setState({ preference: next, resolved: next });
    }

    const appearance = await window.electronAPI?.setAppearance?.(next);
    if (!appearance) return;
    setState((prev) => {
      if (appearance.resolved !== prev.resolved) paintWithFade(appearance.resolved);
      return appearance;
    });
  }, []);

  /** Flip to the opposite of what's on screen — always an explicit choice. */
  const toggleTheme = useCallback(() => {
    setPreference(
      document.documentElement.classList.contains('dark') ? 'light' : 'dark'
    );
  }, [setPreference]);

  return (
    <ThemeContext.Provider
      value={{
        preference: state.preference,
        theme: state.resolved,
        isDark: state.resolved === 'dark',
        setPreference,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
