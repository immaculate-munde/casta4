'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DualEpChart from '@/components/DualEpChart';
import EpViewSwitch from '@/components/EpViewSwitch';
import ModelEpUpload from '@/components/ModelEpUpload';
import { fetchRagJson } from '@/lib/api';
import { btnBase, cn } from '@/lib/buttons';

const kes = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });

export default function EpCurvePage() {
  const [meta, setMeta] = useState(null);
  const [curve, setCurve] = useState(null);
  const [summary, setSummary] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [modelLabel, setModelLabel] = useState('Team financial model');
  const [epView, setEpView] = useState('gross');
  const [err, setErr] = useState('');

  const loadCurve = useCallback(() => {
    fetchRagJson('/api/nairobi/loss-curve')
      .then(setCurve)
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    fetchRagJson('/api/nairobi/meta').then(setMeta).catch(() => {});
    fetchRagJson('/api/nairobi/summary').then(setSummary).catch(() => {});
    fetchRagJson('/api/workspace/status')
      .then((st) => {
        setWorkspace(st);
        if (st.model_team_label) setModelLabel(st.model_team_label);
      })
      .catch(() => {});
    loadCurve();
  }, [loadCurve]);

  const external = curve?.external_model;
  const hasExternal = Boolean(external?.ep_curve?.length);
  const landscapePts = curve?.ep_curve;
  const hasLandscape = Boolean(landscapePts?.length && curve?.source === 'csv_hazard_landscape');

  const landscapeSeries = useMemo(() => {
    if (!hasLandscape) return [];
    return [
      {
        id: 'raw',
        label: 'Hazard-weighted exposure (CSV)',
        points: landscapePts,
      },
    ];
  }, [hasLandscape, landscapePts]);
  const viewsAvailable = external?.ep_views_available?.length
    ? external.ep_views_available
    : hasExternal
      ? ['gross']
      : [];

  useEffect(() => {
    if (!viewsAvailable.length) return;
    setEpView((current) => (viewsAvailable.includes(current) ? current : viewsAvailable[0]));
  }, [viewsAvailable.join(',')]);

  const activeView = useMemo(() => {
    const views = external?.ep_views;
    if (views) {
      if (epView === 'net' && views.net) return views.net;
      if (epView === 'uncertainty' && views.uncertainty) return views.uncertainty;
      return views.gross;
    }
    if (!hasExternal) return null;
    return {
      id: 'gross',
      label: modelLabel || workspace?.model_team_label || 'Team model (gross)',
      points: external.ep_curve,
    };
  }, [external, epView, hasExternal, modelLabel, workspace]);

  const chartSeries = useMemo(() => {
    if (!activeView?.points?.length) return [];
    const chartId = epView === 'net' ? 'net' : 'external';
    const baseLabel = modelLabel || workspace?.model_team_label || 'Team model';
    const label =
      epView === 'gross'
        ? `${baseLabel} (gross)`
        : epView === 'net'
          ? `${baseLabel} (net)`
          : activeView.label || `${baseLabel} + uncertainty`;
    return [{ id: chartId, label, points: activeView.points }];
  }, [activeView, epView, modelLabel, workspace]);

  const uncertaintyBand =
    epView === 'uncertainty'
      ? activeView?.band || external?.uncertainty_band || null
      : null;

  const primaryPts = activeView?.points;
  const extreme = primaryPts?.find((p) => p.return_period_years >= 100) || primaryPts?.[primaryPts.length - 1];

  return (
    <div className="h-full overflow-y-auto bg-kenya-surface p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="font-serif text-2xl font-semibold text-kenya-navy">EP curve & models</h1>
          <p className="mt-1 text-sm text-kenya-muted">
            {meta?.region_label || 'Portfolio'} · {summary ? kes.format(summary.total_tiv_kes) : '…'} TIV
          </p>
          <p className="mt-2 text-[11px] text-kenya-muted">
            Model teams: pull structured exposure from{' '}
            <code className="text-[10px]">GET /api/workspace/model-input</code> — see{' '}
            <code className="text-[10px]">docs/MODEL_IO.md</code>.
          </p>
        </header>

        {err ? <p className="text-sm text-kenya-coral">{err}</p> : null}

        <ModelEpUpload
          modelLabel={modelLabel}
          onModelLabelChange={setModelLabel}
          onSuccess={() => {
            loadCurve();
            fetchRagJson('/api/workspace/status').then(setWorkspace);
          }}
        />

        {hasLandscape ? (
          <div className="space-y-2">
            <h2 className="font-serif text-lg font-semibold text-kenya-navy">Current portfolio landscape</h2>
            <p className="text-[11px] text-kenya-muted">
              Matches the map pins and hazard tiers for the active exposure CSV. Y-axis is Σ(TIV × hazard score) at each
              return period — an exposure index, not ground-up loss from your financial model.
            </p>
            <DualEpChart
              series={landscapeSeries}
              formatLoss={(v) => kes.format(v)}
              singleSeries
              title="Hazard landscape (from map CSV)"
              subtitle="Updates when you upload a new exposure file on the map."
            />
          </div>
        ) : null}

        {!hasExternal ? (
          <div className="rounded-2xl bg-kenya-panel p-6 text-center shadow-sm ring-1 ring-kenya-line/80">
            <p className="text-sm text-kenya-muted">
              Upload your team EP CSV above for financial exceedance loss. Sample format:{' '}
              <code className="text-xs">docs/sample_ep_curve_model.csv</code>
            </p>
            <Link href="/map" className={cn(btnBase, 'mt-4 inline-flex no-underline normal-case')}>
              Back to map
            </Link>
          </div>
        ) : null}

        {extreme ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="border border-kenya-line bg-kenya-panel p-4">
              <p className="text-[10px] font-bold uppercase text-kenya-muted">1-in-{extreme.return_period_years} yr</p>
              <p className="mt-1 text-xl font-semibold text-kenya-navy">{kes.format(extreme.loss_kes)}</p>
              <p className="mt-1 text-[10px] text-kenya-muted capitalize">{epView.replace('_', ' ')} view</p>
            </div>
            <div className="border border-kenya-line bg-kenya-panel p-4">
              <p className="text-[10px] font-bold uppercase text-kenya-muted">Locations</p>
              <p className="mt-1 text-xl font-semibold text-kenya-navy">{summary?.location_count ?? '—'}</p>
            </div>
            <div className="border border-kenya-line bg-kenya-panel p-4">
              <p className="text-[10px] font-bold uppercase text-kenya-muted">Model</p>
              <p className="mt-1 text-sm font-semibold text-kenya-navy">{modelLabel}</p>
            </div>
          </div>
        ) : null}

        {hasExternal ? (
          <div className="space-y-3">
            <h2 className="font-serif text-lg font-semibold text-kenya-navy">Team financial model</h2>
            <EpViewSwitch available={viewsAvailable} value={epView} onChange={setEpView} />
            <DualEpChart
              series={chartSeries}
              formatLoss={(v) => kes.format(v)}
              uncertaintyBand={uncertaintyBand}
              singleSeries
              subtitle={
                epView === 'uncertainty'
                  ? 'Gross central estimate with p5–p95 band from your CSV. Switch views for net or gross only.'
                  : 'One curve at a time — use the switch for gross, net, or uncertainty band.'
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
