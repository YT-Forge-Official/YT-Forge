import { EDITORS, REPO_URL, VERSION } from '@/lib/site';
import { Container, Chip } from './ui';
import { GitHubIcon, StarIcon } from './icons';
import { PlatformCta } from './PlatformCta';
import { UrlBarDemo } from './UrlBarDemo';

export function Hero({ stars }) {
  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-0 sm:pt-40">
      {/* backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="grid-lines absolute inset-x-0 top-0 h-[900px]" />
        <div className="ember-glow anim-float absolute top-[-160px] left-1/2 h-[620px] w-[900px] -translate-x-1/2" />
        <div className="from-bg absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t to-transparent" />
      </div>

      <Container>
        <div className="flex flex-col items-center text-center">
          <div data-reveal className="flex flex-wrap items-center justify-center gap-2">
            <Chip tone="bright">{VERSION}</Chip>
            <Chip>MIT licensed</Chip>
            <Chip>No telemetry</Chip>
          </div>

          <h1
            className="text-hero mt-7 max-w-[19ch] font-medium text-balance"
            data-reveal
            style={{ '--reveal-delay': '60ms' }}
          >
            YouTube downloads,{' '}
            <span className="dim">finally done right.</span>
          </h1>

          <p
            className="text-deck text-ink-2 mt-6 max-w-[58ch] text-pretty"
            data-reveal
            style={{ '--reveal-delay': '140ms' }}
          >
            Every other downloader hands you an AV1 file your timeline chokes on. YT-FORGE
            picks <span className="text-ink">H.264 + AAC</span> by default, so what lands on
            disk drops straight into Premiere, Final Cut or Resolve.
          </p>

          <div
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-3"
            data-reveal
            style={{ '--reveal-delay': '220ms' }}
          >
            <PlatformCta />
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost h-12 px-6 text-base"
            >
              <GitHubIcon />
              Source
              {stars ? (
                <span className="text-ink-3 ml-1 flex items-center gap-1 font-[family-name:var(--font-geist-mono)] text-[13px]">
                  <StarIcon className="size-3" />
                  {stars}
                </span>
              ) : null}
            </a>
          </div>

          {/* editor compatibility strip */}
          <div className="mt-20 w-full" data-reveal style={{ '--reveal-delay': '280ms' }}>
            <div className="rule" />
            <p className="eyebrow mt-6">Drops into</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2.5 sm:gap-x-8 sm:gap-y-3">
              {EDITORS.map((name) => (
                <span key={name} className="text-ink-2 text-[13px] font-medium sm:text-[13.5px]">
                  {name}
                </span>
              ))}
            </div>
            <p className="text-small text-ink-4 mt-4">
              No transcode step. No &ldquo;media pending&rdquo; spinner.
            </p>
          </div>
        </div>
      </Container>

      {/* live demo — the hero visual */}
      <Container className="relative mt-20 pb-16 sm:mt-24 sm:pb-24">
        <div
          data-reveal
          style={{ '--reveal-delay': '80ms' }}
          className="relative mx-auto max-w-[780px]"
        >
          <div
            aria-hidden
            className="ember-glow absolute -inset-x-24 -top-16 -bottom-16 -z-10 opacity-80"
          />
          <UrlBarDemo />
          <p className="text-meta text-ink-4 mt-5 text-center font-[family-name:var(--font-geist-mono)] uppercase">
            Not a video — that is the real flow, running
          </p>
        </div>
      </Container>

    </section>
  );
}
