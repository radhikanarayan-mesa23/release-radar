'use client';
import { useEffect, useRef } from 'react';

/** Counts a metric up on mount. Writes straight to the DOM — no state, no re-renders. */
export default function CountUp({ to, className }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || to === 0) {
      el.textContent = String(to);
      return;
    }
    const ms = 650, t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = String(Math.round(to * (1 - (1 - p) ** 3))); // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);

  return <span ref={ref} className={className}>0</span>;
}
