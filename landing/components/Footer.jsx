import { NAV, REPO_URL, RELEASES_URL, ISSUES_URL, VERSION } from '@/lib/site';
import { Container } from './ui';
import { GitHubIcon } from './icons';
import { Logo } from './Logo';

export function Footer() {
  const columns = [
    {
      title: 'Product',
      links: NAV,
    },
    {
      title: 'Project',
      links: [
        { label: 'GitHub', href: REPO_URL, external: true },
        { label: 'Releases', href: RELEASES_URL, external: true },
        { label: 'Issues', href: ISSUES_URL, external: true },
        { label: 'License (MIT)', href: `${REPO_URL}/blob/main/LICENSE`, external: true },
      ],
    },
    {
      title: 'Built on',
      links: [
        { label: 'yt-dlp', href: 'https://github.com/yt-dlp/yt-dlp', external: true },
        { label: 'FFmpeg', href: 'https://ffmpeg.org', external: true },
        { label: 'Electron', href: 'https://electronjs.org', external: true },
        { label: 'React', href: 'https://react.dev', external: true },
      ],
    },
  ];

  return (
    <footer className="border-line-subtle border-t">
      <Container className="py-14">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:gap-14">
          <div className="col-span-2 sm:col-span-1">
            <Logo />
            <p className="text-small text-ink-2 mt-4 max-w-[30ch]">
              A YouTube downloader that respects your timeline, your bandwidth and your privacy.
            </p>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="border-line hover:border-line-hover text-small mt-5 inline-flex h-8 items-center gap-2 rounded-[var(--radius-control)] border px-3 transition-colors"
            >
              <GitHubIcon className="size-3.5" />
              Source
            </a>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <p className="eyebrow">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      target={l.external ? '_blank' : undefined}
                      rel={l.external ? 'noreferrer' : undefined}
                      className="text-small text-ink-2 hover:text-ink transition-colors duration-150"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="rule my-10" />

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <p className="text-small text-ink-4 max-w-[74ch]">
            YT-FORGE is a graphical interface for the open-source yt-dlp project. It does not
            modify or circumvent that software, and it does not break access controls. Download
            only content you have permission to access or distribute.
          </p>

          <div className="flex shrink-0 items-center gap-4 font-[family-name:var(--font-geist-mono)] text-[11px] tracking-[0.08em] uppercase">
            <span className="text-ink-4">v{VERSION}</span>
            <span className="bg-line-strong h-3 w-px" />
            <span className="text-ink-4">MIT</span>
            <span className="bg-line-strong h-3 w-px" />
            <span className="text-ink-4">© {new Date().getFullYear()} Suja</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}
