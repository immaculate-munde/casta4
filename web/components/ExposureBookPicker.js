'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchRagJson, postRagJson } from '@/lib/api';
import { btnPrimary, btnSm, cn } from '@/lib/buttons';

export default function ExposureBookPicker({ onActivated, compact = false, refreshKey = 0 }) {
  const [snapshots, setSnapshots] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const st = await fetchRagJson('/api/workspace/status');
      setSnapshots(st.exposure_snapshots || []);
      const active = st.active_region_id || st.manifest?.region_id || '';
      setActiveId(active);
      setSelected((prev) => prev || active || st.exposure_snapshots?.[0]?.region_id || '');
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function activate() {
    if (!selected || selected === activeId) return;
    setBusy(true);
    setErr('');
    try {
      await postRagJson(`/api/workspace/exposure-snapshots/${encodeURIComponent(selected)}/activate`, {});
      setActiveId(selected);
      onActivated?.();
      window.dispatchEvent(new CustomEvent('casta4:exposure-changed'));
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!snapshots.length) return null;

  return (
    <div className={compact ? 'mt-2 space-y-2' : 'mt-3 space-y-2 border-t border-kenya-line/80 pt-3'}>
      <p className="text-[11px] font-semibold text-[#0f2d52] dark:text-[#e8eaed]">Saved regional books</p>
      <p className="text-[10px] text-kenya-muted">Switch without re-uploading — each upload is stored by region name.</p>
      <select
        className="w-full rounded-full border-2 border-kenya-line bg-white px-3 py-2 text-xs font-medium text-[#0f2d52] dark:border-[#dadce0] dark:bg-[#1a1d21] dark:text-[#e8eaed]"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={busy}
      >
        {snapshots.map((s) => (
          <option key={s.region_id} value={s.region_id}>
            {s.region_label} ({s.row_count} locs){s.region_id === activeId ? ' · active' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || !selected || selected === activeId}
        className={cn(btnPrimary, btnSm, 'w-full normal-case disabled:opacity-50')}
        onClick={activate}
      >
        {busy ? 'Switching…' : 'Use this book on map'}
      </button>
      {err ? <p className="text-[11px] text-kenya-coral">{err}</p> : null}
    </div>
  );
}
