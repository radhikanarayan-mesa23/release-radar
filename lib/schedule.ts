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
