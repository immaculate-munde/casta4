'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DualEpChart from '@/components/DualEpChart';
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
  const [err, setErr] = useState('');

  const loadCurve = useCallback(() => {
    fetchRagJson('/api/nairobi/loss-curve')
      .then(setCurve)
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    fetchRagJson('/api/nairobi/meta').then(setMeta).catch(() => {});
    fetchRagJson('/api/nairobi/summary').then(setSummary).catch(() => {});
    fetchRagJson('/api/workspace/status').then((st) => {
      setWorkspace(st);
      if (st.model_team_label) setModelLabel(st.model_team_label);
    }).catch(() => {});
    loadCurve();
  }, [loadCurve]);

  const external = curve?.external_model;
  const hasExternal = Boolean(external?.ep_curve?.length);

  const series = useMemo(() => {
    if (!hasExternal) return [];
    const out = [
      {
        id: 'external',
        label: modelLabel || workspace?.model_team_label || 'Team model (gross)',
        points: external.ep_curve,
        netAt: (i) => external.ep_curve_net?.[i]?.loss_kes,
      },
    ];
    if (external.ep_curve_net?.length) {
      out.push({
        id: 'external_net',
        label: `${modelLabel || 'Team model'} (net)`,
        points: external.ep_curve_net,
        dashed: true,
      });
    }
    return out;
  }, [hasExternal, external, modelLabel, workspace]);

  const primaryPts = external?.ep_curve;
  const extreme = primaryPts?.find((p) => p.return_period_years >= 100) || primaryPts?.[primaryPts.length - 1];

  return (
    <div className="h-full overflow-y-auto bg-kenya-surface p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="font-serif text-2xl font-semibold text-kenya-navy">EP curve & models</h1>
          <p className="mt-1 text-sm text-kenya-muted">
            {meta?.region_label || 'Portfolio'} · {summary ? kes.format(summary.total_tiv_kes) : '…'} TIV
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

        {!hasExternal ? (
          <div className="rounded-2xl bg-kenya-panel p-6 text-center shadow-sm ring-1 ring-kenya-line/80">
            <p className="text-sm text-kenya-muted">
              Upload your team EP CSV above to display the exceedance curve. Sample format:{' '}
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
          <DualEpChart
            series={series}
            formatLoss={(v) => kes.format(v)}
            uncertaintyBand={external.uncertainty_band}
            subtitle="Hover points for return period, AEP, and loss. Shaded band = p5–p95 when provided in CSV."
          />
        ) : null}
      </div>
    </div>
  );
}
