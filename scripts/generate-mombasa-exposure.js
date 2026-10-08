/**
 * One-off generator: Mombasa exposure CSV (same schema as Nairobi with_hazard).
 * Run: node scripts/generate-mombasa-exposure.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const N = 150;

const HOUSING = [
  { c: 'informal_iron_sheet', fa: [8, 24], cpm: [5200, 9800] },
  { c: 'semi_permanent', fa: [28, 58], cpm: [9000, 14200] },
  { c: 'permanent_masonry', fa: [64, 174], cpm: [38700, 62100] },
  { c: 'concrete_rcc', fa: [400, 1100], cpm: [74000, 82000] },
];

const CLUSTERS = [
  { lat: -4.055, lon: 39.662, spread: 0.018, floodBias: 0.35, name: 'Mombasa Island / port' },
  { lat: -4.088, lon: 39.655, spread: 0.015, floodBias: 0.55, name: 'Likoni / channel' },
  { lat: -4.025, lon: 39.712, spread: 0.012, floodBias: 0.25, name: 'Nyali' },
  { lat: -3.998, lon: 39.738, spread: 0.014, floodBias: 0.15, name: 'Bamburi / north coast' },
  { lat: -4.035, lon: 39.628, spread: 0.016, floodBias: 0.45, name: 'Tudor / creek fringe' },
];

function rnd(i, salt) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function hazardFor(i, floodBias) {
  const base = rnd(i, 1) * 0.55 + floodBias * rnd(i, 2) * 0.45;
  const common = Math.min(0.95, base + rnd(i, 3) * 0.12);
  const occasional = Math.max(0, common - rnd(i, 4) * 0.08);
  const moderate = Math.max(0, occasional - rnd(i, 5) * 0.1);
  const severe = Math.max(0, moderate - rnd(i, 6) * 0.12);
  const extreme = Math.max(0, severe - rnd(i, 7) * 0.14);
  return [common, occasional, moderate, severe, extreme].map((v) => +v.toFixed(16));
}

function escCsv(s) {
  const t = String(s);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

const source =
  'synthetic Mombasa coastal flood demo for Casta4 map upload — not a real portfolio';

const header =
  'loc_id,lat,lon,housing_class,floor_area_m2,cost_per_m2_kes,tiv_kes,synthetic,source,hazard_score_common,hazard_score_occasional,hazard_score_moderate,hazard_score_severe,hazard_score_extreme';

const rows = [header];

for (let i = 0; i < N; i += 1) {
  const cl = CLUSTERS[i % CLUSTERS.length];
  const lat = cl.lat + (rnd(i, 10) - 0.5) * 2 * cl.spread;
  const lon = cl.lon + (rnd(i, 11) - 0.5) * 2 * cl.spread;
  const h = HOUSING[Math.floor(rnd(i, 12) * HOUSING.length)];
  const fa = Math.round(h.fa[0] + rnd(i, 13) * (h.fa[1] - h.fa[0]));
  const cpm = Math.round(h.cpm[0] + rnd(i, 14) * (h.cpm[1] - h.cpm[0]));
  const tiv = fa * cpm;
  const haz = hazardFor(i, cl.floodBias);
  const loc = `MBSA-${String(i).padStart(4, '0')}`;
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
      escCsv(source),
      ...haz,
    ].join(',')
  );
}

const out = path.join(ROOT, 'data', 'team_a_mombasa', 'exposure_mombasa_with_hazard.csv');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${rows.join('\n')}\n`, 'utf8');
console.log(`Wrote ${out} (${N} locations)`);
console.log('Clusters:', CLUSTERS.map((c) => c.name).join('; '));
