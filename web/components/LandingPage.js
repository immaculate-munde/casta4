'use client';

import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { btnPrimary, btnSecondary } from '@/lib/buttons';

const CAPABILITIES = [
  {
    title: 'Flood risk & exposure',
    body: 'Nairobi flood book on the map — hazard scenarios, location-level loss context, and portfolio exceedance curves for pricing and accumulation.',
  },
  {
    title: 'Claims & operations',
    body: 'Live claims KPIs, severe-scenario indicators, and catastrophe metrics so teams can align loss experience with forward-looking flood risk.',
  },
  {
    title: 'Underwriter assistant',
    body: 'ReAgent supports financial and technical questions on policies, treaties, and claims — decision support alongside the CAT workspace.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-kenya-surface font-sans text-kenya-ink">
      <div className="border-t-4 border-kenya-coral bg-kenya-panel shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="h-[22px] w-2.5 shrink-0 bg-kenya-coral" aria-hidden />
            <span className="font-serif text-xl font-semibold text-kenya-navy sm:text-2xl">Kenya Re</span>
            <span className="truncate text-sm font-medium text-kenya-muted">Casta4 workspace</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <ThemeToggle />
            <Link href="/signin" className={`${btnPrimary} px-5 py-2 no-underline`}>
              Sign in
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 pb-[max(5rem,env(safe-area-inset-bottom))] pt-10 sm:px-6 sm:pb-20 sm:pt-12 md:pt-16">
        <section className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-kenya-blue">AI4I Hackathon 2026 · Nairobi</p>
          <h1 className="mt-3 font-serif text-[1.75rem] font-semibold leading-tight text-kenya-navy sm:text-4xl md:text-[2.65rem] md:leading-[1.15]">
            Better financial decisions on flood risk and claims
          </h1>
          <p className="mt-5 text-base leading-relaxed text-kenya-muted md:text-lg">
            Casta4 helps underwriters and reinsurance analysts judge{' '}
            <strong className="font-semibold text-kenya-navy">Nairobi urban flood</strong> exposure, modelled losses,
            and claims context in one Kenya Re workspace — from the map and EP curve through operations dashboards.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/signin"
              className={`${btnPrimary} inline-flex w-full justify-center !border-kenya-coral !bg-kenya-coral px-8 py-3 text-base shadow-sm ring-2 ring-kenya-coral/30 hover:!bg-[#a82828] sm:w-auto`}
            >
              Sign in to workspace
            </Link>
            <a href="#capabilities" className={`${btnSecondary} inline-flex w-full justify-center px-6 py-3 sm:w-auto`}>
              What you can do
            </a>
          </div>
        </section>

        <section id="capabilities" className="mt-14 grid gap-4 md:grid-cols-3">
          {CAPABILITIES.map((card) => (
            <article
              key={card.title}
              className="border border-kenya-line bg-kenya-panel p-5 shadow-sm transition hover:border-[#0f2d52]/40"
            >
              <span className="inline-block h-1 w-10 bg-kenya-coral" aria-hidden />
              <h2 className="mt-3 font-serif text-lg font-semibold text-kenya-navy">{card.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-kenya-muted">{card.body}</p>
            </article>
          ))}
        </section>

        <p className="mt-10 max-w-xl text-[11px] leading-relaxed text-kenya-muted">
          Demo environment for Kenya Re. Sign in with a work email to open the flood desk, operations view, and
          underwriter tools.
        </p>
      </main>
    </div>
  );
}
