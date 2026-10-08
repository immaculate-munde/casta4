'use client';

import { btnBase, btnPrimary, cn } from '@/lib/buttons';

const OPTIONS = [
  { id: 'gross', label: 'Gross loss' },
  { id: 'net', label: 'Net loss' },
  { id: 'uncertainty', label: 'Uncertainty band' },
];

export default function EpViewSwitch({ available = [], value, onChange }) {
  const opts = OPTIONS.filter((o) => available.includes(o.id));
  if (opts.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="EP curve view">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={cn(value === o.id ? btnPrimary : btnBase, 'normal-case')}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
