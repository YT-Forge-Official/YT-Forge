import { REPO_URL } from '@/lib/site';
import { Container } from './ui';
import { GitHubIcon } from './icons';
import { PlatformCta } from './PlatformCta';

export function Cta() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-36">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="halftone absolute inset-0" />
        <div className="ember-glow absolute bottom-[-220px] left-1/2 h-[520px] w-[820px] -translate-x-1/2 opacity-70" />
      </div>

      <Container>
        <div className="flex flex-col items-center text-center">
          <h2 className="text-section max-w-[24ch] font-medium text-balance" data-reveal>
            Stop transcoding downloads before you can use them.
          </h2>
          <p className="text-deck text-ink-2 mt-5 max-w-[52ch]" data-reveal style={{ '--reveal-delay': '80ms' }}>
            Free, open source, and about ninety seconds from here to your first file.
          </p>

          <div
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-3"
            data-reveal
            style={{ '--reveal-delay': '160ms' }}
          >
            <PlatformCta />
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-ghost h-12 px-6 text-base">
              <GitHubIcon />
              Read the source
            </a>
          </div>
        </div>
      </Container>
    </section>
  );
}
