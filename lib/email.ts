// Resend via REST. One inline-styled template family. Never throws into callers.
const C = {
  HIGH: '#DC2626', MEDIUM: '#D97706', LOW: '#64748B', NOT_SURE: '#7C3AED',
  text: '#111827', muted: '#6B7280', border: '#E7E7E2', bg: '#F6F6F3',
};

export interface SendResult { ok: boolean; to: string; fellBackTo?: string; error?: string }

async function post(to: string, subject: string, html: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Release Radar <onboarding@resend.dev>';
  if (!key) return { ok: false, to, error: 'RESEND_API_KEY not set' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, to, error: `${res.status} ${body.slice(0, 200)}` };
    }
    return { ok: true, to };
  } catch (e) {
    return { ok: false, to, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Send to `to`; if that fails (Resend only mails the account owner until a
 * domain is verified), re-send to DIGEST_TO marked "(intended for X)".
 * Never fails the caller's action.
 */
export async function sendWithFallback(
  to: string, subject: string, html: string, intendedFor: string,
): Promise<SendResult> {
  const first = await post(to, subject, html);
  if (first.ok) return first;
  const fb = process.env.DIGEST_TO;
  if (!fb || fb === to) return first;
  const second = await post(fb, `${subject} (intended for ${intendedFor})`,
    `<p style="font:13px system-ui;color:${C.muted}">Could not deliver to <b>${esc(to)}</b> (${esc(first.error ?? '')}). Forwarded to you.</p>${html}`);
  return second.ok
    ? { ok: true, to, fellBackTo: fb, error: first.error }
    : { ok: false, to, error: `${first.error} | fallback: ${second.error}` };
}

export const sendTo = post;

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export function shell(title: string, inner: string): string {
  const url = process.env.APP_URL || '';
  return `<div style="background:${C.bg};padding:24px;font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:${C.text}">
  <div style="max-width:640px;margin:0 auto">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${C.muted};margin-bottom:8px">Release Radar</div>
    <h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
    ${inner}
    <p style="margin-top:24px;font-size:13px">
      ${url ? `<a href="${esc(url)}" style="color:#111827">Open dashboard</a> · <a href="${esc(url)}/report" style="color:#111827">Download report</a>` : ''}
    </p>
  </div></div>`;
}

export function chip(label: string, color: string): string {
  return `<span style="display:inline-block;border:1px solid ${color};color:${color};border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600;margin-right:4px">${esc(label)}</span>`;
}

export interface MailItem {
  repo: string; tag: string; url: string; priority: string; flags: string[];
  why: string; summary: string[]; published_at?: string | null;
}

export function card(i: MailItem): string {
  const color = C[i.priority as keyof typeof C] ?? C.LOW;
  return `<div style="background:#fff;border:1px solid ${C.border};border-radius:12px;padding:14px;margin-bottom:10px">
    <div style="font-weight:600">${esc(i.repo)} <span style="color:${C.muted};font-weight:400">${esc(i.tag)}</span></div>
    <div style="margin:6px 0">${chip(i.priority.replace('_', ' '), color)}${i.flags.map((f) => chip(f, C.muted)).join('')}</div>
    <div style="color:${C.muted};font-size:13px;margin-bottom:6px">Why: ${esc(i.why)}</div>
    <ul style="margin:0 0 8px 18px;padding:0">${i.summary.slice(0, 2).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    <a href="${esc(i.url)}" style="font-size:13px;color:#111827">View release notes →</a>
  </div>`;
}

export function briefingBlock(briefing: { priority: string; text: string }[]): string {
  if (!briefing.length) return '';
  return `<div style="background:#fff;border:1px solid ${C.border};border-radius:12px;padding:14px;margin-bottom:16px">
    <ul style="margin:0 0 0 18px;padding:0">${briefing
      .map((b) => `<li><b style="color:${C[b.priority as keyof typeof C] ?? C.LOW}">${esc(b.priority)}</b> ${esc(b.text)}</li>`)
      .join('')}</ul></div>`;
}

export const COLORS = C;
