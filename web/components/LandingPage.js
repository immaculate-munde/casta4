'use client';

import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

const FLOOD_BG =
  'https://images.unsplash.com/photo-1527487834879-d9c99a33205d?auto=format&fit=crop&w=1920&q=80';

export default function LandingPage() {
  return (
    <div
      className="relative min-h-screen bg-cover bg-center bg-no-repeat text-white"
      style={{ backgroundImage: `url('${FLOOD_BG}')` }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#061018]/92 via-[#0a1628]/88 to-[#050a10]/96 dark:from-black/95 dark:via-[#050a10]/92 dark:to-black/98" />

      <header className="relative z-10 border-b border-white/25 bg-black/20 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 bg-kenya-coral" aria-hidden />
            <span className="font-serif text-xl font-semibold">Kenya Re</span>
            <span className="text-sm font-medium text-white/90">Casta4</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle variant="onDark" />
            <Link
              href="/signin"
              className="rounded-md bg-kenya-coral px-5 py-2.5 text-sm font-bold text-white shadow-lg ring-2 ring-white/40 transition hover:bg-[#a82828] hover:ring-white/60"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 py-16 md:py-24">
        <section className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-[#aecbfa]">AI4I Hackathon 2026</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight text-white drop-shadow-sm md:text-5xl">
            Flood catastrophe modelling meets document intelligence
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-white/95">
            Dynamic exposure maps for any region CSV, plus ReAgent — underwriter chat grounded on policies, treaties,
            and claim files. Open the assistant from the bot in the corner on any signed-in page.
          </p>
          <Link
            href="/signin"
            className="mt-8 inline-block rounded-md bg-kenya-coral px-8 py-3.5 text-base font-bold text-white shadow-xl ring-2 ring-white/50 transition hover:bg-[#a82828] hover:ring-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Sign in
          </Link>
        </section>

        <section className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            { title: 'Catastrophe desk', body: 'Map, tiers, and rich location dossiers when you select a pin.' },
            { title: 'Operations dashboard', body: 'Claims KPIs and flood scenarios from live API data.' },
            { title: 'ReAgent chat', body: 'Sidebar history, full-screen toggle, document source tags.' },
          ].map((card) => (
            <article
              key={card.title}
              className="rounded-sm border border-white/35 bg-black/45 p-5 shadow-lg backdrop-blur-md"
            >
              <h2 className="font-serif text-lg font-semibold text-white">{card.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/92">{card.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
