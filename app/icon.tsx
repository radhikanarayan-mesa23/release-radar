import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** Radar dot on the brand gradient — generated, so there is no binary to keep in sync. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg,#F97316,#FBBF24)', borderRadius: 8,
        }}
      >
        <div style={{ width: 11, height: 11, borderRadius: 999, background: '#121110' }} />
      </div>
    ),
    size,
  );
}
