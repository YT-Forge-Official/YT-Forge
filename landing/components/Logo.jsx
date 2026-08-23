import Image from 'next/image';
import { clsx } from '@/lib/clsx';

export function Logo({ size = 26, showWord = true, className }) {
  return (
    <span className={clsx('flex items-center gap-2.5', className)}>
      <Image
        src="/icon.png"
        alt=""
        width={size}
        height={size}
        className="rounded-[7px] ring-1 ring-white/10"
        priority
      />
      {showWord ? (
        <span className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold tracking-[-0.02em]">
          YT<span className="text-ink-3">-</span>FORGE
        </span>
      ) : null}
    </span>
  );
}
