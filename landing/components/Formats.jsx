import { CAPABILITIES } from '@/lib/site';
import { Container, Section, SectionHead, Chip } from './ui';
import { AppWindow } from './AppWindow';

export function Formats() {
  return (
    <Section id="formats" beat="chapter" className="overflow-hidden">
      <Container>
        <div className="flex items-baseline gap-4">
          <span className="eyebrow" data-reveal>
            1.0
          </span>
          <span className="eyebrow" data-reveal>
            The codec problem
          </span>
        </div>

        <SectionHead
          className="mt-6"
          title="A smaller file is worthless"
          dim="if your timeline won't play it."
          deck="YouTube's newest codecs are a win for YouTube's bandwidth bill. On a laptop running Premiere they are a win for nobody."
        />

        {/* the comparison */}
        <div className="mt-16 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <TimelineCard
            variant="bad"
            codec="AV1 / VP9"
            headline="What every other downloader gives you"
            note="Software decode. Dropped frames on scrub, and a transcode before you can cut."
          />
          <TimelineCard
            variant="good"
            codec="H.264 + AAC"
            headline="What YT-FORGE gives you"
            note="Hardware decode on every machine made this decade. Drag it in and start cutting."
          />
        </div>

        {/* capability strip */}
        <div className="border-line-subtle mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border bg-white/[0.012] lg:grid-cols-4">
          {CAPABILITIES.map((c, i) => (
            <div
              key={c.label}
              data-reveal
              style={{ '--reveal-delay': `${i * 70}ms` }}
              className="border-line-subtle p-5 lg:border-l lg:first:border-l-0"
            >
              <p className="eyebrow">{c.label}</p>
              <p className="mt-3 font-[family-name:var(--font-geist-mono)] text-[22px] leading-none tracking-[-0.02em]">
                {c.value}
              </p>
              <p className="text-small text-ink-4 mt-2">{c.meta}</p>
            </div>
          ))}
        </div>

        {/* the details view, real screenshot */}
        <div className="mt-20 grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5" data-reveal>
            <div className="rule mb-5" />
            <p className="eyebrow">Format control</p>
            <h3 className="text-sub mt-4 font-medium">
              Two dropdowns, <span className="dim">and the right answer is already picked.</span>
            </h3>
            <p className="text-body text-ink-2 mt-4">
              Container on the left, quality on the right. Every resolution the source actually
              has, labelled with its real codec so nothing surprises you at 90%.
            </p>

            <div className="mt-6 flex flex-wrap gap-1.5">
              <Chip tone="ember">2160p60</Chip>
              <Chip>1440p</Chip>
              <Chip>1080p</Chip>
              <Chip>720p</Chip>
              <Chip>M4A audio</Chip>
            </div>

            <dl className="mt-8 space-y-3">
              {[
                ['Live telemetry', 'Speed, elapsed and time-left, updated per chunk.'],
                ['Pause / resume', 'Stops the transfer, keeps the bytes.'],
                ['Full description', 'Title, thumbnail and description pulled in before you commit.'],
              ].map(([k, v]) => (
                <div key={k} className="border-line-subtle flex gap-4 border-t pt-3">
                  <dt className="text-small text-ink w-[38%] shrink-0 font-medium">{k}</dt>
                  <dd className="text-small text-ink-2">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="lg:col-span-7" data-reveal style={{ '--reveal-delay': '120ms' }}>
            <div aria-hidden className="ember-glow absolute -z-10 h-[420px] w-[520px] opacity-60" />
            <AppWindow
              src="/screenshot2.png"
              alt="YT-FORGE details view with format dropdowns, pause and cancel controls, live speed and a progress bar at 45.7%"
              breadcrumb="yt-forge / details"
              status="Downloading video… 45.7% — 496.05 MB / 1.06 GB"
            />
          </div>
        </div>
      </Container>
    </Section>
  );
}

/**
 * A fake NLE timeline. The bad one drops frames; the good one runs a clean
 * playhead across evenly spaced frames.
 */
function TimelineCard({ variant, codec, headline, note }) {
  const bad = variant === 'bad';
  const frames = Array.from({ length: 28 });

  return (
    <div
      data-reveal
      className={`panel p-6 sm:p-7 ${bad ? '' : 'border-ember/20'}`}
      style={bad ? undefined : { background: 'radial-gradient(120% 140% at 50% 0%, rgba(255,106,43,0.05), transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.028), rgba(255,255,255,0.006))' }}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className={`text-small font-[family-name:var(--font-geist-mono)] font-medium ${bad ? 'text-ink-3' : 'text-ember'}`}
        >
          {codec}
        </p>
        <Chip tone={bad ? 'default' : 'ember'}>{bad ? 'transcode required' : 'timeline ready'}</Chip>
      </div>

      <h3 className="text-card mt-5 font-medium">{headline}</h3>
      <p className="text-body text-ink-2 mt-2.5 min-h-[3.2em]">{note}</p>

      {/* timeline strip */}
      <div className="border-line-subtle relative mt-7 overflow-hidden rounded-[var(--radius-control)] border bg-black/30 p-4">
        <div className="flex items-end gap-[3px]">
          {frames.map((_, i) => {
            // bad: irregular heights + gaps, i.e. dropped frames
            const dropped = bad && [4, 5, 11, 17, 18, 24].includes(i);
            const h = bad ? (dropped ? 5 : 12 + ((i * 7) % 11)) : 20;
            return (
              <span
                key={i}
                className={`flex-1 rounded-[1px] ${
                  dropped
                    ? 'bg-err/40'
                    : bad
                      ? 'bg-white/12'
                      : 'bg-ember/38'
                }`}
                style={{ height: h }}
              />
            );
          })}
        </div>

        {/* playhead */}
        <div className="relative mt-3 h-px w-full bg-white/8">
          <span
            className={`absolute -top-[13px] h-[15px] w-px ${bad ? 'bg-err/70' : 'bg-ink'}`}
            style={{
              animation: bad
                ? 'none'
                : 'playhead 4.2s var(--ease-out) infinite',
              left: bad ? '38%' : undefined,
            }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between font-[family-name:var(--font-geist-mono)] text-[10px] tracking-[0.08em] uppercase">
          <span className={bad ? 'text-err/80' : 'text-ok'}>
            {bad ? '6 frames dropped' : 'no dropped frames'}
          </span>
          <span className="text-ink-4">{bad ? '00:00:14 · stalled' : '00:00:38 · realtime'}</span>
        </div>
      </div>
    </div>
  );
}
