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

export const HOUSING_LABELS = {
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

export function buildDamageMatrix(step = 0.05) {
  const scores = [];
  for (let value = 0; value <= 1 + step / 2; value += step) {
    scores.push(Number(value.toFixed(2)));
  }

  const matrix = {};
  for (const [housingClass, params] of Object.entries(VULNERABILITY)) {
    matrix[housingClass] = {};
    for (const score of scores) {
      matrix[housingClass][score] = damageRatio(housingClass, score);
    }
  }

  return matrix;
}

function normalizeHazardValues(raw) {
  const hazards = {};
  const hazardAliases = {
    common: ['hazard_score_common', 'hazard_common', 'severity_score_common', 'severity_common'],
    occasional: ['hazard_score_occasional', 'hazard_occasional', 'severity_score_occasional', 'severity_occasional'],
    moderate: ['hazard_score_moderate', 'hazard_moderate', 'severity_score_moderate', 'severity_moderate'],
    severe: ['hazard_score_severe', 'hazard_severe', 'severity_score_severe', 'severity_severe'],
    extreme: ['hazard_score_extreme', 'hazard_extreme', 'severity_score_extreme', 'severity_extreme'],
  };

  for (const tier of TIERS) {
    const aliases = hazardAliases[tier.id] || [tier.field];
    const value = aliases
      .map((field) => raw[field])
      .find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim() !== '');
    hazards[tier.id] = num(value ?? raw[tier.field]);
  }

  return hazards;
}

function generateLocId(raw, fallback = 'loc') {
  const trimmed = String(raw.loc_id || raw.property_id || raw.building_id || raw.asset_id || raw.id || '').trim();
  if (trimmed) return trimmed;

  const lat = num(raw.lat);
  const lon = num(raw.lon);
  const housing = String(raw.housing_class || raw.construction_type || raw.type || '').trim();
  const suffix = `${Math.abs(Math.round((lat || 0) * 1_000_000))}-${Math.abs(Math.round((lon || 0) * 1_000_000))}`;
  return `${fallback}-${housing || 'asset'}-${suffix}`;
}

export function parseExposureCsv(csvContent) {
  const text = String(csvContent || '').trim();
  if (!text) return [];

  const csvRows = parse(text, { columns: true, skip_empty_lines: true });
  return csvRows.map((raw) => normalizeRow(raw));
}

function normalizeRow(raw) {
  const hazards = normalizeHazardValues(raw);
  const maxHazard = Math.max(...Object.values(hazards), 0);
  const housingClass = String(raw.housing_class || raw.construction_type || raw.building_type || '').trim();
  const base = {
    loc_id: generateLocId(raw, 'B'),
    lat: num(raw.lat),
    lon: num(raw.lon),
    housing_class: housingClass,
    housing_label: HOUSING_LABELS[housingClass] || housingClass || raw.housing_label || 'Unknown',
    floor_area_m2: num(raw.floor_area_m2),
    cost_per_m2_kes: num(raw.cost_per_m2_kes),
    tiv_kes: num(raw.tiv_kes),
    synthetic: String(raw.synthetic ?? true).toLowerCase() === 'true',
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

<<<<<<< HEAD
export function tierLossesForRow(row) {
  return TIERS.map((tier) => {
    const hazard = row.hazards[tier.id];
    const dr = damageRatio(row.housing_class, hazard);
    return {
      tier: tier.id,
      label: tier.label,
      return_period_years: tier.returnPeriodYears,
      aep: tier.aep,
      hazard,
      damage_ratio: dr,
      loss_kes: dr * row.tiv_kes,
    };
  });
}

async function resolveExposureCsvPath() {
  const candidates = [
    process.env.CAT_EXPOSURE_CSV,
    EXPOSURE_CSV,
    'exposure_nairobi_with_hazard.csv',
    'exposure_nairobi_with_csv.csv',
    'exposure_nairobi.csv',
    'exposure.csv',
  ].filter(Boolean);

  const unique = [...new Set(candidates)];
  for (const candidate of unique) {
    const fullPath = path.isAbsolute(candidate) ? candidate : path.join(DATA_DIR, candidate);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {
      // keep looking for the actual exposure file in the configured folder
    }
  }

  return path.join(DATA_DIR, unique[0] || 'exposure_nairobi_with_hazard.csv');
}

export async function loadPortfolioFromCsv(exposureCsvText, hotspotsCsvText = '', options = {}) {
  const exposure = parseExposureCsv(exposureCsvText);
  const hotspotText = String(hotspotsCsvText || '').trim();
  const hotspotRecords = hotspotText
    ? parse(hotspotText, { columns: true, skip_empty_lines: true })
    : [];

  const hotspots = hotspotRecords.map((h) => ({
    name: String(h.name || h.location || '').trim(),
    lat: num(h.lat),
    lon: num(h.lon),
  }));

  return {
    exposure,
    hotspots,
    source: options.source || 'uploaded',
  };
}

export async function loadPortfolio() {
  if (portfolioCache) return portfolioCache;

  const exposurePath = await resolveExposureCsvPath();
=======
export async function loadPortfolio() {
  if (portfolioCache) return portfolioCache;

  let exposureFile = path.join(DATA_DIR, EXPOSURE_CSV);
  try {
    await fs.access(workspaceExposurePath());
    exposureFile = workspaceExposurePath();
  } catch {
    /* bundled data */
  }

>>>>>>> 29e4012b82039c8abc69db7bef5298caef5493a3
  const hotspotsPath = path.join(DATA_DIR, HOTSPOTS_CSV);

  const [exposureRaw, hotspotsRaw, manifest] = await Promise.all([
    fs.readFile(exposureFile, 'utf8'),
    fs.readFile(hotspotsPath, 'utf8'),
    readManifest(),
  ]);

  const exposure = parseExposureCsv(exposureRaw);
  const hotspotRecords = parse(hotspotsRaw, { columns: true, skip_empty_lines: true });

  const hotspots = hotspotRecords.map((h) => ({
    name: String(h.name || '').trim(),
    lat: num(h.lat),
    lon: num(h.lon),
  }));

<<<<<<< HEAD
  portfolioCache = { exposure, hotspots, source: 'default' };
=======
  portfolioCache = { exposure, hotspots, manifest };
>>>>>>> 29e4012b82039c8abc69db7bef5298caef5493a3
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
  const { damageRatioForClass } = await import('./vulnerability-matrix.js');
  return Promise.all(
    TIERS.map(async (t) => {
      const hazard = row.hazards[t.id];
      const damage_ratio = await damageRatioForClass(row.housing_class, hazard);
      return {
        tier: t.id,
        label: t.label,
        return_period_years: t.returnPeriodYears,
        aep: t.aep,
        hazard,
        hazard_band: hazardBand(hazard),
        damage_ratio,
      };
    })
  );
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
<<<<<<< HEAD
    vulnerability: {
      method: 'Exponential damage from susceptibility score, capped by housing class (JRC-inspired, not calibrated to Kenya claims).',
      classes: VULNERABILITY,
      damage_matrix: buildDamageMatrix(),
    },
    financial_engine: 'Ground-up loss = damage_ratio × tiv_kes; no treaty layers in scope.',
=======
>>>>>>> 29e4012b82039c8abc69db7bef5298caef5493a3
    cedants: CEDANTS,
    treaty_book_field: 'kenya_re_in_book',
    cedant_fields: ['cedant_id', 'cedant_name'],
    financial_model: 'external_upload_only',
  };
}
