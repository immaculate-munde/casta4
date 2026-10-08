'use client';

import { useId, useState } from 'react';
import { IconUpload } from '@/components/NavIcons';
import { btnPrimary, cn } from '@/lib/buttons';

const inputClass =
  'mt-3 w-full rounded-full border-2 border-[#0f2d52] bg-white px-4 py-2 text-xs text-[#0f2d52] outline-none placeholder:text-kenya-muted focus:border-kenya-blue focus:ring-2 focus:ring-kenya-blue/30 dark:border-[#dadce0] dark:bg-[#1a1d21] dark:text-[#f1f3f4]';

export default function ModelEpUpload({ onSuccess, modelLabel, onModelLabelChange }) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const csv = await file.text();
      const res = await fetch('/api/workspace/ep-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv,
          filename: file.name,
          model_label: modelLabel?.trim() || 'Team financial model',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setMsg('External EP curve loaded — chart updated.');
      onSuccess?.(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-kenya-panel p-4 shadow-sm ring-1 ring-kenya-line/80">
      <h2 className="font-serif text-base font-semibold text-kenya-navy">Team model EP curve</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-kenya-muted">
        Upload your team&apos;s EP / loss output (CSV). Required:{' '}
        <code className="text-[10px]">return_period_years, loss_kes</code>. Optional:{' '}
        <code className="text-[10px]">loss_net_kes, loss_p05_kes, loss_p95_kes, aep, label</code>.
      </p>
      <label className="mt-3 block text-[11px] font-semibold text-[#0f2d52] dark:text-[#e8eaed]" htmlFor="ep-model-label">
        Model name
      </label>
      <input
        id="ep-model-label"
        type="text"
        value={modelLabel || ''}
        onChange={(e) => onModelLabelChange?.(e.target.value)}
        placeholder="e.g. Team B Monte Carlo v1"
        className={inputClass}
      />
      <label
        htmlFor={inputId}
        className={cn(
          btnPrimary,
          'mt-3 w-full cursor-pointer py-2.5 text-xs normal-case tracking-normal',
          busy && 'pointer-events-none opacity-60'
        )}
      >
        <IconUpload className="h-4 w-4 shrink-0" />
        {busy ? 'Uploading…' : 'Upload EP curve CSV'}
      </label>
      <input
        id={inputId}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <p className="mt-2 text-[10px] text-kenya-muted">File name is usually ep_curve_model.csv</p>
      {err ? <p className="mt-2 text-[11px] font-medium text-kenya-coral">{err}</p> : null}
      {msg ? <p className="mt-2 text-[11px] font-medium text-kenya-navy">{msg}</p> : null}
    </div>
  );
}
