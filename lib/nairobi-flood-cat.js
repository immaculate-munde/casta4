/**
 * Portfolio load from exposure CSV — hazard scores for map/visualization only.
 * Financial EP / losses come from uploaded team EP CSV (workspace), not computed here.
 */

import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
import { attachCedantFields, CEDANTS } from './portfolio-cedant.js';
import { exposurePath as workspaceExposurePath, readManifest } from './workspace-store.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.CAT_DATA_DIR
  ? path.resolve(process.env.CAT_DATA_DIR)
  : path.join(ROOT, 'data', 'team_a_nairobi');
const EXPOSURE_CSV = process.env.CAT_EXPOSURE_CSV || 'exposure_nairobi_with_hazard.csv';
const HOTSPOTS_CSV = process.env.CAT_HOTSPOTS_CSV || 'nairobi_hotspots_geocoded.csv';
const REGION_ID = process.env.CAT_REGION_ID || 'nairobi';
const REGION_LABEL = process.env.CAT_REGION_LABEL || 'Nairobi';
const PERIL_LABEL = process.env.CAT_PERIL_LABEL || 'Urban flood (pluvial proxy)';

export const TIERS = [
  { id: 'common', field: 'hazard_score_common', label: 'Common', returnPeriodYears: 2, aep: 0.5 },
  { id: 'occasional', field: 'hazard_score_occasional', label: 'Occasional', returnPeriodYears: 5, aep: 0.2 },
  { id: 'moderate', field: 'hazard_score_moderate', label: 'Moderate', returnPeriodYears: 10, aep: 0.1 },
  { id: 'severe', field: 'hazard_score_severe', label: 'Severe', returnPeriodYears: 50, aep: 0.02 },
  { id: 'extreme', field: 'hazard_score_extreme', label: 'Extreme', returnPeriodYears: 100, aep: 0.01 },
];

const HOUSING_LABELS = {
  informal_iron_sheet: 'Informal (iron sheet)',
  semi_permanent: 'Semi-permanent',
  permanent_masonry: 'Permanent masonry',
  concrete_rcc: 'Concrete / RCC',
};

let portfolioCache = null;

export function clearPortfolioCache() {
  portfolioCache = null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function hazardBand(score) {
  const s = num(score);
  if (s >= 0.5) return 'high';
  if (s >= 0.25) return 'watch';
  return 'low';
}

function normalizeRow(raw) {
  const hazards = {};
  for (const tier of TIERS) {
    hazards[tier.id] = num(raw[tier.field]);
  }
  const maxHazard = Math.max(...Object.values(hazards));
  const base = {
    loc_id: String(raw.loc_id || '').trim(),
    lat: num(raw.lat),
    lon: num(raw.lon),
    housing_class: String(raw.housing_class || '').trim(),
    housing_label: HOUSING_LABELS[raw.housing_class] || raw.housing_class,
    floor_area_m2: num(raw.floor_area_m2),
    cost_per_m2_kes: num(raw.cost_per_m2_kes),
    tiv_kes: num(raw.tiv_kes),
    synthetic: String(raw.synthetic).toLowerCase() === 'true',
    source: String(raw.source || '').trim(),
    hazards,
    max_hazard: maxHazard,
    in_drainage_chokepoint:
      String(raw.in_drainage_chokepoint || '').toLowerCase() === 'true' ||
      raw.in_drainage_chokepoint === 1,
  };
  return attachCedantFields(raw, base);
}

function rowForTier(row, tierId) {
  const tier = TIERS.find((t) => t.id === tierId) || TIERS.find((t) => t.id === 'moderate');
  const hazard = row.hazards[tier.id];
  return {
    ...row,
    active_tier: tier.id,
    hazard,
    hazard_band: hazardBand(hazard),
  };
}

export async function loadPortfolio() {
  if (portfolioCache) return portfolioCache;

  let exposureFile = path.join(DATA_DIR, EXPOSURE_CSV);
  try {
    await fs.access(workspaceExposurePath());
    exposureFile = workspaceExposurePath();
  } catch {
    /* bundled data */
  }

  const hotspotsPath = path.join(DATA_DIR, HOTSPOTS_CSV);

  const [exposureRaw, hotspotsRaw, manifest] = await Promise.all([
    fs.readFile(exposureFile, 'utf8'),
    fs.readFile(hotspotsPath, 'utf8'),
    readManifest(),
  ]);

  const exposureRecords = parse(exposureRaw, { columns: true, skip_empty_lines: true });
  const hotspotRecords = parse(hotspotsRaw, { columns: true, skip_empty_lines: true });

  const exposure = exposureRecords.map(normalizeRow);
  const hotspots = hotspotRecords.map((h) => ({
    name: String(h.name || '').trim(),
    lat: num(h.lat),
    lon: num(h.lon),
  }));

  portfolioCache = { exposure, hotspots, manifest };
  return portfolioCache;
}

export function computePortfolioSummary(exposure) {
  const total_tiv_kes = exposure.reduce((s, r) => s + r.tiv_kes, 0);
  const by_housing = {};
  for (const row of exposure) {
    if (!by_housing[row.housing_class]) {
      by_housing[row.housing_class] = {
        housing_class: row.housing_class,
        label: row.housing_label,
        count: 0,
        tiv_kes: 0,
      };
    }
    by_housing[row.housing_class].count += 1;
    by_housing[row.housing_class].tiv_kes += row.tiv_kes;
  }
  return {
    location_count: exposure.length,
    total_tiv_kes,
    synthetic: true,
    by_housing: Object.values(by_housing),
  };
}

/**
 * Hazard landscape from the active exposure CSV — same return periods / tiers as the map scenario control.
 * Values are TIV × hazard (0–1) summed across locations: an exposure index, not team financial loss.
 */
export function computeHazardLandscapeCurve(exposure = []) {
  const total_tiv_kes = exposure.reduce((s, r) => s + r.tiv_kes, 0);
  const points = TIERS.map((tier) => {
    let hazard_weighted_tiv_kes = 0;
    for (const row of exposure) {
      hazard_weighted_tiv_kes += row.tiv_kes * (row.hazards?.[tier.id] ?? 0);
    }
    const avg_hazard = total_tiv_kes > 0 ? hazard_weighted_tiv_kes / total_tiv_kes : 0;
    return {
      tier: tier.id,
      label: tier.label,
      return_period_years: tier.returnPeriodYears,
      aep: tier.aep,
      avg_hazard,
      hazard_weighted_tiv_kes,
      /** @deprecated alias for chart components expecting loss_kes */
      portfolio_loss_kes: hazard_weighted_tiv_kes,
      loss_pct_of_tiv: avg_hazard,
    };
  });

  return {
    source: 'csv_hazard_landscape',
    engine: 'hazard_weighted_tiv',
    note:
      'Built from hazard scores in the current exposure CSV (same tiers as the map). Upload team EP CSV for financial loss estimates.',
    points,
    ep_curve: points.map((p) => ({
      return_period_years: p.return_period_years,
      aep: p.aep,
      loss_kes: p.hazard_weighted_tiv_kes,
      avg_hazard: p.avg_hazard,
    })),
    total_tiv_kes,
    location_count: exposure.length,
  };
}

/** Landscape from CSV; financial EP remains external upload. */
export async function computeLossCurve(exposure) {
  return computeHazardLandscapeCurve(exposure || []);
}

export async function enrichRow(row, tierId) {
  return rowForTier(row, tierId);
}

export async function tierLossesForRow(row) {
  return TIERS.map((t) => ({
    tier: t.id,
    label: t.label,
    return_period_years: t.returnPeriodYears,
    aep: t.aep,
    hazard: row.hazards[t.id],
    hazard_band: hazardBand(row.hazards[t.id]),
  }));
}

export async function computeExposureMap(exposure, _hotspots, tierId) {
  const rows = exposure.map((row) => rowForTier(row, tierId));
  return {
    tier: tierId,
    count: rows.length,
    locations: rows.map((e) => ({
      loc_id: e.loc_id,
      lat: e.lat,
      lon: e.lon,
      housing_class: e.housing_class,
      housing_label: e.housing_label,
      tiv_kes: e.tiv_kes,
      hazard: e.hazard,
      max_hazard: e.max_hazard,
      hazard_band: e.hazard_band,
      cedant_id: e.cedant_id,
      cedant_name: e.cedant_name,
      kenya_re_in_book: e.kenya_re_in_book,
    })),
  };
}

export async function getMeta() {
  const manifest = await readManifest();
  return {
    region_id: manifest.region_id || REGION_ID,
    region_label: manifest.region_label || REGION_LABEL,
    peril_label: PERIL_LABEL,
    data_dir: path.basename(DATA_DIR),
    exposure_csv: EXPOSURE_CSV,
    hotspots_csv: HOTSPOTS_CSV,
    challenge: `Team A — ${REGION_LABEL} ${PERIL_LABEL}`,
    data_label: 'Exposure CSV · hazard scores 0–1 (not a financial model)',
    tiers: TIERS.map(({ id, label, returnPeriodYears, aep }) => ({
      id,
      label,
      return_period_years: returnPeriodYears,
      aep,
    })),
    cedants: CEDANTS,
    treaty_book_field: 'kenya_re_in_book',
    cedant_fields: ['cedant_id', 'cedant_name'],
    financial_model: 'external_upload_only',
  };
}
