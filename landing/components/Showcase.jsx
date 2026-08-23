import { Container, Section, SectionHead, Chip, Dot } from './ui';
import { AppWindow } from './AppWindow';

const CALLOUTS = [
  {
    k: 'Thumbnails, not filenames',
    v: 'Every row carries its poster frame, title and the resolution you actually got.',
  },
  {
    k: 'Codec in plain sight',
    v: '2160p (VP9) is labelled as such, so you know before you drop it on a timeline.',
  },
  {
    k: 'Reveal in Finder',
    v: 'One click from the row to the file on disk. No hunting through Downloads.',
  },
  {
    k: 'History that persists',
    v: 'The list survives a restart. Clear it whenever, per item or all at once.',
  },
];

export function Showcase() {
  return (
    <Section beat="chapter" className="overflow-hidden">
      <Container>
        <div className="flex items-baseline gap-4">
          <span className="eyebrow" data-reveal>
            0.2
          </span>
          <span className="eyebrow" data-reveal>
            In the app
          </span>
        </div>

        <SectionHead
          className="mt-6"
          title="One window."
          dim="A list, a URL bar, and nothing else asking for your attention."
          deck="No sidebar of features you will never use. No account panel. The whole app is the thing you came to do."
        />

        <div className="mt-16 grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7" data-reveal>
            <div aria-hidden className="ember-glow absolute -z-10 h-[380px] w-[480px] opacity-50" />
            <AppWindow
              src="/screenshot1.png"
              alt="YT-FORGE main window: a URL bar and a download list with five videos, each showing a thumbnail, title and resolution"
              breadcrumb="yt-forge / downloads"
              status="5 items · queue idle"
              right={
                <span className="text-ink-4 hidden font-[family-name:var(--font-geist-mono)] text-[11px] tracking-[0.08em] uppercase sm:block">
                  history
                </span>
              }
            />
          </div>

          <div className="lg:col-span-5 lg:pt-6" data-reveal style={{ '--reveal-delay': '120ms' }}>
            <dl className="space-y-0">
              {CALLOUTS.map((c, i) => (
                <div key={c.k} className="border-line-subtle border-t py-5 first:border-t-0 first:pt-0">
                  <dt className="flex items-center gap-2.5">
                    <span className="eyebrow">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-card font-medium">{c.k}</span>
                  </dt>
                  <dd className="text-body text-ink-2 mt-2 max-w-[42ch]">{c.v}</dd>
                </div>
              ))}
            </dl>

            <div className="border-line-subtle mt-8 flex flex-wrap items-center gap-2 border-t pt-6">
              <Chip tone="bright">
                <Dot tone="ok" pulse={false} />
                Dark by default
              </Chip>
              <Chip>Keyboard-first</Chip>
              <Chip>Native menus</Chip>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
