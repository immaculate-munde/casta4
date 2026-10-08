'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { fetchRagJson, ragApiBase } from '@/lib/api';
import { btnDanger } from '@/lib/buttons';

export default function SettingsPage() {
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetchRagJson('/api/workspace/status').then(setStatus).catch(() => {});
  }, []);

  async function resetDemo() {
    setMsg('');
    try {
      const res = await fetch('/api/workspace/reset-default', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg('Reset to Nairobi starter pack. Refresh the map tab.');
      fetchRagJson('/api/workspace/status').then(setStatus);
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="font-serif text-2xl font-semibold text-kenya-navy">Settings</h1>

        <section className="border border-kenya-line bg-kenya-panel p-4">
          <h2 className="text-sm font-bold text-kenya-navy">Appearance</h2>
          <div className="mt-3 flex items-center gap-3">
            <ThemeToggle />
            <span className="text-xs text-kenya-muted">Light / dark theme</span>
          </div>
        </section>

        <section className="border border-kenya-line bg-kenya-panel p-4">
          <h2 className="text-sm font-bold text-kenya-navy">Workspace</h2>
          <dl className="mt-2 space-y-2 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-kenya-muted">Region</dt>
              <dd className="font-medium text-kenya-ink">{status?.manifest?.region_label || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-kenya-muted">Exposure rows</dt>
              <dd className="font-medium text-kenya-ink">{status?.exposure_row_count ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-kenya-muted">Uploaded docs</dt>
              <dd className="font-medium text-kenya-ink">{status?.document_count ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-kenya-muted">Team EP model</dt>
              <dd className="font-medium text-kenya-ink">
                {status?.has_ep_model ? status.model_team_label || 'Loaded' : 'Not uploaded'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-kenya-muted">API base</dt>
              <dd className="truncate font-mono text-[10px] text-kenya-ink">{ragApiBase() || '(proxy)'}</dd>
            </div>
          </dl>
          <button type="button" onClick={resetDemo} className={`${btnDanger} mt-4 w-full`}>
            Reset to Nairobi demo pack
          </button>
          {msg ? <p className="mt-2 text-xs text-kenya-muted">{msg}</p> : null}
        </section>

        <p className="text-xs text-kenya-muted">
          <Link href="/dashboard" className="font-semibold text-kenya-blue hover:underline">
            Operations dashboard
          </Link>{' '}
          for historical claims KPIs.
        </p>
      </div>
    </div>
  );
}
