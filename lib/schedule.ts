/** Next Monday 08:00 IST, printed in IST. Cron runs 02:30 UTC Monday. */
export function nextMondayRun(now = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(2, 30, 0, 0);
  const dow = d.getUTCDay(); // 1 = Monday
  let add = (1 - dow + 7) % 7;
  if (add === 0 && d.getTime() <= now.getTime()) add = 7;
  d.setUTCDate(d.getUTCDate() + add);
  return `${d.toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })} IST`;
}


/** Time-of-day greeting in IST, computed server-side so SSR and client agree. */
export function greetingIST(name = 'Keerthi', now = new Date()): { hello: string; when: string } {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false,
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  const hello =
    hour < 5 ? `Still up, ${name}?` :
    hour < 12 ? `Good morning, ${name}` :
    hour < 17 ? `Good afternoon, ${name}` :
    `Good evening, ${name}`;
  return { hello, when: `${parts.weekday}, ${parts.day} ${parts.month}` };
}
