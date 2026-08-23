import { Chrome, Lock } from 'lucide-react';
import { Container, Section, SectionHead, Chip, Dot } from './ui';

export function Extension() {
  return (
    <Section id="extension" beat="section">
      <Container>
        <SectionHead
          eyebrow="Coming next"
          title="One click, straight from the watch page."
          dim=""
          deck="A browser extension that hands the current video to the desktop app — no copy, no paste, no switching windows."
        />

        <div className="mt-14 grid grid-cols-1 gap-3 lg:grid-cols-12">
          {/* mock browser */}
          <div data-reveal className="panel panel-lg overflow-hidden lg:col-span-7">
            <div className="border-line-subtle flex h-11 items-center gap-3 border-b px-4">
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-white/12" />
                <span className="size-2.5 rounded-full bg-white/12" />
                <span className="size-2.5 rounded-full bg-white/12" />
              </div>
              <div className="border-line-subtle text-ink-3 flex h-6 flex-1 items-center rounded-[var(--radius-pill)] border bg-black/25 px-3 font-[family-name:var(--font-geist-mono)] text-[11px]">
                youtube.com/watch?v=…
              </div>
              <span className="border-ember/35 bg-ember/[0.08] flex size-6 items-center justify-center rounded-[5px] border">
                <span className="bg-ember size-2 rounded-[1px]" />
              </span>
            </div>

            <div className="relative p-5">
              {/* fake player */}
              <div className="border-line-subtle relative aspect-video overflow-hidden rounded-[var(--radius-control)] border bg-gradient-to-br from-white/[0.05] to-white/[0.01]">
                <div className="halftone absolute inset-0 opacity-40" />

                {/* play affordance */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="relative flex size-14 items-center justify-center">
                    <span className="border-line absolute inset-0 rounded-full border" />
                    <span className="border-line anim-ring absolute inset-0 rounded-full border" />
                    <svg viewBox="0 0 12 14" className="text-ink-2 ml-0.5 size-4" fill="currentColor" aria-hidden>
                      <path d="M0 0l12 7-12 7z" />
                    </svg>
                  </span>
                </div>

                <div className="absolute inset-x-4 bottom-4">
                  <div className="mb-2.5 flex items-center justify-between font-[family-name:var(--font-geist-mono)] text-[10px]">
                    <span className="text-ink-3">04:12</span>
                    <span className="text-ink-4">09:58</span>
                  </div>
                  <div className="h-[3px] w-full rounded-full bg-white/12">
                    <div className="bg-ink relative h-full w-[42%] rounded-full">
                      <span className="bg-ink absolute -top-[3px] -right-[4px] size-[9px] rounded-full" />
                    </div>
                  </div>
                </div>

                {/* the popover */}
                <div className="panel absolute top-4 right-4 w-[210px] p-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-ember/15 border-ember/30 flex size-6 items-center justify-center rounded-[5px] border">
                      <span className="bg-ember size-1.5 rounded-full" />
                    </span>
                    <p className="text-small font-medium">Send to YT-FORGE</p>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {['1080p · H.264', '2160p60 · H.264', 'Audio only · M4A'].map((label, i) => (
                      <div
                        key={label}
                        className={`text-meta flex items-center justify-between rounded-[4px] border px-2 py-1.5 font-[family-name:var(--font-geist-mono)] ${
                          i === 0
                            ? 'border-ember/30 bg-ember/[0.07] text-ember'
                            : 'border-line-subtle text-ink-3'
                        }`}
                      >
                        {label}
                        {i === 0 ? <Dot tone="ember" /> : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* copy side */}
          <div className="panel flex flex-col justify-between p-6 sm:p-8 lg:col-span-5" data-reveal style={{ '--reveal-delay': '100ms' }}>
            <div>
              <div className="flex items-center justify-between">
                <span className="border-line-subtle flex size-10 items-center justify-center rounded-[var(--radius-control)] border bg-white/[0.025]">
                  <Chrome className="text-ink-2 size-4" strokeWidth={1.6} />
                </span>
                <Chip tone="ember">
                  <Lock className="size-2.5" />
                  Coming soon
                </Chip>
              </div>

              <h3 className="text-sub mt-6 font-medium">The browser half of the workflow</h3>
              <p className="text-body text-ink-2 mt-3">
                Hit the toolbar button on any watch page and the video is queued in the desktop
                app with your usual format already selected. Playlists too.
              </p>
            </div>

            <ul className="mt-8 space-y-3">
              {[
                ['Chrome & Edge', 'Manifest V3, in review'],
                ['Firefox', 'Planned after Chrome ships'],
                ['Safari', 'Under investigation'],
              ].map(([k, v]) => (
                <li key={k} className="border-line-subtle flex items-center gap-3 border-t pt-3">
                  <Dot tone="ink" pulse={false} />
                  <span className="text-small text-ink flex-1 font-medium">{k}</span>
                  <span className="text-meta text-ink-4 font-[family-name:var(--font-geist-mono)] uppercase">
                    {v}
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              disabled
              className="btn border-line text-ink-4 mt-8 w-full cursor-not-allowed border bg-transparent"
            >
              Not available yet
            </button>
          </div>
        </div>
      </Container>
    </Section>
  );
}
