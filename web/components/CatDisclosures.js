'use client';

import { useEffect, useState } from 'react';
import { fetchRagJson } from '@/lib/api';

export default function CatDisclosures() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    fetchRagJson('/api/cat/disclosures')
      .then((d) => setRows(d.rows || []))
      .catch(() => setRows([]));
  }, []);

  if (rows === null) {
    return <p className="text-xs text-kenya-muted">Loading model disclosures…</p>;
  }
  if (!rows.length) {
    return (
      <p className="text-xs text-kenya-muted">
        Disclosures available when the CAT Python service is running.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border border-kenya-line bg-kenya-panel">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-kenya-line bg-kenya-surface text-left text-[10px] font-bold uppercase text-kenya-muted">
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Component</th>
            <th className="px-3 py-2">Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.component} className="border-b border-kenya-line/70">
              <td className="px-3 py-2 text-kenya-muted">{r.category}</td>
              <td className="px-3 py-2 font-medium text-kenya-navy">{r.component}</td>
              <td className="px-3 py-2 text-kenya-ink">{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] leading-snug text-kenya-muted">
        Hackathon decision-support demonstrator — modelled losses are illustrative, not binding underwriting authority.
      </p>
    </div>
  );
}
