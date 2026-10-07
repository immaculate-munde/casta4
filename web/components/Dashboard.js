'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchRagJson } from '@/lib/api';
import '@/styles/dashboard.css';

const kes = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const kesLong = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});
const pct = new Intl.NumberFormat('en-KE', {
  style: 'percent',
  maximumFractionDigits: 1,
});

function StatusBadge({ status }) {
  const map = {
    Settled: 'badge-settled',
    Open: 'badge-open',
    'Under Review': 'badge-review',
  };
  return <span className={`badge ${map[status] || 'badge-open'}`}>{status}</span>;
}

function Sparkbar({ value, max, colour }) {
  const w = max > 0 ? Math.max(4, (value / max) * 100) : 4;
  return (
    <span className="sparkbar-wrap">
      <span className="sparkbar-fill" style={{ width: `${w}%`, background: colour }} />
    </span>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRagJson('/api/dashboard')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const claims = data?.claims;
  const flood = data?.flood;

  const maxHousingTiv = flood
    ? Math.max(...(flood.by_housing || []).map((h) => h.tiv_kes))
    : 1;

  return (
    <div className="dash-root">
      {/* ── Top nav ── */}
      <header className="dash-nav">
        <div className="dash-nav-brand">
          <span className="dash-nav-ribbon" aria-hidden="true" />
          <span className="dash-nav-name">Kenya Re</span>
          <span className="dash-nav-sub">ReAgent AI</span>
        </div>
        <nav className="dash-nav-links">
          <Link href="/catastrophe">Flood desk</Link>
          <Link href="/chat" className="dash-nav-cta">Claims chat →</Link>
        </nav>
      </header>

      <div className="dash-body">
        {/* ── Page title ── */}
        <div className="dash-title-row">
          <div>
            <h1 className="dash-h1">Operations Dashboard</h1>
            <p className="dash-subtitle">
              Kenya Re · Reinsurance claims & catastrophe risk · Synthetic data
            </p>
          </div>
          <div className="dash-status-pill">
            <span className="dash-status-dot" />
            Live
          </div>
        </div>

        {error && (
          <div className="dash-error">
            ⚠ Could not reach backend — start <code>node rag-server.js</code> on port 3001.
            <br />
            <small>{error}</small>
          </div>
        )}

        {/* ── KPI row ── */}
        <section className="dash-kpi-row">
          <div className="kpi-card">
            <span className="kpi-label">Total Claims</span>
            <span className="kpi-value">{claims ? claims.total_claims : '—'}</span>
            <span className="kpi-sub">{claims ? `${claims.settled} settled` : 'loading…'}</span>
          </div>
          <div className="kpi-card kpi-accent">
            <span className="kpi-label">Total Claimed</span>
            <span className="kpi-value">{claims ? kes.format(claims.total_claimed_kes) : '—'}</span>
            <span className="kpi-sub">{claims ? `${kes.format(claims.total_settled_kes)} settled` : 'loading…'}</span>
          </div>
          <div className="kpi-card kpi-warn">
            <span className="kpi-label">Flagged for Review</span>
            <span className="kpi-value">{claims ? claims.flagged_for_review : '—'}</span>
            <span className="kpi-sub">anomaly indicators</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Portfolio TIV</span>
            <span className="kpi-value">{flood ? kes.format(flood.total_tiv_kes) : '—'}</span>
            <span className="kpi-sub">{flood ? `${flood.location_count} locations` : 'loading…'}</span>
          </div>
          <div className="kpi-card kpi-flood">
            <span className="kpi-label">Moderate Flood Loss</span>
            <span className="kpi-value">{flood ? kes.format(flood.moderate_loss_kes) : '—'}</span>
            <span className="kpi-sub">1-in-25 yr scenario</span>
          </div>
        </section>

        {/* ── Main grid ── */}
        <div className="dash-grid">

          {/* Current claim spotlight */}
          <section className="dash-card dash-card-spotlight">
            <div className="card-head">
              <h2>Active Claim</h2>
              <StatusBadge status={claims?.current_claim?.status || 'Open'} />
            </div>
            {claims?.current_claim ? (
              <>
                <p className="spotlight-id">{claims.current_claim.claim_id}</p>
                <p className="spotlight-insured">{claims.current_claim.insured}</p>
                <div className="spotlight-amount">
                  {kesLong.format(claims.current_claim.claimed_amount_kes)}
                </div>
                <dl className="spotlight-fields">
                  <div>
                    <dt>Peril</dt>
                    <dd>{claims.current_claim.peril}</dd>
                  </div>
                  <div>
                    <dt>Cause</dt>
                    <dd className={claims.current_claim.cause_confirmed === 'Open - current claim' ? 'text-warn' : ''}>
                      {claims.current_claim.cause_confirmed || 'Under investigation'}
                    </dd>
                  </div>
                </dl>
                <Link href="/chat" className="spotlight-cta">
                  Assess with ReAgent AI →
                </Link>
              </>
            ) : (
              <p className="dash-empty">Loading claim data…</p>
            )}
          </section>

          {/* Recent claims table */}
          <section className="dash-card dash-card-wide">
            <div className="card-head">
              <h2>Recent Claims</h2>
              <Link href="/chat" className="card-head-link">View all →</Link>
            </div>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Claim ID</th>
                  <th>Insured</th>
                  <th>Peril</th>
                  <th>Claimed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {claims?.recent_claims?.length ? (
                  claims.recent_claims.map((c) => (
                    <tr key={c.claim_id}>
                      <td className="td-id">{c.claim_id}</td>
                      <td>{c.insured}</td>
                      <td>{c.peril}</td>
                      <td className="td-num">{kes.format(c.claimed_amount_kes)}</td>
                      <td><StatusBadge status={c.status} /></td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="dash-empty">
                      {error ? 'Backend offline' : 'Loading…'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {/* Flood risk top locations */}
          <section className="dash-card">
            <div className="card-head">
              <h2>Top Flood Risk Locations</h2>
              <Link href="/catastrophe" className="card-head-link">Open map →</Link>
            </div>
            <p className="card-meta">Moderate scenario (1-in-25 yr)</p>
            <div className="risk-list">
              {flood?.top_risk_locations?.length ? (
                flood.top_risk_locations.map((loc, i) => (
                  <div key={loc.loc_id} className="risk-item">
                    <span className="risk-rank">{i + 1}</span>
                    <div className="risk-info">
                      <strong>{loc.loc_id}</strong>
                      <span>{loc.housing_label}</span>
                    </div>
                    <div className="risk-metrics">
                      <span className="risk-hazard-pct risk-high">
                        {Math.round(loc.hazard * 100)}%
                      </span>
                      <span className="risk-loss">{kes.format(loc.loss_kes)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="dash-empty">{error ? 'Backend offline' : 'Loading…'}</p>
              )}
            </div>
          </section>

          {/* Portfolio by housing class */}
          <section className="dash-card">
            <div className="card-head">
              <h2>Exposure by Construction</h2>
            </div>
            <p className="card-meta">Share of total insured value</p>
            <div className="housing-list">
              {flood?.by_housing?.length ? (
                flood.by_housing.map((h) => (
                  <div key={h.housing_class} className="housing-row">
                    <div className="housing-label-row">
                      <span>{h.label}</span>
                      <span className="housing-count">{h.count} locations</span>
                      <span className="housing-tiv">{kes.format(h.tiv_kes)}</span>
                    </div>
                    <Sparkbar
                      value={h.tiv_kes}
                      max={maxHousingTiv}
                      colour={
                        h.housing_class === 'informal_iron_sheet' ? '#e24b4b'
                        : h.housing_class === 'semi_permanent' ? '#c4a15a'
                        : '#2457a6'
                      }
                    />
                  </div>
                ))
              ) : (
                <p className="dash-empty">{error ? 'Backend offline' : 'Loading…'}</p>
              )}
            </div>
          </section>

          {/* Claims status breakdown */}
          <section className="dash-card">
            <div className="card-head">
              <h2>Claims by Status</h2>
            </div>
            {claims ? (
              <div className="status-breakdown">
                {[
                  { label: 'Settled', value: claims.settled, cls: 'bar-settled' },
                  { label: 'Open', value: claims.open, cls: 'bar-open' },
                  { label: 'Under Review', value: claims.under_review, cls: 'bar-review' },
                ].map((item) => (
                  <div key={item.label} className="status-row">
                    <span className="status-label">{item.label}</span>
                    <div className="status-bar-wrap">
                      <div
                        className={`status-bar ${item.cls}`}
                        style={{ width: `${(item.value / claims.total_claims) * 100}%` }}
                      />
                    </div>
                    <span className="status-count">{item.value}</span>
                  </div>
                ))}
                <p className="status-ratio">
                  Settlement ratio:{' '}
                  <strong>
                    {pct.format(claims.total_settled_kes / claims.total_claimed_kes)}
                  </strong>
                </p>
              </div>
            ) : (
              <p className="dash-empty">{error ? 'Backend offline' : 'Loading…'}</p>
            )}
          </section>

          {/* Severe flood loss card */}
          <section className="dash-card dash-card-flood-warn">
            <div className="card-head">
              <h2>Severe Flood Scenario</h2>
              <span className="badge badge-warn-sm">1-in-100 yr</span>
            </div>
            <div className="flood-warn-amount">
              {flood ? kes.format(flood.severe_loss_kes) : '—'}
            </div>
            <p className="flood-warn-sub">
              Estimated portfolio ground-up loss · {flood ? flood.location_count : '—'} Nairobi locations
            </p>
            <Link href="/catastrophe" className="flood-warn-cta">
              Model full scenario →
            </Link>
          </section>

        </div>
      </div>
    </div>
  );
}
