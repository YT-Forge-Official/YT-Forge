'use client';

import { useEffect } from 'react';

/**
 * One IntersectionObserver for every [data-reveal] on the page.
 * Elements fade + rise once, then stop being watched.
 */
export function useReveal() {
  useEffect(() => {
    const nodes = document.querySelectorAll('[data-reveal]:not(.is-in)');
    if (!nodes.length) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );

    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
}
