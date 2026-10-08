/**
 * Nairobi pluvial flood CAT — hazard, vulnerability, and loss (Team A starter data).
 * Assumptions are returned in meta for UI / judges.
 */

import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
import { attachCedantFields, CEDANTS } from './portfolio-cedant.js';

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
  {
    id: 'common',
    field: 'hazard_score_common',
    label: 'Common',
    returnPeriodYears: 5,
    aep: 0.2,
  },
  {
    id: 'occasional',
    field: 'hazard_score_occasional',
    label: 'Occasional',
    returnPeriodYears: 10,
    aep: 0.1,
  },
  {
    id: 'moderate',
    field: 'hazard_score_moderate',
    label: 'Moderate',
    returnPeriodYears: 25,
    aep: 0.04,
  },
  {
    id: 'severe',
    field: 'hazard_score_severe',
    label: 'Severe',
    returnPeriodYears: 100,
    aep: 0.01,
  },
  {
    id: 'extreme',
    field: 'hazard_score_extreme',
    label: 'Extreme',
    returnPeriodYears: 250,
    aep: 0.004,
  },
];

/** Vulnerability: damage ratio from 0–1 susceptibility score × housing class (adapted JRC-style curve). */
const VULNERABILITY = {
  informal_iron_sheet: { cap: 0.92, alpha: 4.2 },
  semi_permanent: { cap: 0.88, alpha: 3.6 },
  permanent_masonry: { cap: 0.85, alpha: 3.0 },
  concrete_rcc: { cap: 0.8, alpha: 2.4 },
};

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

export function damageRatio(housingClass, hazardScore) {
  const h = Math.max(0, Math.min(1, num(hazardScore)));
  const params = VULNERABILITY[housingClass] || VULNERABILITY.semi_permanent;
  const ratio = params.cap * (1 - Math.exp(-params.alpha * h));
  return Math.min(params.cap, ratio);
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
  };
  return attachCedantFields(raw, base);
}

export function enrichRow(row, tierId) {
  const tier = TIERS.find((t) => t.id === tierId) || TIERS[2];
  const hazard = row.hazards[tier.id];
  const dr = damageRatio(row.housing_class, hazard);
  const loss_kes = dr * row.tiv_kes;
  return {
    ...row,
    active_tier: tier.id,
    hazard,
    hazard_band: hazardBand(hazard),
    damage_ratio: dr,
    loss_kes,
  };
}

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
  const hotspotsPath = path.join(DATA_DIR, HOTSPOTS_CSV);

  const [exposureRaw, hotspotsRaw] = await Promise.all([
    fs.readFile(exposurePath, 'utf8'),
    fs.readFile(hotspotsPath, 'utf8'),
  ]);

  const exposure = parseExposureCsv(exposureRaw);
  const hotspotRecords = parse(hotspotsRaw, { columns: true, skip_empty_lines: true });

  const hotspots = hotspotRecords.map((h) => ({
    name: String(h.name || '').trim(),
    lat: num(h.lat),
    lon: num(h.lon),
  }));

  portfolioCache = { exposure, hotspots, source: 'default' };
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

export function computeLossCurve(exposure) {
  const points = TIERS.map((tier) => {
    let portfolio_loss_kes = 0;
    const by_housing = {};

    for (const row of exposure) {
      const hazard = row.hazards[tier.id];
      const dr = damageRatio(row.housing_class, hazard);
      const loss = dr * row.tiv_kes;
      portfolio_loss_kes += loss;

      if (!by_housing[row.housing_class]) {
        by_housing[row.housing_class] = { housing_class: row.housing_class, label: row.housing_label, loss_kes: 0, tiv_kes: 0 };
      }
      by_housing[row.housing_class].loss_kes += loss;
      by_housing[row.housing_class].tiv_kes += row.tiv_kes;
    }

    return {
      tier: tier.id,
      label: tier.label,
      return_period_years: tier.returnPeriodYears,
      aep: tier.aep,
      portfolio_loss_kes,
      loss_pct_of_tiv: totalTiv(exposure) > 0 ? portfolio_loss_kes / totalTiv(exposure) : 0,
      by_housing: Object.values(by_housing),
    };
  });

  return {
    points,
    ep_curve: points.map((p) => ({
      return_period_years: p.return_period_years,
      aep: p.aep,
      loss_kes: p.portfolio_loss_kes,
    })),
  };
}

function totalTiv(exposure) {
  return exposure.reduce((s, r) => s + r.tiv_kes, 0);
}

export function getMeta() {
  return {
    region_id: REGION_ID,
    region_label: REGION_LABEL,
    peril_label: PERIL_LABEL,
    data_dir: path.basename(DATA_DIR),
    exposure_csv: EXPOSURE_CSV,
    hotspots_csv: HOTSPOTS_CSV,
    challenge: `Team A — ${REGION_LABEL} ${PERIL_LABEL}`,
    data_label: 'Synthetic exposure · hazard proxy 0–1 (not measured depth)',
    hotspot_validation_note: 'Starter proxy flags 12 of 24 county-named hotspots (drainage gaps explain misses).',
    tiers: TIERS.map(({ id, label, returnPeriodYears, aep }) => ({
      id,
      label,
      return_period_years: returnPeriodYears,
      aep,
    })),
    vulnerability: {
      method: 'Exponential damage from susceptibility score, capped by housing class (JRC-inspired, not calibrated to Kenya claims).',
      classes: VULNERABILITY,
      damage_matrix: buildDamageMatrix(),
    },
    financial_engine: 'Ground-up loss = damage_ratio × tiv_kes; no treaty layers in scope.',
    cedants: CEDANTS,
    treaty_book_field: 'kenya_re_in_book',
    cedant_fields: ['cedant_id', 'cedant_name'],
  };
}
