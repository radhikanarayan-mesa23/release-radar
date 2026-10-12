import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, isAdmin, tokenFor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const admin = await isAdmin();
  const { e } = await searchParams;

  async function login(form: FormData) {
    'use server';
    const pc = process.env.ADMIN_PASSCODE;
    const given = String(form.get('passcode') ?? '');
    if (!pc || given !== pc) redirect('/login?e=1');
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
    <div className="mx-auto max-w-sm">
      <div className="card p-6">
        <h1 className="text-lg font-semibold">{admin ? 'You are logged in' : 'Admin log in'}</h1>
        <p className="mt-2 text-sm text-muted">
          Anyone can read the digest. The passcode unlocks runs, repo edits, assignment and reports.
        </p>
        {admin ? (
          <form action={logout} className="mt-4">
            <button className="w-full rounded-lg border border-line px-3 py-2 text-sm">Log out</button>
          </form>
        ) : (
          <form action={login} className="mt-4 space-y-3">
            <input name="passcode" type="password" required placeholder="Passcode" autoComplete="current-password"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
            <button className="w-full rounded-lg bg-ink px-3 py-2 text-sm text-white">Log in</button>
            {e && <p className="text-sm text-high">Wrong passcode.</p>}
          </form>
        )}
      </div>
    </div>
  );
}
