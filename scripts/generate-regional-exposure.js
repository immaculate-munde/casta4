/**
 * Synthetic regional exposure CSVs (same schema as exposure_nairobi_with_hazard.csv).
 *
 * Run: node scripts/generate-regional-exposure.js
 * Optional: node scripts/generate-regional-exposure.js kisumu wajir
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const N_DEFAULT = 150;

const HOUSING = [
  { c: 'informal_iron_sheet', fa: [8, 24], cpm: [5200, 9800] },
  { c: 'semi_permanent', fa: [28, 58], cpm: [9000, 14200] },
  { c: 'permanent_masonry', fa: [64, 174], cpm: [38700, 62100] },
  { c: 'concrete_rcc', fa: [400, 1100], cpm: [74000, 82000] },
];

/** @type {Record<string, { slug: string, label: string, prefix: string, sourceNote: string, clusters: { lat: number, lon: number, spread: number, floodBias: number, name: string }[] }>} */
export const REGIONS = {
  mombasa: {
    slug: 'mombasa',
    label: 'Mombasa',
    prefix: 'MBSA',
    sourceNote: 'synthetic Mombasa coastal flood demo for Casta4 — not a real portfolio',
    clusters: [
      { lat: -4.055, lon: 39.662, spread: 0.018, floodBias: 0.35, name: 'Mombasa Island / port' },
      { lat: -4.088, lon: 39.655, spread: 0.015, floodBias: 0.55, name: 'Likoni / channel' },
      { lat: -4.025, lon: 39.712, spread: 0.012, floodBias: 0.25, name: 'Nyali' },
      { lat: -3.998, lon: 39.738, spread: 0.014, floodBias: 0.15, name: 'Bamburi / north coast' },
      { lat: -4.035, lon: 39.628, spread: 0.016, floodBias: 0.45, name: 'Tudor / creek fringe' },
    ],
  },
  kisumu: {
    slug: 'kisumu',
    label: 'Kisumu',
    prefix: 'KSM',
    sourceNote: 'synthetic Kisumu lake-basin flood demo for Casta4 — not a real portfolio',
    clusters: [
      { lat: -0.102, lon: 34.762, spread: 0.014, floodBias: 0.2, name: 'Kisumu CBD' },
      { lat: -0.118, lon: 34.748, spread: 0.016, floodBias: 0.55, name: 'Dunga / Winam Gulf shore' },
      { lat: -0.095, lon: 34.785, spread: 0.012, floodBias: 0.35, name: 'Nyalenda / Manyatta' },
      { lat: -0.088, lon: 34.735, spread: 0.013, floodBias: 0.28, name: 'Milimani / west' },
      { lat: -0.108, lon: 34.805, spread: 0.015, floodBias: 0.42, name: 'Kibos / river fringe' },
    ],
  },
  wajir: {
    slug: 'wajir',
    label: 'Wajir',
    prefix: 'WJR',
    sourceNote: 'synthetic Wajir seasonal flash-flood demo for Casta4 — not a real portfolio',
    clusters: [
      { lat: 1.747, lon: 40.057, spread: 0.012, floodBias: 0.12, name: 'Wajir town centre' },
      { lat: 1.735, lon: 40.042, spread: 0.014, floodBias: 0.38, name: 'Seasonal lagga / east fringe' },
      { lat: 1.758, lon: 40.072, spread: 0.011, floodBias: 0.22, name: 'North settlement belt' },
      { lat: 1.728, lon: 40.068, spread: 0.013, floodBias: 0.45, name: 'South wadi corridor' },
      { lat: 1.752, lon: 40.035, spread: 0.01, floodBias: 0.08, name: 'West arid buffer' },
    ],
  },
  turkana: {
    slug: 'turkana',
    label: 'Turkana',
    prefix: 'TRK',
    sourceNote: 'synthetic Turkana river-lake flood demo for Casta4 — not a real portfolio',
    clusters: [
      { lat: 3.119, lon: 35.597, spread: 0.016, floodBias: 0.25, name: 'Lodwar town' },
      { lat: 3.105, lon: 35.615, spread: 0.014, floodBias: 0.48, name: 'Turkwel river fringe' },
      { lat: 3.128, lon: 35.575, spread: 0.012, floodBias: 0.15, name: 'Lodwar north' },
      { lat: 2.85, lon: 36.35, spread: 0.02, floodBias: 0.32, name: 'Lake Turkana south shore (Kalokol)' },
      { lat: 3.05, lon: 35.72, spread: 0.018, floodBias: 0.2, name: 'Kerio triangle fringe' },
    ],
  },
};

function rnd(i, salt, regionSeed = 0) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233 + regionSeed * 19.17) * 43758.5453;
  return x - Math.floor(x);
}

function hazardFor(i, floodBias, regionSeed) {
  const base = rnd(i, 1, regionSeed) * 0.55 + floodBias * rnd(i, 2, regionSeed) * 0.45;
  const common = Math.min(0.95, base + rnd(i, 3, regionSeed) * 0.12);
  const occasional = Math.max(0, common - rnd(i, 4, regionSeed) * 0.08);
  const moderate = Math.max(0, occasional - rnd(i, 5, regionSeed) * 0.1);
  const severe = Math.max(0, moderate - rnd(i, 6, regionSeed) * 0.12);
  const extreme = Math.max(0, severe - rnd(i, 7, regionSeed) * 0.14);
  return [common, occasional, moderate, severe, extreme].map((v) => +v.toFixed(16));
}

function escCsv(s) {
  const t = String(s);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

const HEADER =
  'loc_id,lat,lon,housing_class,floor_area_m2,cost_per_m2_kes,tiv_kes,synthetic,source,hazard_score_common,hazard_score_occasional,hazard_score_moderate,hazard_score_severe,hazard_score_extreme';

export function generateRegionCsv(regionKey, n = N_DEFAULT) {
  const region = REGIONS[regionKey];
  if (!region) throw new Error(`Unknown region: ${regionKey}`);
  const regionSeed = Object.keys(REGIONS).indexOf(regionKey) + 1;
  const rows = [HEADER];

  for (let i = 0; i < n; i += 1) {
    const cl = region.clusters[i % region.clusters.length];
    const lat = cl.lat + (rnd(i, 10, regionSeed) - 0.5) * 2 * cl.spread;
    const lon = cl.lon + (rnd(i, 11, regionSeed) - 0.5) * 2 * cl.spread;
    const h = HOUSING[Math.floor(rnd(i, 12, regionSeed) * HOUSING.length)];
    const fa = Math.round(h.fa[0] + rnd(i, 13, regionSeed) * (h.fa[1] - h.fa[0]));
    const cpm = Math.round(h.cpm[0] + rnd(i, 14, regionSeed) * (h.cpm[1] - h.cpm[0]));
    const tiv = fa * cpm;
    const haz = hazardFor(i, cl.floodBias, regionSeed);
    const loc = `${region.prefix}-${String(i).padStart(4, '0')}`;
    rows.push(
      [
        loc,
        lat.toFixed(6),
        lon.toFixed(6),
        h.c,
        fa,
        cpm,
        tiv.toFixed(1),
        'True',
        escCsv(region.sourceNote),
        ...haz,
      ].join(',')
    );
  }

  return rows.join('\n') + '\n';
}

export function writeRegionFile(regionKey, n = N_DEFAULT) {
  const region = REGIONS[regionKey];
  const dir = path.join(ROOT, 'data', `team_a_${region.slug}`);
  const file = path.join(dir, `exposure_${region.slug}_with_hazard.csv`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, generateRegionCsv(regionKey, n), 'utf8');
  return file;
}

function runCli() {
  const args = process.argv.slice(2).map((a) => a.toLowerCase());
  const keys = args.length ? args.filter((k) => REGIONS[k]) : Object.keys(REGIONS);
  const unknown = args.filter((k) => !REGIONS[k]);
  if (unknown.length) {
    console.warn('Ignored unknown regions:', unknown.join(', '));
  }
  if (!keys.length) {
    console.error('No valid regions. Choose:', Object.keys(REGIONS).join(', '));
    process.exit(1);
  }

  for (const key of keys) {
    const out = writeRegionFile(key);
    console.log(`Wrote ${out} (${N_DEFAULT} locs, prefix ${REGIONS[key].prefix})`);
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) runCli();
