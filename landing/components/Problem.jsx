import { Container, Section, SectionHead } from './ui';

const COMPLAINTS = [
  {
    n: '01',
    title: 'The ad-farm ones',
    body: 'Four redirects, a fake progress bar, a "your download will start shortly" page, and a file that turns out to be a 480p re-encode.',
  },
  {
    n: '02',
    title: 'The paywalled ones',
    body: 'Free until you want 1080p. Then a subscription, an account, and a watermark on the way out.',
  },
  {
    n: '03',
    title: 'The technically-correct ones',
    body: 'They hand you the smallest file YouTube offers — AV1 or VP9 — and your NLE spends the next ten minutes transcoding it before you can make a single cut.',
  },
];

export function Problem() {
  return (
    <Section id="problem" beat="chapter">
      <Container>
        <div className="flex items-baseline gap-4">
          <span className="eyebrow" data-reveal>
            0.1
          </span>
          <span className="eyebrow" data-reveal>
            The problem
          </span>
        </div>

        <SectionHead
          className="mt-6"
          title="Downloading a YouTube video is a solved problem."
          dim="Somehow it is still annoying."
          deck="Three flavours of bad, and every editor has met all three."
        />

        <div className="border-line-subtle mt-14 grid grid-cols-1 gap-y-9 border-t pt-10 lg:grid-cols-3 lg:gap-x-0 lg:gap-y-0">
          {COMPLAINTS.map((c, i) => (
            <div
              key={c.n}
              data-reveal
              style={{ '--reveal-delay': `${i * 90}ms` }}
              className="border-line-subtle lg:border-l lg:px-8 lg:first:border-l-0 lg:first:pl-0 lg:last:pr-0"
            >
              <span className="eyebrow">{c.n}</span>
              <h3 className="text-card mt-4 font-medium">{c.title}</h3>
              <p className="text-body text-ink-2 mt-2.5 max-w-[38ch]">{c.body}</p>
            </div>
          ))}
        </div>

        {/* the turn */}
        <div className="mt-20 flex flex-col items-center text-center" data-reveal>
          <div className="rule w-full max-w-md" />
          <p className="text-sub mt-8 max-w-[34ch] font-medium text-balance">
            YT-FORGE is the fourth option.{' '}
            <span className="dim">Free, quiet, and tuned for the timeline.</span>
          </p>
        </div>
      </Container>
    </Section>
  );
}
