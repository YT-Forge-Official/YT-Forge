import { Film, GitBranch, ListMusic, ShieldOff, Gauge, RefreshCw } from 'lucide-react';
import { Container, Section, SectionHead, Chip, Dot } from './ui';

export function Features() {
  return (
    <Section id="features" beat="chapter">
      <Container>
        <SectionHead
          eyebrow="Features"
          title="Built for the person who has to edit the footage,"
          dim="not the person who has to monetise the download page."
          deck="Six things that sound small until you have done this forty times in a week."
        />

        {/* bento */}
        <div className="mt-14 grid grid-cols-1 gap-3 lg:grid-cols-12">
          {/* hero cell — codec preference */}
          <div
            data-reveal
            className="panel panel-interactive relative overflow-hidden p-6 sm:p-8 lg:col-span-7"
          >
            <Head icon={Film} n="01" title="H.264 + AAC, chosen for you" />
            <p className="text-body text-ink-2 mt-3 max-w-[46ch]">
              YouTube serves the same video in several codecs. YT-FORGE ranks them the way an
              editor would, so you get the one that scrubs instead of the one that is 12% smaller.
            </p>
            <CodecRank />
          </div>

          {/* conversion */}
          <div
            data-reveal
            style={{ '--reveal-delay': '80ms' }}
            className="panel panel-interactive flex flex-col p-6 sm:p-8 lg:col-span-5"
          >
            <Head icon={RefreshCw} n="02" title="Convert what you already have" />
            <p className="text-body text-ink-2 mt-3">
              Grabbed a VP9 file last month? Re-encode it to H.264 inside the app with the
              bundled ffmpeg. No second tool, no flags to remember.
            </p>
            <ConvertStrip />
          </div>

          {/* playlists */}
          <div
            data-reveal
            className="panel panel-interactive p-6 sm:p-8 lg:col-span-5"
          >
            <Head icon={ListMusic} n="03" title="Whole playlists, queued" />
            <p className="text-body text-ink-2 mt-3">
              Paste a playlist, pick a folder, walk away. Per-item progress, pause and resume,
              and a queue that survives you closing the details view.
            </p>
            <QueuePreview />
          </div>

          {/* speed */}
          <div
            data-reveal
            style={{ '--reveal-delay': '80ms' }}
            className="panel panel-interactive p-6 sm:p-8 lg:col-span-4"
          >
            <Head icon={Gauge} n="04" title="Chunked and fast" />
            <p className="text-body text-ink-2 mt-3">
              Parallel range requests instead of one thin stream. On a decent line it saturates
              it.
            </p>
            <div className="mt-7">
              <p className="font-[family-name:var(--font-geist-mono)] text-[34px] leading-none tracking-[-0.03em] tabular-nums">
                42.09
                <span className="text-ink-3 ml-1.5 text-[15px]">MB/s</span>
              </p>
              <p className="text-meta text-ink-4 mt-2 font-[family-name:var(--font-geist-mono)] uppercase">
                observed on a 4K pull
              </p>
            </div>
          </div>

          {/* privacy */}
          <div
            data-reveal
            style={{ '--reveal-delay': '160ms' }}
            className="panel panel-interactive flex flex-col p-6 sm:p-8 lg:col-span-3"
          >
            <Head icon={ShieldOff} n="05" title="Nothing phones home" />
            <p className="text-body text-ink-2 mt-3">No analytics. No account. No ads.</p>
            <div className="mt-auto pt-7">
              <div className="flex items-baseline gap-2">
                <span className="font-[family-name:var(--font-geist-mono)] text-[34px] leading-none tabular-nums">
                  0
                </span>
                <span className="text-small text-ink-3">trackers</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip>MIT</Chip>
                <Chip>Open source</Chip>
              </div>
            </div>
          </div>

          {/* engine */}
          <div
            data-reveal
            style={{ '--reveal-delay': '80ms' }}
            className="panel panel-interactive p-6 sm:p-8 lg:col-span-12"
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-[52ch]">
                <Head icon={GitBranch} n="06" title="Standing on yt-dlp" />
                <p className="text-body text-ink-2 mt-3">
                  The extraction engine is the one the internet already trusts, bundled and
                  kept current. YT-FORGE adds the interface, the queue and the format logic —
                  it does not fork or patch the thing underneath.
                </p>
              </div>

              <div className="border-line-subtle flex shrink-0 items-center gap-6 rounded-[var(--radius-card)] border bg-white/[0.015] px-6 py-4">
                {[
                  ['engine', 'yt-dlp'],
                  ['muxer', 'ffmpeg'],
                  ['shell', 'electron'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-meta text-ink-4 font-[family-name:var(--font-geist-mono)] uppercase">
                      {k}
                    </p>
                    <p className="text-small text-ink mt-1 font-[family-name:var(--font-geist-mono)]">
                      {v}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}

function Head({ icon: Icon, n, title }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="border-line-subtle flex size-9 items-center justify-center rounded-[var(--radius-control)] border bg-white/[0.025]">
          <Icon className="text-ink-2 size-4" strokeWidth={1.6} />
        </span>
        <span className="eyebrow">{n}</span>
      </div>
      <h3 className="text-card mt-5 font-medium">{title}</h3>
    </>
  );
}

/** Ranked codec list — H.264 wins, the rest are struck through. */
function CodecRank() {
  const rows = [
    { codec: 'H.264', container: 'MP4', verdict: 'native · scrubs clean', win: true },
    { codec: 'VP9', container: 'WEBM', verdict: 'transcode first' },
    { codec: 'AV1', container: 'MP4', verdict: 'timeline stutters' },
  ];

  return (
    <div className="mt-8 space-y-1.5">
      {rows.map((r, i) => (
        <div
          key={r.codec}
          className={`flex items-center gap-3 rounded-[var(--radius-control)] border px-3.5 py-2.5 transition-colors duration-300 ${
            r.win
              ? 'border-ember/30 bg-ember/[0.06]'
              : 'border-line-subtle bg-white/[0.012]'
          }`}
        >
          <span className="text-meta text-ink-4 w-4 font-[family-name:var(--font-geist-mono)]">
            {i + 1}
          </span>
          <span
            className={`text-small w-16 font-[family-name:var(--font-geist-mono)] font-medium ${
              r.win ? 'text-ember' : 'text-ink-2'
            }`}
          >
            {r.codec}
          </span>
          <span className="text-meta text-ink-4 hidden font-[family-name:var(--font-geist-mono)] sm:block">
            {r.container}
          </span>
          <span
            className={`text-small ml-auto ${r.win ? 'text-ink' : 'text-ink-4 line-through decoration-white/20'}`}
          >
            {r.verdict}
          </span>
          {r.win ? <Dot tone="ember" /> : null}
        </div>
      ))}
    </div>
  );
}

function ConvertStrip() {
  return (
    <div className="border-line-subtle mt-auto flex items-center gap-3 rounded-[var(--radius-control)] border bg-white/[0.015] p-3.5">
      <Box label="VP9" sub="in" />

      <div className="flex-1">
        <p className="text-meta text-ink-4 mb-2 text-center font-[family-name:var(--font-geist-mono)] uppercase">
          ffmpeg
        </p>
        <div className="relative h-px w-full overflow-hidden bg-white/10">
          <span className="bg-ember absolute inset-y-0 left-0 w-1/3" style={{ animation: 'wire 2.4s var(--ease-out) infinite' }} />
        </div>
      </div>

      <Box label="H.264" sub="out" accent />
    </div>
  );
}

function Box({ label, sub, accent }) {
  return (
    <div
      className={`shrink-0 rounded-[4px] border px-3 py-2 text-center ${
        accent ? 'border-ember/35 bg-ember/[0.07]' : 'border-line bg-white/[0.02]'
      }`}
    >
      <p
        className={`text-small font-[family-name:var(--font-geist-mono)] font-medium ${accent ? 'text-ember' : 'text-ink-2'}`}
      >
        {label}
      </p>
      <p className="text-meta text-ink-4 mt-0.5 font-[family-name:var(--font-geist-mono)] uppercase">
        {sub}
      </p>
    </div>
  );
}

function QueuePreview() {
  const items = [
    { name: 'Ep 01 — cold open', pct: 100 },
    { name: 'Ep 02 — the interview', pct: 64 },
    { name: 'Ep 03 — b-roll pass', pct: 0 },
  ];

  return (
    <div className="mt-8 space-y-2.5">
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-3">
          <Dot tone={it.pct === 100 ? 'ok' : it.pct > 0 ? 'ember' : 'ink'} pulse={it.pct > 0 && it.pct < 100} />
          <p className="text-small text-ink-2 min-w-0 flex-1 truncate">{it.name}</p>
          <div className="bg-line-subtle relative h-1 w-16 shrink-0 overflow-hidden rounded-full">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${it.pct === 100 ? 'bg-ok' : 'bg-ink'}`}
              style={{ width: `${it.pct}%` }}
            />
          </div>
          <p className="text-meta text-ink-4 w-9 shrink-0 text-right font-[family-name:var(--font-geist-mono)] tabular-nums">
            {it.pct}%
          </p>
        </div>
      ))}
    </div>
  );
}
