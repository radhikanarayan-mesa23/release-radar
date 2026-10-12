/**
 * Telegram alerts for new HIGH security releases.
 *
 * Email is the record; Telegram is the interrupt. The brief's whole origin is a
 * security patch that sat unread for 11 days, and an inbox is exactly where that
 * happens — so a genuinely new HIGH security item also pushes to her phone.
 *
 * Never throws: an alert failing must never fail a digest run.
 */
const API = 'https://api.telegram.org';

export function telegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** Telegram's MarkdownV2 escapes a long list of punctuation. */
function esc(s: unknown): string {
  return String(s ?? '').replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}

async function send(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat_id = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat_id) return { ok: false, error: 'Telegram not configured' };
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id, text, parse_mode: 'MarkdownV2', disable_web_page_preview: true,
      }),
    });
    const json = (await res.json()) as { ok: boolean; description?: string };
    return json.ok ? { ok: true } : { ok: false, error: json.description };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface AlertItem {
  repo: string; tag: string; url: string; why: string; flags: string[];
}

/** Fired only for releases seen for the FIRST time, so she is never pinged twice. */
export async function alertNewSecurity(items: AlertItem[]): Promise<{ ok: boolean; error?: string }> {
  if (!items.length) return { ok: true };
  const app = process.env.APP_URL || '';
  const n = items.length;

  const body = items.slice(0, 8).map((i) =>
    `\u{1F534} *${esc(i.repo)}* \`${esc(i.tag)}\`\n` +
    `${esc(i.why)}\n` +
    `[Release notes](${i.url})`,
  ).join('\n\n');

  const more = n > 8 ? `\n\n_${esc(`and ${n - 8} more`)}_` : '';
  const footer = app ? `\n\n[Open the dashboard](${app}/dashboard)` : '';

  return send(
    `*${esc(`${n} new security release${n > 1 ? 's' : ''}`)}*\n` +
    `${esc('Release Radar · needs attention now')}\n\n${body}${more}${footer}`,
  );
}

/** Used by the setup check on /status. */
export async function telegramPing(): Promise<{ ok: boolean; error?: string }> {
  return send(`*${esc('Release Radar connected')}*\n${esc('Security alerts will arrive here.')}`);
}
