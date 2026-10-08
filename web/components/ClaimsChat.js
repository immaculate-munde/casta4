'use client';

import Link from 'next/link';
import { useState } from 'react';
import ReAgentBotLauncher from '@/components/ReAgentBotLauncher';
import UnderwriterChat from '@/components/UnderwriterChat';

export default function ClaimsChat() {
  const [started, setStarted] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-kenya-surface font-sans text-[#1c2430]">
      <header className="flex items-center justify-between border-b border-kenya-line bg-white px-4 py-3">
        <Link href="/" className="font-semibold text-kenya-blue hover:underline">
          ← Home
        </Link>
        <span className="text-sm font-semibold text-kenya-navy">ReAgent AI · Underwriter chat</span>
        <Link href="/map" className="text-sm font-semibold text-kenya-blue hover:underline">
          Flood desk
        </Link>
      </header>

      <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 pb-28">
        {!started ? (
          <section className="flex flex-1 flex-col justify-center py-8">
            <h1 className="font-serif text-2xl font-bold tracking-tight text-kenya-navy">Underwriter chat</h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-kenya-muted">
              Hover the ReAgent assistant in the bottom-right corner, then click to start. You&apos;ll get coverage,
              treaty, and claim answers with short source tags on each reply.
            </p>
            <p className="mt-6 text-xs text-kenya-muted">
              Tip: the same agent appears on the dashboard and flood desk — click it anytime to open this chat.
            </p>
          </section>
        ) : (
          <UnderwriterChat
            className="min-h-[480px] flex-1 overflow-hidden rounded-xl border border-kenya-line bg-white shadow-sm"
            title="ReAgent AI"
            hint="Each reply lists ingested sources (Policy · Treaty · Claim · Report)."
            placeholder="e.g. What does the treaty say about claim referral?"
          />
        )}

        {!started ? (
          <ReAgentBotLauncher onActivate={() => setStarted(true)} />
        ) : null}
      </main>
    </div>
  );
}
