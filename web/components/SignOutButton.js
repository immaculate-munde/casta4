'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignOutButton({ className = '' }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    await fetch('/api/auth/session', { method: 'DELETE' });
    router.push('/');
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} disabled={loading} className={className}>
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
