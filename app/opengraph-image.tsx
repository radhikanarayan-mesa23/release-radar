import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Release Radar — security fixes and breaking changes first, every Monday 08:00 IST';

/** Link preview for Slack, WhatsApp and the submission form. */
export default function OgImage() {
  const chip = (color: string) => ({
    display: 'flex', alignItems: 'center', gap: 10, color,
    fontSize: 26, border: `2px solid ${color}44`, borderRadius: 999,
    padding: '8px 20px', background: `${color}1A`,
  });
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: 72, background: '#121110', color: '#E7E2DC',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg,#F97316,#FBBF24)',
          }}>
            <div style={{ width: 18, height: 18, borderRadius: 999, background: '#121110' }} />
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, color: '#F97316' }}>Release Radar</div>
        </div>

        <div style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.1, marginTop: 36, letterSpacing: -1 }}>
          Security fixes and breaking
        </div>
        <div style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>
          changes first — every Monday.
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 40 }}>
          <div style={chip('#FF6B5A')}>SECURITY</div>
          <div style={chip('#FBBF24')}>BREAKING</div>
          <div style={chip('#8B9099')}>ROUTINE</div>
        </div>

        <div style={{ fontSize: 26, color: '#9A918A', marginTop: 44 }}>
          24 public repos · GitHub REST API · Gemini Flash · Neon · Vercel
        </div>
      </div>
    ),
    size,
  );
}
