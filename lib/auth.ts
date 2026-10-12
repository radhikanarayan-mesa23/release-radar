// Public read, admin write. Passcode -> sha256 -> httpOnly cookie.
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'rr_admin';

export function tokenFor(passcode: string): string {
  return createHash('sha256').update(`rr:${passcode}`).digest('hex');
}

export async function isAdmin(): Promise<boolean> {
  const pc = process.env.ADMIN_PASSCODE;
  if (!pc) return false;
  const jar = await cookies();
  return jar.get(ADMIN_COOKIE)?.value === tokenFor(pc);
}

/** Returns a 401 Response when the caller is not an admin, else null. */
export async function requireAdmin(): Promise<Response | null> {
  if (await isAdmin()) return null;
  return Response.json({ error: 'Admin passcode required' }, { status: 401 });
}

export function checkCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h = req.headers.get('authorization') ?? '';
  return h === `Bearer ${secret}`;
}
