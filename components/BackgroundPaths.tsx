'use client';
import Link from 'next/link';

/**
 * Animated flowing paths behind the landing hero.
 *
 * The reference implementation used framer-motion; this is the same effect in
 * plain CSS — `stroke-dashoffset` gives the travelling-line motion that
 * `pathLength`/`pathOffset` give there — so it costs no new dependency and no
 * runtime JS. Tuned to the dark palette, and it stops under
 * prefers-reduced-motion.
 */
function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${
      312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${
      616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${
      684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
    opacity: 0.08 + i * 0.012,
    duration: 18 + (i % 7) * 3,
    delay: -(i % 11),
  }));

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <svg className="h-full w-full" viewBox="0 0 696 316" fill="none" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`rr-grad-${position}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>
        </defs>
        {paths.map((p) => (
          <path
            key={p.id}
            d={p.d}
            stroke={`url(#rr-grad-${position})`}
            strokeWidth={p.width}
            strokeOpacity={p.opacity}
            className="flow"
            style={{ animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s` }}
          />
        ))}
      </svg>
    </div>
  );
}

export default function BackgroundPaths({
  title, subtitle, cta, href,
}: { title: string; subtitle: string; cta: string; href: string }) {
  const words = title.split(' ');
  let n = 0; // running letter index drives the stagger

  return (
    <section className="relative -mx-4 mb-10 flex min-h-[62vh] items-center justify-center overflow-hidden rounded-3xl border border-line bg-ink1 px-4 sm:-mx-6 sm:px-6">
      <div className="absolute inset-0">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tighter sm:text-6xl">
          {words.map((word, wi) => (
            <span key={wi} className="mr-3 inline-block last:mr-0">
              {word.split('').map((letter, li) => (
                <span
                  key={`${wi}-${li}`}
                  className="letter inline-block bg-gradient-to-b from-fg to-fg/70 bg-clip-text text-transparent"
                  style={{ animationDelay: `${(n++) * 0.035}s` }}
                >
                  {letter}
                </span>
              ))}
            </span>
          ))}
        </h1>

        <p className="fade mx-auto mt-5 max-w-xl text-base text-muted sm:text-lg" style={{ animationDelay: '.7s' }}>
          {subtitle}
        </p>

        <div className="fade mt-8 inline-block" style={{ animationDelay: '.9s' }}>
          <Link href={href}
            className="glow lift group inline-flex items-center gap-2 rounded-2xl px-7 py-4 text-base font-semibold text-ink0 shadow-lg">
            {cta}
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
