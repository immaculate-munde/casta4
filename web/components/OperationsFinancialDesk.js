'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspaceFormat } from '@/components/WorkspaceFormatProvider';
import { fetchRagJson } from '@/lib/api';
import { btnSecondary, btnSm, cn } from '@/lib/buttons';

const panel = 'rounded-sm border border-kenya-line bg-kenya-panel shadow-sm';
const kicker = 'text-[10px] font-bold uppercase tracking-wider text-kenya-ink/70 dark:text-kenya-muted';
const tableHead =
  'border-b border-kenya-line bg-kenya-surface text-left text-[10px] font-bold uppercase tracking-wide text-kenya-muted dark:bg-[#25282c]';

function WaterfallBar({ value, max, tone = 'gul' }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  const fill =
    tone === 'deduct'
      ? 'bg-kenya-watch'
      : tone === 'insured'
        ? 'bg-kenya-navy dark:bg-[#1a4a8a]'
        : 'bg-kenya-blue';
  return (
    <div className="h-6 w-full bg-kenya-line">
      <div className={`h-full transition-all ${fill}`} style={{ width: `${w}%` }} />
    </div>
  );
}

function OpsLossCurve({ points, bandLow, bandHigh, formatLoss, highlightRp }) {
  const pts = points ?? [];
  if (!pts.length) {
    return <p className="py-8 text-center text-xs text-kenya-muted">No annual curve — start the CAT service.</p>;
  }
  const width = 640;
  const height = 160;
  const pad = { t: 12, r: 16, b: 28, l: 48 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const maxY = Math.max(...pts.map((p) => p.loss_kes), 1);

  const xAt = (i) => pad.l + (pts.length <= 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
  const yAt = (loss) => pad.t + innerH - (loss / maxY) * innerH;

  const linePath = pts
    .map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.loss_kes).toFixed(1)}`)
    .join(' ');

  const bandPath =
    bandLow?.length && bandHigh?.length
      ? [
          ...bandHigh.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.loss_kes).toFixed(1)}`),
          ...[...bandLow].reverse().map((p, i) => {
            const idx = bandLow.length - 1 - i;
            return `L${xAt(idx).toFixed(1)},${yAt(p.loss_kes).toFixed(1)}`;
          }),
          'Z',
        ].join(' ')
      : null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-kenya-blue" role="img">
      {bandPath ? <path d={bandPath} className="fill-kenya-blue/15 stroke-none dark:fill-kenya-blue/25" /> : null}
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      {pts.map((p, i) => {
        const active = p.return_period_years === highlightRp;
        return (
          <g key={p.return_period_years}>
            <circle
              cx={xAt(i)}
              cy={yAt(p.loss_kes)}
              r={active ? 5 : 3.5}
              className={active ? 'fill-kenya-coral stroke-kenya-panel stroke-[2]' : 'fill-kenya-blue'}
            />
            <text
              x={xAt(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-kenya-muted text-[9px] font-medium"
              style={{ fontFamily: 'var(--font-sans, Public Sans, sans-serif)' }}
            >
              {p.return_period_years}y
            </text>
            {active ? (
              <text
                x={xAt(i)}
                y={yAt(p.loss_kes) - 8}
                textAnchor="middle"
                className="fill-kenya-navy text-[9px] font-semibold dark:fill-[#e8eaed]"
              >
                {formatLoss(p.loss_kes)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function exportLossesCsv(locationLosses, regionId) {
  const header = ['loc_id', 'zone', 'housing_class', 'tiv_kes', 'damage_ratio', 'ground_up_kes', 'insured_loss_kes'];
  const lines = [header.join(',')];
  for (const row of locationLosses || []) {
    lines.push(
      [
        row.loc_id,
        `"${String(row.zone).replace(/"/g, '""')}"`,
        row.housing_class,
        row.tiv_kes,
        row.damage_ratio,
        row.ground_up_kes,
        row.insured_loss_kes,
      ].join(',')
    );
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reagent-losses-${regionId || 'portfolio'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function OperationsFinancialDesk() {
  const { formatMoneyCompact, formatPct } = useWorkspaceFormat();
  const [returnPeriod, setReturnPeriod] = useState(100);
  const [riskLoadPct, setRiskLoadPct] = useState(35);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [traceOpen, setTraceOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({ return_period: String(returnPeriod) });
      const data = await fetchRagJson(`/api/dashboard/operations?${q}`);
      setPayload(data);
    } catch (e) {
      setError(e.message);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [returnPeriod]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onExposure = () => load();
    window.addEventListener('reagent:exposure-changed', onExposure);
    window.addEventListener('casta4:exposure-changed', onExposure);
    window.addEventListener('casta4-workspace-updated', onExposure);
    window.addEventListener('focus', onExposure);
    return () => {
      window.removeEventListener('reagent:exposure-changed', onExposure);
      window.removeEventListener('casta4:exposure-changed', onExposure);
      window.removeEventListener('casta4-workspace-updated', onExposure);
      window.removeEventListener('focus', onExposure);
    };
  }, [load]);

  const ops = payload?.operations;
  const wf = ops?.waterfall;
  const prem = ops?.premium_aid;
  const settings = payload?.cat_settings;
  const indicativePremium = prem ? prem.aal_kes * (1 + riskLoadPct / 100) : 0;
  const indicativePctOfTiv = ops?.total_tiv_kes ? indicativePremium / ops.total_tiv_kes : 0;

  const waterfallMax = useMemo(
    () => Math.max(wf?.ground_up_loss_kes ?? 0, wf?.insured_loss_kes ?? 0, 1),
    [wf]
  );

  const chips = ops?.return_period_chips ?? [10, 25, 50, 100, 250];

  if (loading && !ops) {
    return (
      <section className={`mb-6 ${panel} p-5 text-sm text-kenya-muted`}>
        Running portfolio financial engine on the active map book…
      </section>
    );
  }

  if (error && !ops) {
    return (
      <section className="mb-6 rounded-sm border border-[#f0c0c0] bg-[#fdeaea] px-4 py-3 text-sm text-[#8a1f1f] dark:border-[#5f2120] dark:bg-[#3d2020] dark:text-[#f28b82]">
        {payload?.error || error}
        <p className="mt-2 text-xs opacity-90">
          Upload or switch a regional CSV on the{' '}
          <Link href="/map" className="font-semibold text-kenya-blue hover:underline dark:text-[#8ab4f8]">
            flood desk
          </Link>
          , and start the portfolio CAT service (<code className="font-mono text-[11px]">uvicorn server:app</code>).
        </p>
      </section>
    );
  }

  if (!ops) return null;

  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block h-4 w-1.5 shrink-0 bg-kenya-coral" aria-hidden />
            <p className={kicker}>ReAgent · portfolio financial engine</p>
          </div>
          <h2 className="font-serif text-xl font-semibold text-kenya-navy">
            {payload?.region_label || 'Portfolio'} · {payload?.portfolio_count ?? wf?.buildings_total} buildings
          </h2>
          <p className="mt-1 text-xs text-kenya-muted">
            Active map book ({payload?.exposure_source === 'active_workspace_csv' ? 'uploaded CSV' : 'workspace'}) ·
            scenario tier sum · insurer gross
            {payload?.zone_mode === 'portfolio_sectors' ? ' · zones from map sectors (non-Nairobi book)' : null}
            {payload?.zone_mode === 'nairobi_hotspots' ? ' · zones from drainage hotspots' : null}
            {payload?.zone_mode === 'csv_column' ? ' · zones from CSV column' : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-kenya-muted">
          <span>Deductible {formatPct.format(settings?.deductible_pct ?? ops.deductible_pct ?? 0.05)}</span>
          <span aria-hidden>·</span>
          <span>Limit 100%</span>
          <span aria-hidden>·</span>
          <span>Tier pairing: by footprint</span>
          <span aria-hidden>·</span>
          <span>Drainage fix: {payload?.use_ai_rectifier ? 'on' : 'off'}</span>
          <Link href="/settings" className="font-semibold text-kenya-blue hover:underline dark:text-[#8ab4f8]">
            Settings
          </Link>
        </div>
      </div>

      <div className={`flex flex-wrap items-center gap-2 ${panel} px-4 py-3`}>
        <span className={kicker}>Return period</span>
        {chips.map((rp) => (
          <button
            key={rp}
            type="button"
            onClick={() => setReturnPeriod(rp)}
            className={cn(
              'rounded-full border-2 px-3 py-1 text-xs font-bold transition',
              returnPeriod === rp
                ? 'border-kenya-navy bg-kenya-navy !text-white dark:border-[#1a4a8a] dark:bg-[#1a4a8a]'
                : 'border-kenya-line bg-kenya-surface !text-kenya-navy hover:bg-[#eef1f5] dark:border-[#dadce0] dark:bg-[#1a1d21] dark:!text-[#f1f3f4] dark:hover:bg-[#2d3135]'
            )}
          >
            1 in {rp}
          </button>
        ))}
        {ops.engine_tier_return_period_years !== returnPeriod ? (
          <span className="text-[11px] text-kenya-muted">
            Engine tier: 1 in {ops.engine_tier_return_period_years} ({ops.tier_name})
          </span>
        ) : null}
        {loading ? <span className="text-[10px] text-kenya-muted">Refreshing…</span> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          <div className={`${panel} border-l-4 border-l-kenya-blue p-4`}>
            <p className={kicker}>From damage to insured loss (1 in {returnPeriod})</p>
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex justify-between text-xs text-kenya-ink">
                  <span>Ground up loss</span>
                  <span className="font-semibold tabular-nums text-kenya-navy">{formatMoneyCompact.format(wf.ground_up_loss_kes)}</span>
                </div>
                <WaterfallBar value={wf.ground_up_loss_kes} max={waterfallMax} tone="gul" />
              </div>
              <div>
                <div className="flex justify-between text-xs text-kenya-ink">
                  <span>Less deductible</span>
                  <span className="font-semibold tabular-nums text-kenya-navy">{formatMoneyCompact.format(wf.deductible_kes)}</span>
                </div>
                <WaterfallBar value={wf.deductible_kes} max={waterfallMax} tone="deduct" />
              </div>
              <div>
                <div className="flex justify-between text-xs text-kenya-ink">
                  <span>Insured loss</span>
                  <span className="font-semibold tabular-nums text-kenya-navy">{formatMoneyCompact.format(wf.insured_loss_kes)}</span>
                </div>
                <WaterfallBar value={wf.insured_loss_kes} max={waterfallMax} tone="insured" />
              </div>
            </div>
            <p className="mt-3 text-xs text-kenya-muted">
              {formatPct.format(wf.pct_of_tiv)} of insured value · {wf.buildings_with_loss} of {wf.buildings_total}{' '}
              buildings reached
            </p>
          </div>

          <div className={`${panel} border-l-4 border-l-kenya-coral p-4`}>
            <p className={kicker}>Indicative premium aid (assumed)</p>
            <p className="mt-1 text-xs text-kenya-muted">
              Average annual loss {formatMoneyCompact.format(prem.aal_kes)} · risk load share
            </p>
            <input
              type="range"
              min={0}
              max={80}
              step={1}
              value={riskLoadPct}
              onChange={(e) => setRiskLoadPct(Number(e.target.value))}
              className="mt-2 w-full accent-kenya-navy"
            />
            <p className="text-xs text-kenya-muted">{riskLoadPct}% load</p>
            <div className="mt-2 font-serif text-3xl font-semibold text-kenya-navy">{formatMoneyCompact.format(indicativePremium)}</div>
            <p className="mt-1 text-xs text-kenya-muted">
              About {formatPct.format(indicativePctOfTiv)} of insured value. Indicative, not a quote.
            </p>
          </div>
        </div>

        <div className={`lg:col-span-7 ${panel} p-4`}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className={kicker}>Loss curve (annual view, simulated)</p>
            {ops.annual_curve?.gross_at_selected_rp_kes != null ? (
              <p className="text-[10px] text-kenya-muted">
                ELT 1-in-{ops.engine_tier_return_period_years}:{' '}
                {formatMoneyCompact.format(ops.annual_curve.gross_at_selected_rp_kes)} · scenario{' '}
                {formatMoneyCompact.format(wf.insured_loss_kes)}
              </p>
            ) : null}
          </div>
          <OpsLossCurve
            points={ops.annual_curve?.points}
            bandLow={ops.annual_curve?.band_low}
            bandHigh={ops.annual_curve?.band_high}
            formatLoss={(v) => formatMoneyCompact.format(v)}
            highlightRp={ops.engine_tier_return_period_years}
          />
          <p className="mt-2 text-[11px] text-kenya-muted">
            Uncertainty band from baseline vs AI rectifier when both are available.{' '}
            <Link href="/ep-curve" className="font-semibold text-kenya-blue hover:underline">
              Full EP desk →
            </Link>
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto border border-kenya-line bg-kenya-panel shadow-sm">
          <p className={`border-b border-kenya-line px-3 py-2 ${kicker}`}>By construction class (1 in {returnPeriod})</p>
          <table className="w-full min-w-[320px] border-collapse text-left text-xs">
            <thead>
              <tr className={tableHead}>
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2 text-right">Value share</th>
                <th className="px-3 py-2 text-right">Loss share</th>
                <th className="px-3 py-2 text-right">Loss % of value</th>
              </tr>
            </thead>
            <tbody>
              {ops.by_construction_class.map((row) => (
                <tr key={row.class_label} className="border-b border-kenya-line/70 last:border-0">
                  <td className="px-3 py-2 font-medium text-kenya-navy">{row.class_label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPct.format(row.value_share)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPct.format(row.loss_share)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPct.format(row.loss_pct_of_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto border border-kenya-line bg-kenya-panel shadow-sm">
          <p className={`border-b border-kenya-line px-3 py-2 ${kicker}`}>Where the loss piles up (1 in {returnPeriod})</p>
          <table className="w-full min-w-[320px] border-collapse text-left text-xs">
            <thead>
              <tr className={tableHead}>
                <th className="px-3 py-2">Zone</th>
                <th className="px-3 py-2 text-right">Loss</th>
                <th className="px-3 py-2 text-right">Share of loss</th>
                <th className="px-3 py-2 text-right">Loss % of zone value</th>
              </tr>
            </thead>
            <tbody>
              {ops.by_zone.slice(0, 8).map((row) => (
                <tr key={row.zone} className="border-b border-kenya-line/70 last:border-0">
                  <td className="px-3 py-2">{row.zone}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoneyCompact.format(row.loss_kes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPct.format(row.loss_share)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPct.format(row.loss_pct_of_zone_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${panel} p-4`}>
        <p className={kicker}>Largest single risks (1 in {returnPeriod})</p>
        <p className="mb-3 text-xs text-kenya-muted">
          The ten largest buildings carry {formatPct.format(ops.top_risks.share_of_scenario_loss)} of this scenario loss.
        </p>
        <div className="overflow-x-auto border border-kenya-line">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr className={tableHead}>
                <th className="px-3 py-2">Building</th>
                <th className="px-3 py-2">Zone</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">Damage %</th>
                <th className="px-3 py-2 text-right">Insured loss</th>
              </tr>
            </thead>
            <tbody>
              {ops.top_risks.rows.map((row) => (
                <tr key={row.loc_id} className="border-b border-kenya-line/70 last:border-0">
                  <td className="px-3 py-2 font-mono text-[11px]">{row.loc_id}</td>
                  <td className="px-3 py-2">{row.zone}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoneyCompact.format(row.value_kes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPct.format(row.damage_pct)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-kenya-navy">
                    {formatMoneyCompact.format(row.insured_loss_kes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={cn(btnSecondary, btnSm)} onClick={() => setTraceOpen((v) => !v)}>
          Why this number
        </button>
        <button
          type="button"
          className={cn(btnSecondary, btnSm)}
          onClick={() => exportLossesCsv(ops.location_losses, payload?.region_id)}
        >
          Export CSV
        </button>
        <button type="button" disabled title="PDF export coming soon" className={cn(btnSecondary, btnSm, 'opacity-50')}>
          Export PDF note
        </button>
      </div>

      {traceOpen ? (
        <div className="rounded-sm border border-kenya-line bg-[#e8eef8] px-4 py-3 text-xs leading-relaxed text-kenya-navy dark:bg-[#25282c] dark:text-[#e8eaed]">
          <p className="font-semibold">Step trace (brief financial engine)</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-kenya-muted dark:text-[#bdc1c6]">
            <li>Per building: hazard tier → depth → JRC damage ratio × TIV = ground-up loss.</li>
            <li>Policy: gross = max(0, GUL − TIV × deductible {formatPct.format(settings?.deductible_pct ?? 0.05)}).</li>
            <li>
              Portfolio scenario: sum all buildings at tier {ops.tier_name} (1 in {ops.engine_tier_return_period_years}).
            </li>
            <li>Annual view: ELT points use tier AEP × portfolio gross; AAL = Σ AEP × loss.</li>
            <li>
              Zones: CSV <code className="font-mono">zone</code> column if present; else Nairobi hotspots for Nairobi
              books; else portfolio north/south/east/west sectors for other regions.
            </li>
            <li>Reinsurance net is out of scope — figures are insurer gross.</li>
          </ol>
        </div>
      ) : null}
    </section>
  );
}
