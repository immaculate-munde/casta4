'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { IconUpload } from '@/components/NavIcons';
import { fetchRagJson, postRagJson } from '@/lib/api';
import { btnPrimary, cn } from '@/lib/buttons';

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
      const payload = await readFileAsUploadPayload(file);
      const data = await postRagJson('/api/workspace/document', payload);
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
        {busy ? 'Uploading…' : 'Upload file (any type)'}
      </label>
      <input
        id={inputId}
        type="file"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <p className="mt-1.5 px-1 text-[10px] leading-snug" style={{ color: 'var(--chat-text-muted)' }}>
        TXT, CSV, JSON, Markdown, HTML, PDF, and other UTF-8 text. PDF text is extracted on the server.
      </p>
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
