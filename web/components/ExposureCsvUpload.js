'use client';

import { useId, useState } from 'react';
import { IconUpload } from '@/components/NavIcons';
import { fetchRagJson, postRagJson } from '@/lib/api';
import ExposureBookPicker from '@/components/ExposureBookPicker';
import { btnBase, btnPrimary, btnSm, cn } from '@/lib/buttons';

function readFileAsUploadPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string' || !result.includes(',')) {
        reject(new Error('Could not read file'));
        return;
      }
      const file_base64 = result.split(',')[1];
      resolve({
        filename: file.name,
        content_type: file.type || undefined,
        file_base64,
      });
    };
    reader.readAsDataURL(file);
  });
}

const inputClass =
  'mt-2 w-full rounded-full border-2 border-[#0f2d52] bg-white px-4 py-2 text-xs text-[#0f2d52] outline-none placeholder:text-kenya-muted focus:border-kenya-blue focus:ring-2 focus:ring-kenya-blue/30 dark:border-[#dadce0] dark:bg-[#1a1d21] dark:text-[#f1f3f4]';

export default function ExposureCsvUpload({ onSuccess, compact = false }) {
  const fileInputId = useId();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [regionLabel, setRegionLabel] = useState('');
  const [generatedEpUrl, setGeneratedEpUrl] = useState('');
  const [bookRev, setBookRev] = useState(0);

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const lowerName = file.name.toLowerCase();
      const isCsv = lowerName.endsWith('.csv');
      const isDocumentLike = !isCsv && /\.(pdf|txt|md|doc|docx|json|html)$/i.test(lowerName) || /pdf|text\//i.test(file.type || '');

      if (isCsv) {
        const csv = await file.text();
        const data = await postRagJson('/api/workspace/exposure', {
          csv,
          filename: file.name,
          region_label: regionLabel.trim() || undefined,
        });
        const generatedText = data.generated_ep_csv_url
          ? `Uploaded ${data.manifest?.exposure_rows ?? ''} locations. Generated EP file is ready to download and re-upload as a modeled EP CSV.`
          : `Uploaded ${data.manifest?.exposure_rows ?? ''} locations. Map will refresh.`;
        setGeneratedEpUrl(data.generated_ep_csv_url || '');
        setMsg(generatedText);
        setBookRev((v) => v + 1);
        window.dispatchEvent(new CustomEvent('casta4:exposure-changed'));
        onSuccess?.(data);
        return;
      }

      if (isDocumentLike) {
        const payload = await readFileAsUploadPayload(file);
        const data = await postRagJson('/api/workspace/document', {
          ...payload,
          convert_to_exposure: true,
          region_label: regionLabel.trim() || 'Extracted from document',
        });
        if (data.exposure?.generated_ep_csv_url) {
          setGeneratedEpUrl(data.exposure.generated_ep_csv_url || '');
        }
        setMsg(
          data.exposure
            ? `Mapped ${file.name} to a hazard exposure row. The CAT map and EP curve were refreshed.`
            : `Uploaded ${file.name} for document parsing and exposure mapping.`
        );
        setBookRev((v) => v + 1);
        window.dispatchEvent(new CustomEvent('casta4:exposure-changed'));
        onSuccess?.(data.exposure || data);
        return;
      }

      throw new Error('Please upload a CSV exposure file or a PDF/text underwriting document.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? 'p-2' : 'rounded-2xl bg-kenya-panel p-3 ring-1 ring-kenya-line/80'}>
      {!compact ? (
        <p className="text-[11px] font-semibold text-[#0f2d52] dark:text-[#e8eaed]">Portfolio exposure</p>
      ) : null}
      <ExposureBookPicker
        compact={compact}
        refreshKey={bookRev}
        onActivated={() => {
          setBookRev((v) => v + 1);
          onSuccess?.();
        }}
      />
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
        {busy ? 'Uploading…' : compact ? 'Upload CSV or PDF' : 'Upload CSV or PDF'}
      </label>
      <input
        id={fileInputId}
        type="file"
        accept=".csv,.pdf,.txt,.md,.json,.html,text/csv,text/plain,application/pdf"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {!compact ? (
        <p className="mt-2 text-[10px] leading-snug text-kenya-muted">
          Upload a CSV exposure file, or a PDF/text underwriting memo. PDF/text inputs are parsed into a hazard exposure row,
          then mapped to the CAT grid and EP curve automatically.
        </p>
      ) : null}
      {err ? <p className="mt-2 text-[11px] font-medium text-kenya-coral">{err}</p> : null}
      {msg ? (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] font-medium text-kenya-navy">{msg}</p>
          {generatedEpUrl ? (
            <a
              href={generatedEpUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-full border border-kenya-blue bg-kenya-blue/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-kenya-blue"
            >
              Download generated EP CSV
            </a>
          ) : null}
        </div>
      ) : null}
      {!compact ? (
        <button
          type="button"
          className={cn(btnBase, btnSm, 'mt-2 normal-case')}
          onClick={() => {
            setErr('');
            fetchRagJson('/api/workspace/exposure-schema')
              .then((s) => setMsg(`Required: ${(s.required_columns || []).join(', ')}`))
              .catch((e) => setErr(e.message));
          }}
        >
          Show required columns
        </button>
      ) : null}
    </div>
  );
}
