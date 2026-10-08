'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchRagJson, postRagJson } from '@/lib/api';
import { btnPrimary, cn } from '@/lib/buttons';

export default function CatModelSettings() {
  const [settings, setSettings] = useState(null);
  const [catHealth, setCatHealth] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        fetchRagJson('/api/workspace/cat-settings'),
        fetchRagJson('/api/cat/health').catch(() => null),
      ]);
      setSettings(s);
      setCatHealth(h);
    } catch {
      setSettings(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setMsg('');
    try {
      await postRagJson('/api/workspace/cat-settings', settings);
      setMsg('CAT model controls saved. Refresh dashboard and EP curve to re-run simulation.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <p className="text-xs text-kenya-muted">Loading CAT settings…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-snug text-kenya-muted">
        Same controls as the Streamlit sidebar — applied to portfolio simulation and single-risk underwriting when{' '}
        <code className="text-[10px]">CAT_MODEL_URL</code> is running.
      </p>
      <p className="text-[11px] font-medium text-kenya-ink">
        Engine:{' '}
        {catHealth?.reachable ? (
          <span className="text-kenya-green">connected</span>
        ) : catHealth?.configured ? (
          <span className="text-kenya-coral">configured but unreachable</span>
        ) : (
          <span className="text-kenya-muted">not configured</span>
        )}
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-kenya-navy">
        <input
          type="checkbox"
          checked={Boolean(settings.use_ai_rectifier)}
          onChange={(e) => setSettings((s) => ({ ...s, use_ai_rectifier: e.target.checked }))}
        />
        Enable AI urban drainage rectifier
      </label>
      <div>
        <label className="text-[11px] font-bold text-kenya-muted">
          Policy deductible ({Math.round((settings.deductible_pct || 0) * 100)}%)
        </label>
        <input
          type="range"
          min={0}
          max={15}
          step={1}
          value={Math.round((settings.deductible_pct || 0.05) * 100)}
          className="mt-1 w-full"
          onChange={(e) =>
            setSettings((s) => ({ ...s, deductible_pct: Number(e.target.value) / 100 }))
          }
        />
      </div>
      <div>
        <label className="text-[11px] font-bold text-kenya-muted">
          Quota share reinsurance ({Math.round((settings.reinsurance_qs_pct || 0) * 100)}%)
        </label>
        <input
          type="range"
          min={0}
          max={50}
          step={1}
          value={Math.round((settings.reinsurance_qs_pct || 0.25) * 100)}
          className="mt-1 w-full"
          onChange={(e) =>
            setSettings((s) => ({ ...s, reinsurance_qs_pct: Number(e.target.value) / 100 }))
          }
        />
      </div>
      <div>
        <label className="text-[11px] font-bold text-kenya-muted">
          Hotspot influence radius ({Number(settings.influence_km || 1.2).toFixed(1)} km)
        </label>
        <input
          type="range"
          min={4}
          max={30}
          step={1}
          value={Math.round(Number(settings.influence_km || 1.2) * 10)}
          className="mt-1 w-full"
          onChange={(e) => setSettings((s) => ({ ...s, influence_km: Number(e.target.value) / 10 }))}
        />
      </div>
      <button type="button" className={cn(btnPrimary, 'w-full')} disabled={busy} onClick={save}>
        {busy ? 'Saving…' : 'Save CAT controls'}
      </button>
      {msg ? <p className="text-[11px] text-kenya-muted">{msg}</p> : null}
    </div>
  );
}
