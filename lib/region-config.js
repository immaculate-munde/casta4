/**
 * Region display + CAT scope from workspace manifest (dynamic uploads).
 * Numeric column remains `tiv_kes` in CSV/API for compatibility; UI labels follow currency.
 */

const DEFAULT = {
  region_id: 'nairobi',
  currency_code: 'KES',
  currency_locale: 'en-KE',
  country_label: 'Kenya',
};

/** @type {Record<string, typeof DEFAULT>} */
const BY_ID = {
  nairobi: DEFAULT,
  mombasa: { region_id: 'mombasa', currency_code: 'KES', currency_locale: 'en-KE', country_label: 'Kenya' },
  kisumu: { region_id: 'kisumu', currency_code: 'KES', currency_locale: 'en-KE', country_label: 'Kenya' },
  wajir: { region_id: 'wajir', currency_code: 'KES', currency_locale: 'en-KE', country_label: 'Kenya' },
  turkana: { region_id: 'turkana', currency_code: 'KES', currency_locale: 'en-KE', country_label: 'Kenya' },
  lusaka: { region_id: 'lusaka', currency_code: 'ZMW', currency_locale: 'en-ZM', country_label: 'Zambia' },
  cote_divoire: {
    region_id: 'cote_divoire',
    currency_code: 'XOF',
    currency_locale: 'fr-CI',
    country_label: "Côte d'Ivoire",
  },
  abidjan: {
    region_id: 'cote_divoire',
    currency_code: 'XOF',
    currency_locale: 'fr-CI',
    country_label: "Côte d'Ivoire",
  },
};

function slugify(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function inferFromLabel(label) {
  const t = String(label || '').toLowerCase();
  if (
    t.includes('cote') ||
    t.includes('ivoire') ||
    t.includes('ivory coast') ||
    t.includes('abidjan')
  ) {
    return BY_ID.cote_divoire;
  }
  if (t.includes('lusaka') || t.includes('zambia')) return BY_ID.lusaka;
  if (t.includes('mombasa')) return BY_ID.mombasa;
  if (t.includes('kisumu')) return BY_ID.kisumu;
  if (t.includes('wajir')) return BY_ID.wajir;
  if (t.includes('turkana')) return BY_ID.turkana;
  if (t.includes('nairobi')) return BY_ID.nairobi;
  return null;
}

export function resolveRegionConfig(manifest = {}) {
  const id = String(manifest.region_id || '').toLowerCase();
  const fromId = BY_ID[id];
  const fromLabel = inferFromLabel(manifest.region_label);
  const base = fromId || fromLabel || DEFAULT;

  const currency_code = manifest.currency_code || base.currency_code;
  const currency_locale = manifest.currency_locale || base.currency_locale;
  const country_label = manifest.country_label || base.country_label;
  const region_id = id || base.region_id || slugify(manifest.region_label) || 'custom';

  const nairobiEngine = region_id === 'nairobi' || String(manifest.region_label || '').toLowerCase().includes('nairobi');

  return {
    region_id,
    currency_code,
    currency_locale,
    country_label,
    tiv_field: 'tiv_kes',
    tiv_label: `TIV (${currency_code})`,
    peril_label: manifest.peril_label || 'Urban flood (pluvial proxy)',
    cat_data_scope: {
      portfolio_exposure: 'active_workspace_csv',
      portfolio_hazards: 'hazard_score_* columns in CSV (required for non-Nairobi CAT sanity)',
      portfolio_simulation: 'python_engine_on_uploaded_csv',
      single_risk_geotiff: nairobiEngine ? 'nairobi_rasters_when_in_extent' : 'synthetic_outside_nairobi_rasters',
      ai_drainage_hotspots: nairobiEngine ? 'nairobi_hotspots_csv' : 'neutral_no_zambia_hotspots',
    },
  };
}

export function applyRegionToManifest(manifest, meta = {}) {
  const next = { ...manifest };
  if (meta.region_label) next.region_label = meta.region_label;
  if (meta.region_id) next.region_id = meta.region_id;
  else if (meta.region_label && !next.region_id) {
    const inferred = inferFromLabel(meta.region_label);
    next.region_id = inferred?.region_id || slugify(meta.region_label) || 'custom';
  }
  const resolved = resolveRegionConfig(next);
  next.currency_code = meta.currency_code || resolved.currency_code;
  next.currency_locale = meta.currency_locale || resolved.currency_locale;
  next.country_label = meta.country_label || resolved.country_label;
  return next;
}
