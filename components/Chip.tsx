const TONE: Record<string, string> = {
  HIGH:          'border-high/40 bg-high/15 text-high',
  MEDIUM:        'border-medium/40 bg-medium/15 text-medium',
  LOW:           'border-low/40 bg-low/15 text-low',
  NOT_SURE:      'border-notsure/40 bg-notsure/15 text-notsure',
  SECURITY:      'border-high/40 bg-high/15 text-high',
  BREAKING:      'border-medium/40 bg-medium/15 text-medium',
  MAJOR:         'border-line bg-ink3 text-muted',
  'PRE-RELEASE': 'border-line bg-ink3 text-muted',
  ACCENT:        'border-accent/40 bg-accent/15 text-accent',
  MUTED:         'border-line bg-ink3 text-muted',
};

/** Colour is never the only signal: every chip carries its text label. */
export default function Chip({ label, tone }: { label: string; tone?: string }) {
  const key = (tone ?? label).toUpperCase().replace(/[ -]/g, '_');
  const cls = TONE[key] ?? TONE[(tone ?? '').toUpperCase()] ?? TONE.MUTED;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

export const priorityLabel = (p: string) => (p === 'NOT_SURE' ? 'NOT SURE' : p);

export const PRIORITY_HEX: Record<string, string> = {
  HIGH: '#FF6B5A', MEDIUM: '#FBBF24', LOW: '#8B9099', NOT_SURE: '#C084FC',
};
