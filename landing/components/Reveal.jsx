'use client';

import { useReveal } from '@/lib/reveal';

/** Mounts the single scroll-reveal observer for the page. */
export function Reveal() {
  useReveal();
  return null;
}
