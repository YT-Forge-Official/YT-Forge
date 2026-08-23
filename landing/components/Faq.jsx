'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { FAQ } from '@/lib/site';
import { Container, Section, SectionHead } from './ui';

export function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <Section id="faq" beat="chapter">
      <Container>
        <SectionHead
          eyebrow="FAQ"
          title="The honest answers,"
          dim="including the unflattering ones."
        />

        <div className="border-line-subtle mt-12 border-t">
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={item.q}
                data-reveal
                style={{ '--reveal-delay': `${Math.min(i, 4) * 60}ms` }}
                className="border-line-subtle border-b"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="group flex w-full items-start gap-5 py-6 text-left"
                >
                  <span className="eyebrow mt-1.5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                  <span
                    className={`text-card flex-1 font-medium transition-colors duration-200 ${isOpen ? 'text-ink' : 'text-ink group-hover:text-ink'}`}
                  >
                    {item.q}
                  </span>
                  <span className="border-line group-hover:border-line-hover mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-200">
                    <Plus
                      className={`text-ink-2 size-3.5 transition-transform duration-300 ease-[var(--ease-enter)] ${isOpen ? 'rotate-45' : ''}`}
                    />
                  </span>
                </button>

                <div
                  className="grid transition-all duration-400 ease-[var(--ease-enter)]"
                  style={{ gridTemplateRows: isOpen ? '1fr' : '0fr', opacity: isOpen ? 1 : 0 }}
                >
                  <div className="overflow-hidden">
                    <p className="text-body text-ink-2 max-w-[74ch] pr-12 pb-7 pl-[3.1rem]">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
