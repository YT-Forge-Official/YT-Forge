import Image from 'next/image';
import { clsx } from '@/lib/clsx';
import { Dot } from './ui';

/**
 * Product chrome around a real app screenshot: title bar with traffic lights,
 * mono breadcrumb, and a status footer. Mirrors the actual YT-FORGE window.
 */
export function AppWindow({
  src,
  alt,
  breadcrumb = 'yt-forge / downloads',
  status = 'Idle — paste a URL to start',
  right,
  priority = false,
  className,
  frameClassName,
}) {
  return (
    <div className={clsx('panel panel-lg overflow-hidden', className)}>
      {/* title bar */}
      <div className="border-line-subtle flex h-11 items-center gap-3 border-b px-4">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/12" />
          <span className="size-2.5 rounded-full bg-white/12" />
          <span className="size-2.5 rounded-full bg-white/12" />
        </div>
        <p className="text-ink-3 truncate font-[family-name:var(--font-geist-mono)] text-[12px]">
          {breadcrumb}
        </p>
        {right ? <div className="ml-auto shrink-0">{right}</div> : null}
      </div>

      {/* screenshot */}
      <div className={clsx('bg-bg relative', frameClassName)}>
        <Image
          src={src}
          alt={alt}
          width={1598}
          height={1327}
          priority={priority}
          className="block h-auto w-full"
          sizes="(max-width: 1024px) 100vw, 1100px"
        />
      </div>

      {/* status bar */}
      <div className="border-line-subtle flex h-10 items-center gap-2 border-t px-4">
        <Dot tone="ok" />
        <p className="text-ink-3 truncate font-[family-name:var(--font-geist-mono)] text-[12px]">
          {status}
        </p>
        <p className="text-ink-4 ml-auto hidden shrink-0 font-[family-name:var(--font-geist-mono)] text-[12px] sm:block">
          H.264 · AAC
        </p>
      </div>
    </div>
  );
}
