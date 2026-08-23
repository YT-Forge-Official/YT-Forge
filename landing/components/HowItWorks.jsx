import { STEPS } from '@/lib/site';
import { Container, Section, SectionHead } from './ui';

export function HowItWorks() {
  return (
    <Section id="how" beat="chapter">
      <Container>
        <SectionHead
          eyebrow="How it works"
          title="Paste a link."
          dim="Get a file you can cut with."
          deck="Four steps, none of which involve a terminal, a captcha, or a page that opens three tabs before the download starts."
        />

        <div className="border-line-subtle mt-14 grid grid-cols-1 gap-y-10 border-t pt-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-0">
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              data-reveal
              style={{ '--reveal-delay': `${i * 90}ms` }}
              className="group border-line-subtle relative px-0 sm:px-7 lg:border-l lg:first:border-l-0 lg:first:pl-0 lg:last:pr-0"
            >
              <div className="flex items-baseline gap-3">
                <span className="eyebrow">{step.n}</span>
                <span className="bg-line-subtle group-hover:bg-line-hover h-px flex-1 transition-colors duration-300" />
              </div>

              <StepGlyph index={i} />

              <h3 className="text-card mt-8 font-medium">{step.title}</h3>
              <p className="text-body text-ink-2 mt-2.5 max-w-[34ch]">{step.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

/**
 * Thin isometric line glyphs — one per step. Monochrome, with a single ember
 * highlight that animates on hover.
 */
function StepGlyph({ index }) {
  const stroke = 'rgba(255,255,255,0.30)';
  const faint = 'rgba(255,255,255,0.13)';

  return (
    <svg viewBox="0 0 120 88" className="mt-8 h-[88px] w-[120px] overflow-visible" aria-hidden>
      {/* shared ground plane */}
      <path
        d="M60 62 L104 76 L60 88 L16 76 Z"
        fill="none"
        stroke={faint}
        strokeWidth="1"
        strokeDasharray={index === 0 ? '3 3' : undefined}
      />

      {index === 0 && (
        <>
          {/* a link dropping in */}
          <rect
            x="40"
            y="16"
            width="40"
            height="16"
            rx="3"
            fill="none"
            stroke={stroke}
            strokeWidth="1"
            className="anim-float"
          />
          <path d="M52 24 h16" stroke="var(--color-ember)" strokeWidth="1.5" strokeLinecap="round" />
          <path
            d="M60 34 v20"
            stroke={stroke}
            strokeWidth="1"
            strokeDasharray="4 4"
            className="anim-dash"
          />
          <path d="M56 50 l4 5 4-5" fill="none" stroke={stroke} strokeWidth="1" />
        </>
      )}

      {index === 1 && (
        <>
          {/* stacked format choices, top one selected */}
          {[0, 1, 2].map((k) => (
            <path
              key={k}
              d={`M60 ${20 + k * 13} L96 ${31 + k * 13} L60 ${42 + k * 13} L24 ${31 + k * 13} Z`}
              fill="none"
              stroke={k === 0 ? 'var(--color-ember)' : faint}
              strokeWidth={k === 0 ? '1.4' : '1'}
              opacity={k === 0 ? 1 : 0.7}
            />
          ))}
          <circle cx="60" cy="31" r="2" fill="var(--color-ember)" className="anim-pulse-dot" />
        </>
      )}

      {index === 2 && (
        <>
          {/* chunked transfer */}
          <path d="M60 18 L96 30 L60 42 L24 30 Z" fill="none" stroke={stroke} strokeWidth="1" />
          {[0, 1, 2, 3].map((k) => (
            <rect
              key={k}
              x={36 + k * 13}
              y="52"
              width="9"
              height="9"
              fill="none"
              stroke={k < 3 ? stroke : faint}
              strokeWidth="1"
            />
          ))}
          <path
            d="M60 44 v6"
            stroke="var(--color-ember)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            className="anim-dash"
          />
        </>
      )}

      {index === 3 && (
        <>
          {/* timeline with clips */}
          <path d="M22 30 h76" stroke={faint} strokeWidth="1" />
          {[0, 1, 2].map((k) => (
            <rect
              key={k}
              x={24 + k * 26}
              y="22"
              width="22"
              height="16"
              rx="2"
              fill="none"
              stroke={k === 1 ? 'var(--color-ember)' : stroke}
              strokeWidth="1"
            />
          ))}
          <path d="M60 42 v14" stroke={stroke} strokeWidth="1" />
          <path d="M56 52 l4 5 4-5" fill="none" stroke={stroke} strokeWidth="1" />
        </>
      )}
    </svg>
  );
}
