import { Download as DownloadIcon, ShieldAlert, ArrowUpRight } from 'lucide-react';
import { PLATFORMS, VERSION, LATEST_URL, RELEASES_URL } from '@/lib/site';
import { Container, Section, SectionHead, Chip } from './ui';
import { AppleIcon, WindowsIcon, LinuxIcon } from './icons';

const ICONS = { mac: AppleIcon, windows: WindowsIcon, linux: LinuxIcon };

export function Download() {
  return (
    <Section id="download" beat="chapter">
      <Container>
        <SectionHead
          eyebrow="Download"
          title={`Version ${VERSION}.`}
          dim="Free, and it stays free."
          deck="Pick your platform. No email gate, no installer bundling a browser toolbar, no counting down before the link appears."
        />

        <div className="mt-14 grid grid-cols-1 gap-3 md:grid-cols-3">
          {PLATFORMS.map((p, i) => {
            const Icon = ICONS[p.id];
            const primary = p.builds.find((b) => b.primary) ?? p.builds[0];
            const extras = p.builds.filter((b) => b !== primary);

            return (
              <div
                key={p.id}
                data-reveal
                style={{ '--reveal-delay': `${i * 90}ms` }}
                className="panel panel-interactive group flex flex-col p-6 sm:p-7"
              >
                <div className="flex items-start justify-between">
                  <span className="border-line-subtle flex size-11 items-center justify-center rounded-[var(--radius-control)] border bg-white/[0.025]">
                    <Icon className="text-ink size-5" />
                  </span>
                  <Chip>{p.ext}</Chip>
                </div>

                <h3 className="text-sub mt-6 font-medium">{p.name}</h3>
                <p className="text-small text-ink-2 mt-1.5">{p.tagline}</p>
                <p className="text-meta text-ink-4 mt-1 font-[family-name:var(--font-geist-mono)] uppercase">
                  {p.note}
                </p>

                <a href={primary.href} className="btn btn-primary mt-7 w-full">
                  <DownloadIcon className="size-4 transition-transform duration-300 group-hover:translate-y-0.5" />
                  Download
                </a>

                {extras.length ? (
                  <ul className="mt-3 space-y-1">
                    {extras.map((b) => (
                      <li key={b.href}>
                        <a
                          href={b.href}
                          className="text-small text-ink-3 hover:text-ink flex items-center gap-1.5 transition-colors"
                        >
                          {b.label}
                          <ArrowUpRight className="size-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="text-meta text-ink-4 mt-auto pt-6 font-[family-name:var(--font-geist-mono)] uppercase">
                  {primary.label}
                </p>
              </div>
            );
          })}
        </div>

        {/* gatekeeper notice */}
        <div
          data-reveal
          className="panel mt-3 flex flex-col gap-5 p-6 sm:p-7 lg:flex-row lg:items-center"
        >
          <span className="border-line-subtle flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border bg-white/[0.025]">
            <ShieldAlert className="text-warn size-4" strokeWidth={1.7} />
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="text-card font-medium">Your OS will warn you once. That is expected.</h3>
            <p className="text-body text-ink-2 mt-2 max-w-[70ch]">
              Code-signing certificates cost more than an independent open-source project makes.
              On <span className="text-ink">macOS</span> open System Settings → Privacy &amp;
              Security → <span className="text-ink">Open Anyway</span>. On{' '}
              <span className="text-ink">Windows</span> choose More info →{' '}
              <span className="text-ink">Run anyway</span>. Once per install, then never again.
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            <a href={LATEST_URL} target="_blank" rel="noreferrer" className="btn btn-ghost h-9 px-4 text-[13px]">
              Latest release
            </a>
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="btn btn-ghost h-9 px-4 text-[13px]">
              All versions
            </a>
          </div>
        </div>
      </Container>
    </Section>
  );
}
