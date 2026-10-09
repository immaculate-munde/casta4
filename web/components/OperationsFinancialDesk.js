'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspaceFormat } from '@/components/WorkspaceFormatProvider';
import { fetchRagJson } from '@/lib/api';

function WaterfallBar({ label, value, max, tone = 'blue' }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  const fill =
    tone === 'deduct' ? 'bg-[#c4a15a]' : tone === 'insured' ? 'bg-[#3d8bfd]' : 'bg-[#5b9cf5]';
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="font-medium text-[#e8eaed]/90">{label}</span>
      </div>
      <div className="h-7 w-full rounded-sm bg-[#1a1d21]">
        <div className={`h-full rounded-sm transition-all ${fill}`} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

function OpsLossCurve({ points, bandLow, bandHigh, formatLoss, highlightRp }) {
  const pts = points ?? [];
  if (!pts.length) {
    return <p className="py-8 text-center text-xs text-[#9aa0a6]">No annual curve — start CAT engine</p>;
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
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-[#5b9cf5]" role="img">
      {bandPath ? <path d={bandPath} className="fill-[#5b9cf5]/20 stroke-none" /> : null}
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map((p, i) => {
        const active = p.return_period_years === highlightRp;
        return (
          <g key={p.return_period_years}>
            <circle cx={xAt(i)} cy={yAt(p.loss_kes)} r={active ? 5 : 3.5} className="fill-[#3d8bfd]" />
            <text
              x={xAt(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-[#9aa0a6] text-[9px]"
              style={{ fontFamily: 'var(--font-sans, Public Sans, sans-serif)' }}
            >
              {p.return_period_years}y
            </text>
            {active ? (
              <text
                x={xAt(i)}
                y={yAt(p.loss_kes) - 8}
                textAnchor="middle"
                className="fill-[#fbbc04] text-[9px] font-semibold"
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
  a.download = `casta4-losses-${regionId || 'portfolio'}.csv`;
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
    window.addEventListener('casta4:exposure-changed', onExposure);
    window.addEventListener('focus', onExposure);
    return () => {
      window.removeEventListener('casta4:exposure-changed', onExposure);
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
      <section className="mb-6 rounded-lg border border-[#3c4043] bg-[#202124] p-6 text-sm text-[#9aa0a6]">
        Running portfolio financial engine on active map book…
      </section>
    );
  }

  if (error && !ops) {
    return (
      <section className="mb-6 rounded-lg border border-[#5f2120] bg-[#202124] p-6 text-sm text-[#f28b82]">
        {payload?.error || error}
        <p className="mt-2 text-xs text-[#9aa0a6]">
          Upload or switch a regional CSV on the{' '}
          <Link href="/map" className="text-[#8ab4f8] hover:underline">
            map
          </Link>
          , then ensure CAT is running (<code className="text-[11px]">uvicorn server:app</code> in{' '}
          <code className="text-[11px]">nairobi-flood-cat</code>).
        </p>
      </section>
    );
  }

  if (!ops) return null;

  return (
    <section className="mb-8 overflow-hidden rounded-lg border border-[#3c4043] bg-[#202124] text-[#e8eaed] shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3c4043] px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#fbbc04]">Financial operations</p>
          <h2 className="font-serif text-xl font-semibold text-white">
            {payload?.region_label || 'Portfolio'} · {payload?.portfolio_count ?? ops?.waterfall?.buildings_total}{' '}
            buildings
          </h2>
          <p className="text-[11px] text-[#9aa0a6]">
            Scenario view (tier sum) · insurer gross only · synthetic exposure &amp; proxy hazard
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#9aa0a6]">
          <span>Deductible {formatPct.format(settings?.deductible_pct ?? ops.deductible_pct ?? 0.05)}</span>
          <span className="text-[#5f6368]">·</span>
          <span>Limit 100%</span>
          <span className="text-[#5f6368]">·</span>
          <span>Tier pairing: by footprint</span>
          <span className="text-[#5f6368]">·</span>
          <span>Drainage fix: {payload?.use_ai_rectifier ? 'on' : 'off'}</span>
          <Link href="/settings" className="ml-1 font-semibold text-[#8ab4f8] hover:underline">
            Settings
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[#3c4043] px-4 py-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#9aa0a6]">Return period</span>
        {chips.map((rp) => (
          <button
            key={rp}
            type="button"
            onClick={() => setReturnPeriod(rp)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              returnPeriod === rp
                ? 'bg-[#1a73e8] text-white'
                : 'bg-[#303134] text-[#e8eaed] hover:bg-[#3c4043]'
            }`}
          >
            1 in {rp}
          </button>
        ))}
        {ops.engine_tier_return_period_years !== returnPeriod ? (
          <span className="text-[10px] text-[#9aa0a6]">
            Engine tier: 1 in {ops.engine_tier_return_period_years} ({ops.tier_name})
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-md border border-[#3c4043] bg-[#292a2d] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#fbbc04]">
              From damage to insured loss (1 in {returnPeriod} scenario)
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex justify-between text-xs">
                  <span>Ground up loss</span>
                  <span className="font-semibold tabular-nums">{formatMoneyCompact.format(wf.ground_up_loss_kes)}</span>
                </div>
                <WaterfallBar label="" value={wf.ground_up_loss_kes} max={waterfallMax} tone="gul" />
              </div>
              <div>
                <div className="flex justify-between text-xs">
                  <span>Less deductible</span>
                  <span className="font-semibold tabular-nums">{formatMoneyCompact.format(wf.deductible_kes)}</span>
                </div>
                <WaterfallBar label="" value={wf.deductible_kes} max={waterfallMax} tone="deduct" />
              </div>
              <div>
                <div className="flex justify-between text-xs">
                  <span>Insured loss</span>
                  <span className="font-semibold tabular-nums">{formatMoneyCompact.format(wf.insured_loss_kes)}</span>
                </div>
                <WaterfallBar label="" value={wf.insured_loss_kes} max={waterfallMax} tone="insured" />
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[#9aa0a6]">
              {formatPct.format(wf.pct_of_tiv)} of insured value · {wf.buildings_with_loss} of {wf.buildings_total}{' '}
              buildings reached
            </p>
          </div>

          <div className="rounded-md border border-[#3c4043] bg-[#292a2d] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#fbbc04]">
              Indicative premium aid (assumed)
            </p>
            <p className="mt-1 text-[11px] text-[#9aa0a6]">
              Average annual loss {formatMoneyCompact.format(prem.aal_kes)} · risk load share
            </p>
            <input
              type="range"
              min={0}
              max={80}
              step={1}
              value={riskLoadPct}
              onChange={(e) => setRiskLoadPct(Number(e.target.value))}
              className="mt-2 w-full accent-[#1a73e8]"
            />
            <p className="text-[11px] text-[#9aa0a6]">{riskLoadPct}% load</p>
            <div className="mt-2 font-serif text-3xl font-semibold text-white">
              {formatMoneyCompact.format(indicativePremium)}
            </div>
            <p className="mt-1 text-[11px] text-[#9aa0a6]">
              About {formatPct.format(indicativePctOfTiv)} of insured value. Indicative, not a quote.
            </p>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-md border border-[#3c4043] bg-[#292a2d] p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#fbbc04]">
                Loss curve (annual view, simulated)
              </p>
              {ops.annual_curve?.gross_at_selected_rp_kes != null ? (
                <p className="text-[10px] text-[#9aa0a6]">
                  ELT at 1 in {ops.engine_tier_return_period_years}:{' '}
                  {formatMoneyCompact.format(ops.annual_curve.gross_at_selected_rp_kes)} gross · scenario waterfall{' '}
                  {formatMoneyCompact.format(wf.insured_loss_kes)} — quote one view on slides
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
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-t border-[#3c4043] p-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-md border border-[#3c4043]">
          <p className="border-b border-[#3c4043] bg-[#292a2d] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#fbbc04]">
            By construction class (1 in {returnPeriod})
          </p>
          <table className="w-full min-w-[320px] text-left text-xs">
            <thead>
              <tr className="border-b border-[#3c4043] text-[10px] uppercase text-[#9aa0a6]">
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2 text-right">Value share</th>
                <th className="px-3 py-2 text-right">Loss share</th>
                <th className="px-3 py-2 text-right">Loss % of value</th>
              </tr>
            </thead>
            <tbody>
              {ops.by_construction_class.map((row) => (
                <tr key={row.class_label} className="border-b border-[#3c4043]/80 last:border-0">
                  <td className="px-3 py-2">{row.class_label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPct.format(row.value_share)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPct.format(row.loss_share)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPct.format(row.loss_pct_of_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-md border border-[#3c4043]">
          <p className="border-b border-[#3c4043] bg-[#292a2d] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#fbbc04]">
            Where the loss piles up (1 in {returnPeriod})
          </p>
          <table className="w-full min-w-[320px] text-left text-xs">
            <thead>
              <tr className="border-b border-[#3c4043] text-[10px] uppercase text-[#9aa0a6]">
                <th className="px-3 py-2">Zone</th>
                <th className="px-3 py-2 text-right">Loss</th>
                <th className="px-3 py-2 text-right">Share of loss</th>
                <th className="px-3 py-2 text-right">Loss % of zone value</th>
              </tr>
            </thead>
            <tbody>
              {ops.by_zone.slice(0, 8).map((row) => (
                <tr key={row.zone} className="border-b border-[#3c4043]/80 last:border-0">
                  <td className="px-3 py-2">{row.zone}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoneyCompact.format(row.loss_kes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPct.format(row.loss_share)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPct.format(row.loss_pct_of_zone_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-[#3c4043] p-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#fbbc04]">
          Largest single risks (1 in {returnPeriod})
        </p>
        <p className="mb-3 text-[11px] text-[#9aa0a6]">
          The ten largest buildings carry {formatPct.format(ops.top_risks.share_of_scenario_loss)} of this loss.
        </p>
        <div className="overflow-x-auto rounded-md border border-[#3c4043]">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead>
              <tr className="border-b border-[#3c4043] bg-[#292a2d] text-[10px] uppercase text-[#9aa0a6]">
                <th className="px-3 py-2">Building</th>
                <th className="px-3 py-2">Zone</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">Damage %</th>
                <th className="px-3 py-2 text-right">Insured loss</th>
              </tr>
            </thead>
            <tbody>
              {ops.top_risks.rows.map((row) => (
                <tr key={row.loc_id} className="border-b border-[#3c4043]/80 last:border-0">
                  <td className="px-3 py-2 font-mono">{row.loc_id}</td>
                  <td className="px-3 py-2">{row.zone}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoneyCompact.format(row.value_kes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPct.format(row.damage_pct)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoneyCompact.format(row.insured_loss_kes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[#3c4043] px-4 py-3">
        <button
          type="button"
          className="rounded-full border border-[#5f6368] px-4 py-1.5 text-xs font-semibold text-[#e8eaed] hover:bg-[#303134]"
          onClick={() => setTraceOpen((v) => !v)}
        >
          Why this number
        </button>
        <button
          type="button"
          className="rounded-full border border-[#5f6368] px-4 py-1.5 text-xs font-semibold text-[#e8eaed] hover:bg-[#303134]"
          onClick={() => exportLossesCsv(ops.location_losses, payload?.region_id)}
        >
          Export CSV
        </button>
        <button
          type="button"
          disabled
          title="PDF export coming soon"
          className="rounded-full border border-[#3c4043] px-4 py-1.5 text-xs font-semibold text-[#9aa0a6] opacity-60"
        >
          Export PDF note
        </button>
        {loading ? <span className="text-[10px] text-[#9aa0a6]">Refreshing…</span> : null}
      </div>

      {traceOpen ? (
        <div className="border-t border-[#3c4043] bg-[#292a2d] px-4 py-3 text-[11px] leading-relaxed text-[#e8eaed]">
          <p className="font-semibold text-[#fbbc04]">Step trace (brief financial engine)</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[#9aa0a6]">
            <li>Per building: hazard tier → depth → JRC damage ratio × TIV = ground-up loss.</li>
            <li>Policy: gross = max(0, GUL − TIV × deductible {formatPct.format(settings?.deductible_pct ?? 0.05)}).</li>
            <li>Portfolio scenario: sum all buildings at tier {ops.tier_name} (1 in {ops.engine_tier_return_period_years}).</li>
            <li>Annual view: ELT points use tier AEP × portfolio gross; AAL = Σ AEP × loss.</li>
            <li>Zones: nearest county hotspot within 3 km, else &quot;Outside hotspot radius&quot;.</li>
            <li>Reinsurance net is out of scope — figures are insurer gross.</li>
          </ol>
        </div>
      ) : null}
    </section>
  );
}
