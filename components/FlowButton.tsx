'use client';

/**
 * Primary action button: the arrow sweeps in from the left, the label slides
 * across, and an accent circle expands to fill. Adapted from the reference
 * flow-button for the dark palette — the arrow is an inline SVG, so this needs
 * no icon package.
 *
 * `pending` keeps the control legible while a long job runs instead of dimming
 * it: the circle stays filled and a spinner replaces the arrow.
 */
function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function FlowButton({
  text, sub, dot, pendingText = 'Working…', pending = false, disabled = false,
  onClick, type = 'button', full = false, size = 'md',
}: {
  text: string; sub?: string; dot?: string; pendingText?: string; pending?: boolean;
  disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit';
  full?: boolean; size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? 'px-5 py-2 text-xs' : 'px-7 py-3 text-sm';
  const slide = size === 'sm' ? '-translate-x-2.5 group-hover:translate-x-2.5' : '-translate-x-3 group-hover:translate-x-3';
  const arrowIn = size === 'sm' ? 'group-hover:left-3' : 'group-hover:left-4';
  const arrowOut = size === 'sm' ? 'right-3' : 'right-4';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || pending}
      aria-busy={pending}
      className={`group relative flex items-center justify-center gap-1 overflow-hidden rounded-[100px]
        border-[1.5px] font-semibold ${pad}
        transition-all duration-[600ms] ease-[cubic-bezier(0.23,1,0.32,1)]
        hover:rounded-[14px] active:scale-[0.97]
        disabled:cursor-wait disabled:active:scale-100
        ${full ? 'w-full' : ''}
        ${pending
          ? 'border-transparent text-ink0'
          : 'border-accent/35 bg-accent/[0.06] text-fg hover:border-transparent hover:text-ink0'}
        ${disabled && !pending ? 'opacity-40' : ''}`}
    >
      {/* left arrow / spinner */}
      {pending ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`spin absolute z-[9] h-4 w-4 ${size === 'sm' ? 'left-3' : 'left-4'}`} aria-hidden>
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
        </svg>
      ) : (
        <Arrow className={`absolute left-[-25%] z-[9] h-4 w-4 transition-all duration-[800ms]
          ease-[cubic-bezier(0.34,1.56,0.64,1)] ${arrowIn}`} />
      )}

      {dot && !pending && (
        <span aria-hidden style={{ background: dot }}
          className="relative z-[1] mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full opacity-100
            transition-opacity duration-500 group-hover:opacity-0" />
      )}
      <span className={`relative z-[1] whitespace-nowrap transition-all duration-[800ms] ease-out
        ${pending ? 'translate-x-3' : slide}`}>
        {pending ? pendingText : text}
        {sub && !pending && <span className="ml-1.5 font-normal opacity-70">{sub}</span>}
      </span>

      {/* expanding fill */}
      <span aria-hidden
        className={`glow absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full
          transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]
          ${pending ? 'h-[260px] w-[260px] opacity-100' : 'h-4 w-4 opacity-0 group-hover:h-[260px] group-hover:w-[260px] group-hover:opacity-100'}`} />

      {!pending && (
        <Arrow className={`absolute z-[9] h-4 w-4 text-accent transition-all duration-[800ms]
          ease-[cubic-bezier(0.34,1.56,0.64,1)] ${arrowOut}
          group-hover:right-[-25%] group-hover:text-ink0`} />
      )}
    </button>
  );
}
