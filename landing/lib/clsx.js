/** Tiny class joiner — no dependency needed for this. */
export function clsx(...parts) {
  return parts.filter(Boolean).join(' ');
}
