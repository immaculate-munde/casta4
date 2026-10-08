'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import SignOutButton from '@/components/SignOutButton';
import ThemeToggle from '@/components/ThemeToggle';
import EventLossTable from '@/components/EventLossTable';
import { useWorkspaceFormat } from '@/components/WorkspaceFormatProvider';
import { fetchRagJson } from '@/lib/api';

function StatusBadge({ status }) {
  const styles = {
    Settled: 'bg-[#e4f5ee] text-kenya-green',
    Open: 'bg-[#e8eef8] text-kenya-blue',
    'Under Review': 'bg-[#fdf4e3] text-kenya-watch',
  };
  return (
    <span
      className={`inline-block rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles[status] || styles.Open}`}
    >
      {status}
    </span>
  );
}

function Sparkbar({ value, max, colour }) {
  const w = max > 0 ? Math.max(4, (value / max) * 100) : 4;
  return (
    <span className="mt-1 block h-1.5 w-full bg-kenya-line">
      <span className="block h-full transition-all" style={{ width: `${w}%`, background: colour }} />
    </span>
  );
}

export default function Dashboard({ embedded = false }) {
  const { formatMoney, formatMoneyCompact, formatPct } = useWorkspaceFormat();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRagJson('/api/dashboard')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const claims = data?.claims;
  const flood = data?.flood;
  const maxHousingTiv = flood ? Math.max(...(flood.by_housing || []).map((h) => h.tiv_kes)) : 1;

  return (
    <div className={`bg-kenya-surface text-sm text-kenya-ink ${embedded ? 'min-h-full' : 'min-h-screen'}`}>
      {!embedded ? (
        <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b-[3px] border-kenya-coral bg-kenya-navy px-6">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-5 w-2 shrink-0 bg-kenya-coral" aria-hidden />
            <span className="font-serif text-xl font-semibold tracking-tight text-white">Kenya Re</span>
            <span className="border-l border-white/35 pl-2.5 text-xs font-medium text-white/85">ReAgent AI</span>
          </div>
          <nav className="flex items-center gap-4 text-sm font-medium text-white/90">
            <Link href="/" className="hover:text-white">
              Home
            </Link>
            <Link href="/map" className="hover:text-white">
              Flood desk
            </Link>
            <ThemeToggle variant="onDark" />
            <SignOutButton className="text-xs text-white/80 hover:text-white" />
          </nav>
        </header>
      ) : null}

      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-kenya-navy">Operations Dashboard</h1>
            <p className="mt-1 text-kenya-muted">
              Kenya Re · Reinsurance claims & catastrophe risk · Synthetic data
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-kenya-line bg-kenya-panel px-3 py-1 text-xs font-semibold text-kenya-green">
            <span className="h-2 w-2 rounded-full bg-kenya-green" />
            Live
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-sm border border-[#f0c0c0] bg-[#fdeaea] px-4 py-3 text-[#8a1f1f]">
            ⚠ Could not reach backend — start <code className="font-mono text-xs">node rag-server.js</code> on port
            3001.
            <br />
            <small className="opacity-80">{error}</small>
          </div>
        ) : null}

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            {
              label: 'Total Claims',
              value: claims ? claims.total_claims : '—',
              sub: claims ? `${claims.settled} settled` : 'loading…',
              accent: '',
            },
            {
              label: 'Total Claimed',
              value: claims ? formatMoneyCompact.format(claims.total_claimed_kes) : '—',
              sub: claims ? `${formatMoneyCompact.format(claims.total_settled_kes)} settled` : 'loading…',
              accent: 'border-l-4 border-l-kenya-blue',
            },
            {
              label: 'Flagged for Review',
              value: claims ? claims.flagged_for_review : '—',
              sub: 'anomaly indicators',
              accent: 'border-l-4 border-l-kenya-watch',
            },
            {
              label: 'Portfolio TIV',
              value: flood ? formatMoneyCompact.format(flood.total_tiv_kes) : '—',
              sub: flood ? `${flood.location_count} locations` : 'loading…',
              accent: '',
            },
            {
              label: flood?.cat_engine_loaded ? '100-yr gross (CAT)' : 'Team EP (≥10 yr)',
              value: flood?.cat_100yr?.gross_loss_kes
                ? formatMoneyCompact.format(flood.cat_100yr.gross_loss_kes)
                : flood?.moderate_loss_kes != null
                  ? formatMoneyCompact.format(flood.moderate_loss_kes)
                  : '—',
              sub: flood?.cat_engine_loaded
                ? `Linus engine · AI ${flood.cat_use_ai ? 'on' : 'off'} · ${flood.cat_hotspot_assets ?? 0} hotspot assets`
                : flood?.team_ep_loaded
                  ? 'From uploaded EP CSV'
                  : 'Start CAT service or upload EP',
              accent: 'border-l-4 border-l-kenya-coral',
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className={`rounded-sm border-2 border-kenya-line bg-kenya-panel p-4 shadow-sm ${kpi.accent}`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-kenya-ink/70">{kpi.label}</span>
              <div className="mt-1 font-serif text-2xl font-semibold text-kenya-navy">{kpi.value}</div>
              <span className="text-xs text-kenya-muted">{kpi.sub}</span>
            </div>
          ))}
        </section>

        {flood?.cat_engine_loaded ? (
          <section className="mb-6 space-y-4">
            <div className="rounded-sm border border-kenya-line bg-[#e8eef8] px-4 py-3 text-xs text-kenya-navy dark:bg-[#25282c] dark:text-[#e8eaed]">
              AI drainage rectifier:{' '}
              <strong>
                {flood.cat_hotspot_assets ?? 0}/{flood.location_count ?? '—'}
              </strong>{' '}
              assets in hotspot corridors
              {flood.cat_ai_uplift_gross_pct != null ? (
                <>
                  {' '}
                  · 100-yr gross uplift vs baseline:{' '}
                  <strong>
                    {flood.cat_ai_uplift_gross_pct >= 0 ? '+' : ''}
                    {flood.cat_ai_uplift_gross_pct.toFixed(1)}%
                  </strong>
                </>
              ) : null}
              . Adjust controls in <Link href="/settings" className="font-semibold text-kenya-blue hover:underline">Settings</Link>.
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: '100-yr ground-up (CAT)',
                  value: formatMoneyCompact.format(flood.cat_100yr?.ground_up_loss_kes ?? 0),
                },
                {
                  label: '100-yr gross (CAT)',
                  value: formatMoneyCompact.format(flood.cat_100yr?.gross_loss_kes ?? 0),
                },
                {
                  label: '100-yr net (CAT)',
                  value: formatMoneyCompact.format(flood.cat_100yr?.net_loss_kes ?? 0),
                },
                {
                  label: 'Portfolio TSI',
                  value: formatMoneyCompact.format(flood.total_tiv_kes ?? 0),
                  sub: `${flood.location_count} locations`,
                },
              ].map((k) => (
                <div key={k.label} className="rounded-sm border-2 border-kenya-line bg-kenya-panel p-4 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-kenya-ink/70">{k.label}</span>
                  <div className="mt-1 font-serif text-xl font-semibold text-kenya-navy">{k.value}</div>
                  {k.sub ? <span className="text-xs text-kenya-muted">{k.sub}</span> : null}
                </div>
              ))}
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-serif text-lg font-semibold text-kenya-navy">Event loss table (CAT)</h2>
                <Link href="/ep-curve" className="text-xs font-semibold text-kenya-blue hover:underline">
                  EP curve & charts →
                </Link>
              </div>
              <EventLossTable
                elt={flood.cat_elt}
                caption={`AI rectifier ${flood.cat_use_ai ? 'on' : 'off'} · same engine as Streamlit Tab 1`}
              />
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-12">
          <section className="rounded-sm border border-kenya-line bg-kenya-panel p-5 shadow-sm lg:col-span-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold text-kenya-navy">Active Claim</h2>
              <StatusBadge status={claims?.current_claim?.status || 'Open'} />
            </div>
            {claims?.current_claim ? (
              <>
                <p className="font-mono text-xs text-kenya-muted">{claims.current_claim.claim_id}</p>
                <p className="mt-1 font-semibold">{claims.current_claim.insured}</p>
                <div className="my-3 font-serif text-3xl font-semibold text-kenya-navy">
                  {formatMoney.format(claims.current_claim.claimed_amount_kes)}
                </div>
                <dl className="grid grid-cols-2 gap-3 border-t border-kenya-line pt-3 text-xs">
                  <div>
                    <dt className="text-kenya-muted">Peril</dt>
                    <dd className="font-semibold">{claims.current_claim.peril}</dd>
                  </div>
                  <div>
                    <dt className="text-kenya-muted">Cause</dt>
                    <dd
                      className={`font-semibold ${claims.current_claim.cause_confirmed === 'Open - current claim' ? 'text-kenya-watch' : ''}`}
                    >
                      {claims.current_claim.cause_confirmed || 'Under investigation'}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 text-sm text-kenya-muted">
                  Use the <strong className="text-kenya-navy">ReAgent bot</strong> (bottom-right) for document Q&amp;A.
                </p>
              </>
            ) : (
              <p className="text-kenya-muted">{error ? 'Backend offline' : 'Loading claim data…'}</p>
            )}
          </section>

          <section className="overflow-hidden rounded-sm border border-kenya-line bg-kenya-panel shadow-sm lg:col-span-8">
            <div className="flex items-center justify-between border-b border-kenya-line px-5 py-3">
              <h2 className="font-serif text-lg font-semibold text-kenya-navy">Recent Claims</h2>
              <span className="text-xs text-kenya-muted">ReAgent bot →</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-kenya-line bg-[#f8f9fb] text-[10px] font-bold uppercase tracking-wider text-kenya-muted">
                    <th className="px-4 py-2">Claim ID</th>
                    <th className="px-4 py-2">Insured</th>
                    <th className="px-4 py-2">Peril</th>
                    <th className="px-4 py-2">Claimed</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {claims?.recent_claims?.length ? (
                    claims.recent_claims.map((c) => (
                      <tr key={c.claim_id} className="border-b border-kenya-line last:border-0">
                        <td className="px-4 py-2.5 font-mono text-xs">{c.claim_id}</td>
                        <td className="px-4 py-2.5">{c.insured}</td>
                        <td className="px-4 py-2.5">{c.peril}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatMoneyCompact.format(c.claimed_amount_kes)}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={c.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-kenya-muted">
                        {error ? 'Backend offline' : 'Loading…'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-sm border border-kenya-line bg-kenya-panel p-5 shadow-sm lg:col-span-4">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold text-kenya-navy">Top Flood Risk Locations</h2>
              <Link href="/map" className="text-xs font-semibold text-kenya-blue hover:underline">
                Open map →
              </Link>
            </div>
            <p className="mb-3 text-xs text-kenya-muted">Highest hazard — moderate tier (CSV scores)</p>
            <div className="space-y-2">
              {flood?.top_risk_locations?.length ? (
                flood.top_risk_locations.map((loc, i) => (
                  <div
                    key={loc.loc_id}
                    className="flex items-center gap-3 border-b border-kenya-line py-2 last:border-0"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-kenya-navy text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <strong className="block text-xs">{loc.loc_id}</strong>
                      <span className="text-[11px] text-kenya-muted">{loc.housing_label}</span>
                    </div>
                    <div className="text-right text-xs">
                      <span className="font-bold text-kenya-coral">{Math.round(loc.hazard * 100)}%</span>
                      <span className="block text-kenya-muted">{formatMoneyCompact.format(loc.tiv_kes)} TIV</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-kenya-muted">{error ? 'Backend offline' : 'Loading…'}</p>
              )}
            </div>
          </section>

          <section className="rounded-sm border border-kenya-line bg-kenya-panel p-5 shadow-sm lg:col-span-4">
            <h2 className="font-serif text-lg font-semibold text-kenya-navy">Exposure by Construction</h2>
            <p className="mb-3 text-xs text-kenya-muted">Share of total insured value</p>
            <div className="space-y-3">
              {flood?.by_housing?.length ? (
                flood.by_housing.map((h) => (
                  <div key={h.housing_class}>
                    <div className="flex flex-wrap items-baseline justify-between gap-1 text-xs">
                      <span className="font-semibold">{h.label}</span>
                      <span className="text-kenya-muted">{h.count} locations</span>
                      <span className="font-semibold tabular-nums">{formatMoneyCompact.format(h.tiv_kes)}</span>
                    </div>
                    <Sparkbar
                      value={h.tiv_kes}
                      max={maxHousingTiv}
                      colour={
                        h.housing_class === 'informal_iron_sheet'
                          ? '#e24b4b'
                          : h.housing_class === 'semi_permanent'
                            ? '#c4a15a'
                            : '#2457a6'
                      }
                    />
                  </div>
                ))
              ) : (
                <p className="text-kenya-muted">{error ? 'Backend offline' : 'Loading…'}</p>
              )}
            </div>
          </section>

          <section className="rounded-sm border border-kenya-line bg-kenya-panel p-5 shadow-sm lg:col-span-4">
            <h2 className="mb-4 font-serif text-lg font-semibold text-kenya-navy">Claims by Status</h2>
            {claims ? (
              <div className="space-y-3">
                {[
                  { label: 'Settled', value: claims.settled, bar: 'bg-kenya-green' },
                  { label: 'Open', value: claims.open, bar: 'bg-kenya-blue' },
                  { label: 'Under Review', value: claims.under_review, bar: 'bg-kenya-watch' },
                ].map((item) => (
                  <div key={item.label} className="grid grid-cols-[88px_1fr_28px] items-center gap-2 text-xs">
                    <span className="text-kenya-muted">{item.label}</span>
                    <div className="h-2 bg-kenya-line">
                      <div
                        className={`h-full ${item.bar}`}
                        style={{ width: `${(item.value / claims.total_claims) * 100}%` }}
                      />
                    </div>
                    <span className="text-right font-semibold tabular-nums">{item.value}</span>
                  </div>
                ))}
                <p className="border-t border-kenya-line pt-3 text-xs text-kenya-muted">
                  Settlement ratio:{' '}
                  <strong className="text-kenya-navy">
                    {formatPct.format(claims.total_settled_kes / claims.total_claimed_kes)}
                  </strong>
                </p>
              </div>
            ) : (
              <p className="text-kenya-muted">{error ? 'Backend offline' : 'Loading…'}</p>
            )}
          </section>

          <section className="rounded-sm border border-kenya-watch/40 bg-[#fdf4e3] p-5 shadow-sm lg:col-span-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold text-kenya-navy">Severe Flood Scenario</h2>
              <span className="rounded-sm bg-kenya-watch px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                1-in-100 yr
              </span>
            </div>
            <div className="font-serif text-3xl font-semibold text-kenya-navy">
              {flood?.severe_loss_kes != null ? formatMoneyCompact.format(flood.severe_loss_kes) : '—'}
            </div>
            <p className="mt-1 text-xs text-kenya-muted">
              Team EP at severe return period · {flood ? flood.location_count : '—'} locations on map
            </p>
            <Link href="/map" className="mt-4 inline-block text-sm font-bold text-kenya-navy hover:underline">
              Model full scenario →
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
