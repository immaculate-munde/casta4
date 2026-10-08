/**
 * Structured contract between Casta4 (UI) and an external dynamic flood/financial model.
 *
 * INPUT:  portfolio exposure (locations + hazard tiers + TIV) — from workspace CSV.
 * OUTPUT: exceedance curve rows (return_period_years, loss_kes, optional net / uncertainty).
 *
 * The model team implements the engine; Casta4 ingests OUTPUT via ep_curve_model.csv
 * or POST /api/workspace/ep-model.
 */

export const MODEL_OUTPUT_REQUIRED = ['return_period_years', 'loss_kes'];

export const MODEL_OUTPUT_OPTIONAL = [
  'aep',
  'loss_net_kes',
  'loss_p05_kes',
  'loss_p95_kes',
  'series',
  'tier',
  'label',
];

/** Views the EP page can switch between (from one CSV row set). */
export const EP_VIEW_IDS = ['gross', 'net', 'uncertainty'];

/**
 * Build structured input payload for an external model run (JSON).
 */
export function buildPortfolioModelInput({ exposure, summary, manifest }) {
  return {
    schema_version: 1,
    region_id: manifest?.region_id || 'unknown',
    region_label: manifest?.region_label || 'Portfolio',
    location_count: summary?.location_count ?? exposure?.length ?? 0,
    total_tiv_kes: summary?.total_tiv_kes ?? 0,
    by_housing: summary?.by_housing ?? [],
    locations: (exposure || []).map((row) => ({
      loc_id: row.loc_id,
      lat: row.lat,
      lon: row.lon,
      housing_class: row.housing_class,
      tiv_kes: row.tiv_kes,
      hazards: row.hazards,
      cedant_id: row.cedant_id,
      cedant_name: row.cedant_name,
      kenya_re_in_book: Boolean(row.kenya_re_in_book),
    })),
    notes:
      'Feed this JSON (or the exposure CSV) into your model. Return EP rows keyed by return_period_years.',
  };
}

/**
 * Normalize model EP output into switchable views for the UI.
 */
export function buildEpViewsFromPoints(points) {
  const gross = points.map((p) => ({
    return_period_years: p.return_period_years,
    aep: p.aep,
    loss_kes: p.loss_kes,
    label: p.label,
  }));

  const hasNet = points.some((p) => p.loss_net_kes != null);
  const net = hasNet
    ? points.map((p) => ({
        return_period_years: p.return_period_years,
        aep: p.aep,
        loss_kes: p.loss_net_kes ?? p.loss_kes,
        label: p.label,
      }))
    : null;

  const hasBand = points.some((p) => p.loss_p05_kes != null && p.loss_p95_kes != null);
  const uncertainty_band = hasBand
    ? points.map((p) => ({
        return_period_years: p.return_period_years,
        p05_kes: p.loss_p05_kes,
        p95_kes: p.loss_p95_kes,
        loss_kes: p.loss_kes,
        aep: p.aep,
      }))
    : null;

  return {
    views: {
      gross: { id: 'gross', label: 'Gross loss', points: gross },
      net: net ? { id: 'net', label: 'Net loss (after reinsurance)', points: net } : null,
      uncertainty: hasBand
        ? {
            id: 'uncertainty',
            label: 'Gross + uncertainty band',
            points: gross,
            band: uncertainty_band,
          }
        : null,
    },
    available: EP_VIEW_IDS.filter((id) => {
      if (id === 'gross') return gross.length > 0;
      if (id === 'net') return Boolean(net);
      if (id === 'uncertainty') return Boolean(hasBand);
      return false;
    }),
  };
}
