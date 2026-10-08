'use client';

import { useId, useState } from 'react';
import { IconUpload } from '@/components/NavIcons';
import { fetchRagJson } from '@/lib/api';
import { btnBase, btnPrimary, btnSm, cn } from '@/lib/buttons';

const inputClass =
  'mt-2 w-full rounded-full border-2 border-[#0f2d52] bg-white px-4 py-2 text-xs text-[#0f2d52] outline-none placeholder:text-kenya-muted focus:border-kenya-blue focus:ring-2 focus:ring-kenya-blue/30 dark:border-[#dadce0] dark:bg-[#1a1d21] dark:text-[#f1f3f4]';

export default function ExposureCsvUpload({ onSuccess, compact = false }) {
  const fileInputId = useId();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [regionLabel, setRegionLabel] = useState('');

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const csv = await file.text();
      const res = await fetch('/api/workspace/exposure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv,
          filename: file.name,
          region_label: regionLabel.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setMsg(`Uploaded ${data.manifest?.exposure_rows ?? ''} locations. Map will refresh.`);
      onSuccess?.(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? 'p-2' : 'rounded-2xl bg-kenya-panel p-3 ring-1 ring-kenya-line/80'}>
      {!compact ? (
        <p className="text-[11px] font-semibold text-[#0f2d52] dark:text-[#e8eaed]">Portfolio CSV</p>
      ) : null}
      {!compact ? (
        <input
          type="text"
          placeholder="Region label (e.g. Mombasa)"
          value={regionLabel}
          onChange={(e) => setRegionLabel(e.target.value)}
          className={inputClass}
        />
      ) : null}
      <label
        htmlFor={fileInputId}
        className={cn(
          btnPrimary,
          'mt-2 w-full cursor-pointer py-2.5 text-xs normal-case tracking-normal',
          busy && 'pointer-events-none opacity-60',
          compact && btnSm
        )}
      >
        <IconUpload className="h-4 w-4 shrink-0" />
        {busy ? 'Uploading…' : compact ? 'Upload exposure CSV' : 'Upload exposure CSV'}
      </label>
      <input
        id={fileInputId}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {!compact ? (
        <p className="mt-2 text-[10px] text-kenya-muted">
          Requires loc_id, lat, lon, housing_class, tiv_kes, hazard_score_* (5 tiers)
        </p>
      ) : null}
      {err ? <p className="mt-2 text-[11px] font-medium text-kenya-coral">{err}</p> : null}
      {msg ? <p className="mt-2 text-[11px] font-medium text-kenya-navy">{msg}</p> : null}
      {!compact ? (
        <button
          type="button"
          className={cn(btnBase, btnSm, 'mt-2 normal-case')}
          onClick={() =>
            fetchRagJson('/api/workspace/exposure-schema').then((s) =>
              setMsg(`Required: ${(s.required_columns || []).join(', ')}`)
            )
          }
        >
          Show required columns
        </button>
      ) : null}
    </div>
  );
}
