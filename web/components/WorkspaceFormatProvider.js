'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchRagJson } from '@/lib/api';
import { createMoneyFormatter, createPctFormatter } from '@/lib/format-money';

const WorkspaceFormatContext = createContext(null);

export function WorkspaceFormatProvider({ children }) {
  const [meta, setMeta] = useState(null);

  const reload = useCallback(() => fetchRagJson('/api/nairobi/meta').then(setMeta).catch(() => {}), []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const onUpdate = () => reload();
    window.addEventListener('casta4-workspace-updated', onUpdate);
    return () => window.removeEventListener('casta4-workspace-updated', onUpdate);
  }, [reload]);

  const value = useMemo(() => {
    const locale = meta?.currency_locale || 'en-KE';
    return {
      meta,
      reload,
      formatMoney: createMoneyFormatter(meta),
      formatMoneyShort: createMoneyFormatter(meta, { maximumFractionDigits: 1 }),
      formatMoneyCompact: createMoneyFormatter(meta, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
      formatPct: createPctFormatter(locale),
      currencyCode: meta?.currency_code || 'KES',
      tivLabel: meta?.tiv_label || 'TIV (KES)',
    };
  }, [meta, reload]);

  return <WorkspaceFormatContext.Provider value={value}>{children}</WorkspaceFormatContext.Provider>;
}

export function useWorkspaceFormat() {
  const ctx = useContext(WorkspaceFormatContext);
  if (!ctx) {
    const formatMoney = createMoneyFormatter(null);
    return {
      meta: null,
      reload: () => Promise.resolve(),
      formatMoney,
      formatMoneyShort: createMoneyFormatter(null, { maximumFractionDigits: 1 }),
      formatMoneyCompact: createMoneyFormatter(null, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
      formatPct: createPctFormatter('en-KE'),
      currencyCode: 'KES',
      tivLabel: 'TIV (KES)',
    };
  }
  return ctx;
}

export function notifyWorkspaceUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('casta4-workspace-updated'));
  }
}
