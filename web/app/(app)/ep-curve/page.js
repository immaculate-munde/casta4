'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import CatDisclosures from '@/components/CatDisclosures';
import CatEpAepChart from '@/components/CatEpAepChart';
import DualEpChart from '@/components/DualEpChart';
import EpViewSwitch from '@/components/EpViewSwitch';
import EventLossTable from '@/components/EventLossTable';
import ModelEpUpload from '@/components/ModelEpUpload';
import VulnerabilityChart from '@/components/VulnerabilityChart';
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
  const [vulnerability, setVulnerability] = useState(null);
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
    fetchRagJson('/api/nairobi/vulnerability').then(setVulnerability).catch(() => {});
  }, [loadCurve]);

  const cat = curve?.cat_model;
  const hasCat = Boolean(cat?.ep_curve_gross?.length || cat?.ep_curve_ai_gross?.length);
  const useAi = cat?.use_ai_rectifier !== false;

  const catSeries = useMemo(() => {
    if (!hasCat) return [];
    const out = [];
    if (cat.ep_curve_baseline_gross?.length) {
      out.push({
        id: 'rectified',
        label: 'Baseline (proxy only)',
        points: cat.ep_curve_baseline_gross,
        dashed: true,
      });
    }
    if (cat.ep_curve_ai_gross?.length) {
      out.push({
        id: 'external',
        label: 'AI rectified (drainage corrected)',
        points: cat.ep_curve_ai_gross,
      });
    }
    return out;
  }, [cat, hasCat]);

  const external = curve?.external_model;
  const hasExternal = Boolean(external?.ep_curve?.length);
  const landscapePts = curve?.ep_curve;
  const hasLandscape = Boolean(landscapePts?.length && curve?.source === 'csv_hazard_landscape');

  const landscapeSeries = useMemo(() => {
    if (!hasLandscape) return [];
    return [{ id: 'raw', label: 'Hazard-weighted exposure (CSV)', points: landscapePts }];
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
    epView === 'uncertainty' ? activeView?.band || external?.uncertainty_band || null : null;

  const primaryPts = activeView?.points;
  const extreme = primaryPts?.find((p) => p.return_period_years >= 100) || primaryPts?.[primaryPts.length - 1];
  const cat100 = cat?.summary_100yr;

  return (
    <div className="h-full overflow-y-auto bg-kenya-surface p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="font-serif text-2xl font-semibold text-kenya-navy">EP curve & models</h1>
          <p className="mt-1 text-sm text-kenya-muted">
            {meta?.region_label || 'Portfolio'} · {summary ? kes.format(summary.total_tiv_kes) : '…'} TIV
          </p>
          <p className="mt-2 text-[11px] text-kenya-muted">
            Portfolio CAT from Linus engine (active exposure CSV) · optional team EP CSV override ·{' '}
            <Link href="/settings" className="font-semibold text-kenya-blue hover:underline">
              model controls
            </Link>
          </p>
        </header>

        {err ? <p className="text-sm text-kenya-coral">{err}</p> : null}

        {hasCat ? (
          <div className="space-y-4 rounded-2xl ring-1 ring-kenya-line/80">
            <h2 className="font-serif text-lg font-semibold text-kenya-navy">Portfolio catastrophe analytics (CAT)</h2>
            {cat.hotspot_assets != null ? (
              <p className="text-[11px] text-kenya-muted">
                AI drainage: <strong>{cat.hotspot_assets}</strong> assets in hotspot corridors · 100-yr gross uplift vs
                baseline{' '}
                <strong>
                  {cat.ai_uplift_gross_pct >= 0 ? '+' : ''}
                  {(cat.ai_uplift_gross_pct ?? 0).toFixed(1)}%
                </strong>
              </p>
            ) : null}
            {cat100 ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="border border-kenya-line bg-kenya-panel p-4">
                  <p className="text-[10px] font-bold uppercase text-kenya-muted">100-yr GUL</p>
                  <p className="mt-1 text-lg font-semibold text-kenya-navy">{kes.format(cat100.ground_up_loss_kes)}</p>
                </div>
                <div className="border border-kenya-line bg-kenya-panel p-4">
                  <p className="text-[10px] font-bold uppercase text-kenya-muted">100-yr gross</p>
                  <p className="mt-1 text-lg font-semibold text-kenya-navy">{kes.format(cat100.gross_loss_kes)}</p>
                </div>
                <div className="border border-kenya-line bg-kenya-panel p-4">
                  <p className="text-[10px] font-bold uppercase text-kenya-muted">100-yr net</p>
                  <p className="mt-1 text-lg font-semibold text-kenya-navy">{kes.format(cat100.net_loss_kes)}</p>
                </div>
              </div>
            ) : null}
            <CatEpAepChart baselineElt={cat.elt_baseline} aiElt={cat.elt_ai} useAi={useAi} />
            <DualEpChart
              series={catSeries}
              formatLoss={(v) => kes.format(v)}
              title="Portfolio loss by return period (CAT)"
              subtitle="Solid = AI rectified · dashed = baseline proxy — same tiers as map scenarios."
            />
            <EventLossTable
              elt={cat.elt}
              caption={useAi ? 'Showing AI-rectified ELT' : 'Showing baseline ELT (AI off in Settings)'}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-kenya-line bg-kenya-panel p-4 text-sm text-kenya-muted">
            Start the Python CAT service and set <code className="text-xs">CAT_MODEL_URL</code> to see portfolio EP/ELT
            (Streamlit Tab 1 equivalent).
          </div>
        )}

        <ModelEpUpload
          modelLabel={modelLabel}
          onModelLabelChange={setModelLabel}
          onSuccess={() => {
            loadCurve();
            fetchRagJson('/api/workspace/status').then(setWorkspace);
          }}
        />

        {vulnerability?.curves?.length ? (
          <div className="space-y-2">
            <h2 className="font-serif text-lg font-semibold text-kenya-navy">Vulnerability — damage matrix</h2>
            <p className="text-[11px] text-kenya-muted">
              Source: <code className="text-[10px]">{vulnerability.matrix_file || vulnerability.source}</code>
            </p>
            <VulnerabilityChart curves={vulnerability.curves} />
          </div>
        ) : null}

        {hasLandscape ? (
          <div className="space-y-2">
            <h2 className="font-serif text-lg font-semibold text-kenya-navy">Hazard landscape (exposure CSV)</h2>
            <p className="text-[11px] text-kenya-muted">
              Σ(TIV × hazard) per tier — exposure index, not CAT financial loss.
            </p>
            <DualEpChart
              series={landscapeSeries}
              formatLoss={(v) => kes.format(v)}
              singleSeries
              title="Hazard landscape"
              subtitle="Updates when you upload exposure on the map."
            />
          </div>
        ) : null}

        {hasExternal ? (
          <div className="space-y-3">
            <h2 className="font-serif text-lg font-semibold text-kenya-navy">Optional team EP CSV</h2>
            <EpViewSwitch available={viewsAvailable} value={epView} onChange={setEpView} />
            {extreme ? (
              <p className="text-xs text-kenya-muted">
                1-in-{extreme.return_period_years} yr ({epView}): {kes.format(extreme.loss_kes)}
              </p>
            ) : null}
            <DualEpChart
              series={chartSeries}
              formatLoss={(v) => kes.format(v)}
              uncertaintyBand={uncertaintyBand}
              singleSeries
              subtitle="External team output — separate from live CAT engine above."
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <h2 className="font-serif text-lg font-semibold text-kenya-navy">Model assumptions & disclosures</h2>
          <CatDisclosures />
        </div>

        <Link href="/map" className={cn(btnBase, 'inline-flex no-underline normal-case')}>
          Back to map
        </Link>
      </div>
    </div>
  );
}
