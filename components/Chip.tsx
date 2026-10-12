const TONE: Record<string, string> = {
  HIGH: 'border-high text-high',
  MEDIUM: 'border-medium text-medium',
  LOW: 'border-low text-low',
  NOT_SURE: 'border-notsure text-notsure',
  SECURITY: 'border-high text-high',
  BREAKING: 'border-medium text-medium',
  MAJOR: 'border-low text-low',
  'PRE-RELEASE': 'border-low text-low',
  muted: 'border-line text-muted',
};

/** Always carries a text label: colour is never the only signal. */
export default function Chip({ label, tone }: { label: string; tone?: string }) {
  const key = (tone ?? label).toUpperCase().replace(/ /g, '_');
  const cls = TONE[key] ?? TONE[tone ?? ''] ?? TONE.muted;
  return (
    <span className={`inline-block rounded-full border px-2 py-[1px] text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

export function priorityLabel(p: string) {
  return p === 'NOT_SURE' ? 'NOT SURE' : p;
}
