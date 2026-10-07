/**
 * Nairobi pluvial flood CAT — hazard, vulnerability, and loss (Team A starter data).
 * Assumptions are returned in meta for UI / judges.
 */

import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'team_a_nairobi');

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

function normalizeRow(raw) {
  const hazards = {};
  for (const tier of TIERS) {
    hazards[tier.id] = num(raw[tier.field]);
  }
  const maxHazard = Math.max(...Object.values(hazards));
  return {
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
  };
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

export async function loadPortfolio() {
  if (portfolioCache) return portfolioCache;

  const exposurePath = path.join(DATA_DIR, 'exposure_nairobi_with_hazard.csv');
  const hotspotsPath = path.join(DATA_DIR, 'nairobi_hotspots_geocoded.csv');

  const [exposureRaw, hotspotsRaw] = await Promise.all([
    fs.readFile(exposurePath, 'utf8'),
    fs.readFile(hotspotsPath, 'utf8'),
  ]);

  const exposureRecords = parse(exposureRaw, { columns: true, skip_empty_lines: true });
  const hotspotRecords = parse(hotspotsRaw, { columns: true, skip_empty_lines: true });

  const exposure = exposureRecords.map(normalizeRow);
  const hotspots = hotspotRecords.map((h) => ({
    name: String(h.name || '').trim(),
    lat: num(h.lat),
    lon: num(h.lon),
  }));

  portfolioCache = { exposure, hotspots };
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
    challenge: 'Team A — Nairobi Urban Flood (pluvial proxy)',
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
    },
    financial_engine: 'Ground-up loss = damage_ratio × tiv_kes; no treaty layers in scope.',
  };
}
