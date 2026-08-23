'use client';

import { useEffect, useState } from 'react';
import { Download, Menu, X } from 'lucide-react';
import { NAV, REPO_URL } from '@/lib/site';
import { GitHubIcon, StarIcon } from './icons';
import { Logo } from './Logo';
import { clsx } from '@/lib/clsx';

export function Nav({ stars }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock the page while the mobile sheet is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <header
        className={clsx(
          'fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
          scrolled
            ? 'border-line-subtle bg-bg/75 backdrop-blur-2xl'
            : 'border-transparent bg-transparent',
        )}
      >
        <nav className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-8 px-5 sm:px-8">
          <a href="#top" className="shrink-0 transition-opacity hover:opacity-80" aria-label="YT-FORGE home">
            <Logo />
          </a>

          <ul className="hidden items-center gap-7 md:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-small text-ink-2 hover:text-ink transition-colors duration-150"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex items-center gap-2.5">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="border-line hover:border-line-hover hover:bg-bg-hover text-small hidden h-8 items-center gap-2 rounded-[var(--radius-control)] border px-3 transition-colors duration-150 sm:inline-flex"
            >
              <GitHubIcon className="size-3.5" />
              <span className="text-ink">Star</span>
              {stars ? (
                <>
                  <span className="bg-line-strong h-3.5 w-px" />
                  <span className="text-ink-2 flex items-center gap-1 font-[family-name:var(--font-geist-mono)] text-[12px]">
                    <StarIcon className="size-3" />
                    {stars}
                  </span>
                </>
              ) : null}
            </a>

            <a
              href="#download"
              className="btn btn-primary h-8 gap-1.5 px-3 text-[13px] sm:px-3.5"
              aria-label="Download YT-FORGE"
            >
              <Download className="size-3.5" />
              <span className="max-sm:hidden">Download</span>
            </a>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              className="border-line hover:border-line-hover flex size-8 items-center justify-center rounded-[var(--radius-control)] border transition-colors md:hidden"
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile sheet */}
      <div
        className={clsx(
          'bg-bg/95 fixed inset-0 z-40 backdrop-blur-2xl transition-opacity duration-300 md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div className="flex h-full flex-col px-5 pt-24 pb-10">
          <ul className="flex flex-col">
            {NAV.map((item, i) => (
              <li key={item.href} className="border-line-subtle border-b">
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="text-sub flex items-center justify-between py-5 font-medium"
                  style={{
                    opacity: open ? 1 : 0,
                    transform: open ? 'none' : 'translateY(10px)',
                    // longhands only — mixing these with the `transition` shorthand
                    // makes React warn and can drop the delay on rerender
                    transitionProperty: 'opacity, transform',
                    transitionDuration: '0.4s',
                    transitionTimingFunction: 'var(--ease-enter)',
                    transitionDelay: open ? `${60 + i * 40}ms` : '0ms',
                  }}
                >
                  {item.label}
                  <span className="eyebrow">0{i + 1}</span>
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-auto flex flex-col gap-3">
            <a href="#download" onClick={() => setOpen(false)} className="btn btn-primary w-full">
              <Download className="size-4" />
              Download for free
            </a>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-ghost w-full">
              <GitHubIcon />
              View on GitHub
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
