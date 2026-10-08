const FALLBACK = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

export function createMoneyFormatter(meta, options = {}) {
  const code = meta?.currency_code || 'KES';
  const locale = meta?.currency_locale || 'en-KE';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      notation: options.notation,
      maximumFractionDigits: options.maximumFractionDigits ?? 0,
    });
  } catch {
    return FALLBACK;
  }
}

export function createPctFormatter(locale = 'en-KE') {
  try {
    return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
  } catch {
    return new Intl.NumberFormat('en-KE', { style: 'percent', maximumFractionDigits: 1 });
  }
}

export function formatMoneyValue(amount, meta, options) {
  return createMoneyFormatter(meta, options).format(amount ?? 0);
}

/** @deprecated use useWorkspaceFormat — kept for non-React callers */
export const kesFormatter = FALLBACK;
