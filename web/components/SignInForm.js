'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import ThemeToggle from '@/components/ThemeToggle';

export default function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '';

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign-in failed');

      const dest =
        nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : data.redirect;
      router.push(dest);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-kenya-surface">
      <header className="flex items-center justify-between gap-2 border-b border-kenya-line bg-kenya-panel px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <Link href="/" className="font-semibold text-kenya-blue hover:underline">
          ← Back to home
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-lg px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10">
        <h1 className="font-serif text-2xl font-semibold text-kenya-navy sm:text-3xl">Sign in</h1>
        <p className="mt-2 text-sm font-medium text-kenya-muted">
          Demo workspace sign-in. You land on the flood desk first; the operations dashboard is in the nav. Production can replace
          this with your IdP or API token exchange.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5 rounded-sm border-2 border-kenya-line bg-kenya-panel p-4 shadow-md sm:p-6">
          <label className="block text-sm">
            <span className="font-semibold text-kenya-navy">Work email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@kenyare.co.ke"
              className="mt-1 w-full rounded-md border-2 border-kenya-line bg-kenya-panel px-3 py-2 text-kenya-ink outline-none focus:border-kenya-blue focus:ring-2 focus:ring-kenya-blue/30"
            />
          </label>

          <label className="block text-sm">
            <span className="font-semibold text-kenya-navy">Display name (optional)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Analyst"
              className="mt-1 w-full rounded-md border-2 border-kenya-line bg-kenya-panel px-3 py-2 text-kenya-ink outline-none focus:border-kenya-blue focus:ring-2 focus:ring-kenya-blue/30"
            />
          </label>

          {error ? <p className="text-sm text-kenya-coral">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full border-2 border-[#9b1c1c] bg-[#c93434] py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-[#a82828] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kenya-blue"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  );
}
