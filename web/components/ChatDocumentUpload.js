'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { IconUpload } from '@/components/NavIcons';
import { fetchRagJson } from '@/lib/api';
import { btnPrimary, cn } from '@/lib/buttons';

export default function ChatDocumentUpload() {
  const inputId = useId();
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const refresh = useCallback(async () => {
    try {
      const st = await fetchRagJson('/api/workspace/status');
      setDocs(st.documents || []);
    } catch {
      setDocs([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onFile(file) {
    if (!file) return;
    setBusy(true);
    setNote('');
    try {
      const text = await file.text();
      const name = file.name.toLowerCase();
      if (name.endsWith('.pdf')) {
        setNote('PDF: paste text export or use .txt for now.');
        setBusy(false);
        return;
      }
      const res = await fetch('/api/workspace/document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name.replace(/\.[^.]+$/, '') + '.txt', text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setNote(`Added ${data.filename} — ReAgent will cite it in answers.`);
      await refresh();
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-3 pb-3 pt-2">
      <p className="mb-2 px-1 text-[11px] font-semibold" style={{ color: 'var(--chat-text-muted)' }}>
        Knowledge base
      </p>
      <label
        htmlFor={inputId}
        className={cn(
          btnPrimary,
          'w-full cursor-pointer py-2.5 text-xs normal-case tracking-normal',
          busy && 'pointer-events-none opacity-60'
        )}
      >
        <IconUpload className="h-4 w-4 shrink-0" />
        {busy ? 'Uploading…' : 'Upload document (.txt)'}
      </label>
      <input
        id={inputId}
        type="file"
        accept=".txt,text/plain"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {note ? (
        <p className="mt-2 px-1 text-[11px] leading-snug" style={{ color: 'var(--chat-text-muted)' }}>
          {note}
        </p>
      ) : null}
      {docs.length ? (
        <ul
          className="mt-2 max-h-24 space-y-0.5 overflow-y-auto px-1 text-[11px] leading-snug"
          style={{ color: 'var(--chat-text-muted)' }}
        >
          {docs.map((d) => (
            <li key={d.filename} className="truncate">
              · {d.filename}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
