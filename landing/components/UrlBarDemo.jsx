'use client';

import { useEffect, useReducer } from 'react';
import { Search } from 'lucide-react';
import { Dot } from './ui';

const URL = 'https://youtu.be/LXb3EKWsInQ';

const PHASES = { TYPING: 0, RESOLVING: 1, DOWNLOADING: 2, DONE: 3 };

const initial = { phase: PHASES.TYPING, typed: 0, progress: 0 };

function reducer(state, action) {
  switch (action.type) {
    case 'type':
      return { ...state, typed: state.typed + 1 };
    case 'resolve':
      return { ...state, phase: PHASES.RESOLVING };
    case 'download':
      return { ...state, phase: PHASES.DOWNLOADING };
    case 'progress':
      return { ...state, progress: Math.min(100, state.progress + action.by) };
    case 'done':
      return { ...state, phase: PHASES.DONE, progress: 100 };
    case 'reset':
      return initial;
    default:
      return state;
  }
}

/**
 * Loops the app's core interaction: paste a URL, resolve it, pull the file.
 * Pure CSS/JS — no video, so it stays sharp and weighs nothing.
 */
export function UrlBarDemo() {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dispatch({ type: 'done' });
      return;
    }

    // Build the whole cycle as a fixed timeline, then replay it on a loop.
    const script = [];
    for (let i = 0; i < URL.length; i += 1) script.push([320 + i * 52, { type: 'type' }]);

    const typedDone = 320 + URL.length * 52;
    script.push([typedDone + 420, { type: 'resolve' }]);
    script.push([typedDone + 1500, { type: 'download' }]);

    let at = typedDone + 1600;
    let left = 100;
    while (left > 0.5) {
      const by = Math.max(1.5, left * 0.09);
      left -= by;
      at += 90;
      script.push([at, { type: 'progress', by }]);
    }
    script.push([at + 200, { type: 'done' }]);

    const cycle = at + 4200;
    const timers = [];

    const play = () => {
      dispatch({ type: 'reset' });
      script.forEach(([ms, action]) => timers.push(setTimeout(() => dispatch(action), ms)));
    };

    play();
    const loop = setInterval(play, cycle);

    return () => {
      clearInterval(loop);
      timers.forEach(clearTimeout);
    };
  }, []);

  const text = URL.slice(0, state.typed);
  const resolving = state.phase === PHASES.RESOLVING;
  const downloading = state.phase === PHASES.DOWNLOADING;
  const done = state.phase === PHASES.DONE;
  const pct = state.progress;

  const speed = downloading ? (38 + (pct % 7)).toFixed(2) : '0.00';
  const mb = ((1085 * pct) / 100).toFixed(0);

  return (
    <div className="panel panel-lg p-3 sm:p-4">
      {/* URL row — mirrors the app's top bar */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="border-line bg-bg/60 flex h-11 min-w-0 flex-1 items-center rounded-[var(--radius-control)] border px-3.5">
          <p className="text-body truncate font-[family-name:var(--font-geist-mono)]">
            {text ? (
              <span className="text-ink">{text}</span>
            ) : (
              <span className="text-ink-4">Paste a YouTube URL…</span>
            )}
            {!done ? <span className="anim-caret text-ember ml-px">▌</span> : null}
          </p>
        </div>

        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="btn btn-primary h-11 shrink-0 px-4 sm:px-5"
        >
          {resolving ? (
            <span className="border-bg/25 border-t-bg anim-spin-slow size-3.5 animate-spin rounded-full border-2" />
          ) : (
            <Search className="size-4" />
          )}
          <span className="max-sm:hidden">Get Video</span>
        </button>
      </div>

      {/* resolved result */}
      <div
        className="grid transition-all duration-500 ease-[var(--ease-enter)]"
        style={{
          gridTemplateRows: downloading || done ? '1fr' : '0fr',
          opacity: downloading || done ? 1 : 0,
          marginTop: downloading || done ? 14 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="border-line-subtle flex items-center gap-3 rounded-[var(--radius-control)] border bg-white/[0.02] p-3">
            {/* thumbnail stand-in */}
            <div className="border-line-subtle relative hidden h-12 w-[84px] shrink-0 overflow-hidden rounded-[4px] border bg-gradient-to-br from-white/[0.09] to-white/[0.02] sm:block">
              <div className="anim-scan absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="text-small text-ink truncate font-medium">
                  COSTA RICA IN 4K 60fps HDR (ULTRA HD)
                </p>
              </div>

              <div className="mt-1.5 flex items-center gap-2.5 font-[family-name:var(--font-geist-mono)] text-[11px]">
                <span className="text-ink-3">2160p60</span>
                <span className="text-ink-4">·</span>
                <span className="text-ember">H.264</span>
                <span className="text-ink-4">·</span>
                <span className="text-ink-3">MP4</span>
              </div>

              {/* progress */}
              <div className="mt-2.5 flex items-center gap-3">
                <div className="bg-line-subtle relative h-1 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-ink absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-linear"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-ink-3 shrink-0 font-[family-name:var(--font-geist-mono)] text-[11px] tabular-nums">
                  {pct.toFixed(0)}%
                </p>
              </div>
            </div>

            {/* live stats */}
            <div className="hidden shrink-0 items-center gap-4 pr-1 sm:flex">
              <Stat label="speed" value={done ? 'done' : `${speed} MB/s`} />
              <Stat label="size" value={`${mb} MB`} />
            </div>
          </div>
        </div>
      </div>

      {/* footer status */}
      <div className="mt-3 flex items-center gap-2 px-1">
        <Dot tone={done ? 'ok' : downloading ? 'ember' : 'ink'} />
        <p className="text-ink-3 font-[family-name:var(--font-geist-mono)] text-[11px]">
          {done
            ? 'Saved — timeline ready'
            : downloading
              ? 'Downloading video…'
              : resolving
                ? 'Fetching formats…'
                : 'Waiting for a URL'}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="text-right">
      <p className="text-ink-4 font-[family-name:var(--font-geist-mono)] text-[10px] tracking-[0.09em] uppercase">
        {label}
      </p>
      <p className="text-ink mt-0.5 font-[family-name:var(--font-geist-mono)] text-[12px] tabular-nums">
        {value}
      </p>
    </div>
  );
}
