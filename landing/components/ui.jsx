import { clsx } from '@/lib/clsx';

/** Page-width container. */
export function Container({ className, children }) {
  return (
    <div className={clsx('mx-auto w-full max-w-[1200px] px-5 sm:px-8', className)}>{children}</div>
  );
}

/** Vertical rhythm wrapper. `beat` picks the spacing tier. */
export function Section({ id, beat = 'section', className, children }) {
  const pad = {
    chapter: 'py-20 sm:py-[calc(var(--spacing-chapter)/2)]',
    section: 'py-16 sm:py-[calc(var(--spacing-section)/2)]',
    sub: 'py-12 sm:py-[calc(var(--spacing-sub)/2)]',
  }[beat];

  return (
    <section id={id} className={clsx('relative', pad, className)}>
      {children}
    </section>
  );
}

export function Eyebrow({ children, className }) {
  return <p className={clsx('eyebrow', className)}>{children}</p>;
}

/**
 * The recurring section header: hairline, mono eyebrow, two-tone heading,
 * optional deck offset to the right on wide screens.
 */
export function SectionHead({ eyebrow, title, dim, deck, align = 'split', className }) {
  return (
    <div className={className}>
      <div className="rule mb-5" />
      <div
        className={clsx(
          'gap-y-5',
          align === 'split' && 'lg:grid lg:grid-cols-12 lg:items-end lg:gap-x-10',
          align === 'center' && 'flex flex-col items-center text-center',
        )}
      >
        <div className={align === 'split' ? 'lg:col-span-7' : ''}>
          {eyebrow ? <Eyebrow data-reveal>{eyebrow}</Eyebrow> : null}
          <h2 className="text-section mt-4 font-medium text-balance" data-reveal>
            {title} {dim ? <span className="dim">{dim}</span> : null}
          </h2>
        </div>
        {deck ? (
          <p
            className={clsx(
              'text-body text-ink-2 max-w-[46ch]',
              align === 'split' && 'lg:col-span-5 lg:pb-1.5',
            )}
            data-reveal
            style={{ '--reveal-delay': '80ms' }}
          >
            {deck}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Small pulsing status dot. `tone` = ink | ok | ember | err */
export function Dot({ tone = 'ink', pulse = true, className }) {
  const bg = {
    ink: 'bg-ink-2',
    ok: 'bg-ok',
    ember: 'bg-ember',
    err: 'bg-err',
  }[tone];

  return (
    <span
      className={clsx('inline-block size-1.5 shrink-0 rounded-full', bg, pulse && 'anim-pulse-dot', className)}
    />
  );
}

/** Mono chip used for versions, arch labels, "coming soon". */
export function Chip({ children, tone = 'default', className }) {
  const tones = {
    default: 'border-line text-ink-3',
    bright: 'border-line-strong text-ink',
    ember: 'border-ember/35 text-ember bg-ember/[0.07]',
  };

  return (
    <span
      className={clsx(
        'text-meta inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 py-1 font-[family-name:var(--font-geist-mono)] uppercase',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
