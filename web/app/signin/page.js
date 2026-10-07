import { Suspense } from 'react';
import SignInForm from '@/components/SignInForm';

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-kenya-surface p-8 text-kenya-muted">Loading…</div>}>
      <SignInForm />
    </Suspense>
  );
}
