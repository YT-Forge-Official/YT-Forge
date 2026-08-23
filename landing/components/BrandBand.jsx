import Image from 'next/image';
import { EDITORS } from '@/lib/site';

/**
 * Full-bleed brand band. The wordmark marquee runs behind the banner art
 * and both fade into the page background at the edges.
 */
export function BrandBand() {
  const word = Array.from({ length: 8 });

  return (
    <section className="relative overflow-hidden py-16 sm:py-24">
      {/* oversized wordmark marquee, sitting low-contrast behind everything */}
      <div aria-hidden className="group pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
        <div className="fade-x flex w-max">
          <div className="anim-marquee-slow flex w-max shrink-0 items-center gap-10">
            {word.concat(word).map((_, i) => (
              <span
                key={i}
                className="font-[family-name:var(--font-poppins)] text-[clamp(4rem,13vw,11rem)] leading-none font-bold tracking-[-0.045em] whitespace-nowrap text-white/[0.028]"
              >
                YT-FORGE
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <div className="flex flex-col items-center">
          <div
            data-reveal
            className="panel panel-lg anim-float relative w-full max-w-[520px] overflow-hidden"
          >
            <Image
              src="/banner.png"
              alt="YT-FORGE — YouTube video downloader, finally done right"
              width={1024}
              height={848}
              className="block h-auto w-full"
              sizes="(max-width: 640px) 92vw, 520px"
            />
          </div>

          {/* editor marquee */}
          <div className="mt-14 w-full" data-reveal style={{ '--reveal-delay': '120ms' }}>
            <p className="eyebrow text-center">Timeline-ready in</p>
            <div className="group fade-x mt-5 flex w-full overflow-hidden">
              <div className="anim-marquee flex w-max shrink-0 items-center">
                {EDITORS.concat(EDITORS, EDITORS).map((name, i) => (
                  <span key={i} className="flex items-center">
                    <span className="text-small text-ink-2 px-7 font-medium whitespace-nowrap">
                      {name}
                    </span>
                    <span className="bg-line-subtle h-3.5 w-px" />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
