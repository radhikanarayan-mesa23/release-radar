import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, isAdmin, tokenFor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Public read, admin write (spec §2). The gate is real — every write route calls
 * requireAdmin() — but this deployment sets DEMO_UNLOCK so a reviewer can unlock
 * in one click instead of hunting for a passcode. Unset DEMO_UNLOCK and this
 * becomes an ordinary passcode form.
 */
export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const admin = await isAdmin();
  const { e } = await searchParams;
  const demo = process.env.DEMO_UNLOCK === 'true' ? (process.env.ADMIN_PASSCODE ?? '') : '';

  async function login(form: FormData) {
    'use server';
    const pc = process.env.ADMIN_PASSCODE;
    if (!pc || String(form.get('passcode') ?? '') !== pc) redirect('/login?e=1');
    (await cookies()).set(ADMIN_COOKIE, tokenFor(pc), {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
      path: '/', maxAge: 60 * 60 * 24 * 30,
    });
    redirect('/');
  }

  async function logout() {
    'use server';
    (await cookies()).delete(ADMIN_COOKIE);
    redirect('/');
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card p-6">
        <h1 className="text-lg font-semibold">{admin ? 'Admin unlocked' : 'Unlock admin actions'}</h1>
        <p className="mt-2 text-sm text-muted">
          Reading is always open — the dashboard, every tab, <code>/quality</code> and <code>/status</code> need
          nothing. Unlocking adds the write actions: run a digest, add or remove repos, assign work, change
          status and download reports.
        </p>

        {admin ? (
          <form action={logout} className="mt-5">
            <button className="w-full rounded-xl border border-line bg-ink3 px-3 py-2.5 text-sm hover:bg-ink2">
              Lock again
            </button>
          </form>
        ) : (
          <form action={login} className="mt-5 space-y-3">
            <input
              name="passcode" type={demo ? 'text' : 'password'} required
              defaultValue={demo} placeholder="Passcode" autoComplete="off"
              className="w-full rounded-xl border border-[#4A4039] bg-ink0 px-3 py-2.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button className="glow w-full rounded-xl px-3 py-2.5 text-sm font-semibold text-ink0">
              {demo ? 'Unlock admin — one click' : 'Unlock'}
            </button>
            {demo && (
              <p className="text-xs text-muted">
                Demo access: the passcode is already filled in, just press the button.
              </p>
            )}
            {e && <p className="text-sm text-high">Wrong passcode.</p>}
          </form>
        )}
      </div>
    </div>
  );
}
