/**
 * External team EP curve CSV (Monte Carlo / financial engine output).
 */

import fs from 'fs/promises';
import { parse } from 'csv-parse/sync';
import { buildEpViewsFromPoints } from './model-io.js';
import { epModelPath } from './workspace-store.js';

const REQUIRED = ['return_period_years', 'loss_kes'];

const HEADER_ALIASES = {
  return_period_years: [
    'return_period_years',
    'return_period_year',
    'return_period',
    'returnperiodyears',
    'returnperiod',
    'return_period_yrs',
    'return_period_yr',
    'rp_years',
    'rpyears',
    'returnperiodyears',
    'return_period_years_yr',
  ],
  loss_kes: [
    'loss_kes',
    'loss',
    'gross_loss_kes',
    'gross_loss',
    'losskes',
    'grossloss',
    'grosslosskes',
  ],
  aep: ['aep', 'annual_exceedance_probability', 'annual_exceedance_prob', 'chance_of_exceedance'],
  loss_net_kes: ['loss_net_kes', 'net_loss_kes', 'net_loss', 'loss_net'],
  loss_p05_kes: ['loss_p05_kes', 'p05_loss_kes', 'loss_5_pct_kes', 'loss_q05_kes'],
  loss_p95_kes: ['loss_p95_kes', 'p95_loss_kes', 'loss_95_pct_kes', 'loss_q95_kes'],
  tier: ['tier', 'series', 'scenario', 'model_tier'],
  label: ['label', 'name', 'series_label', 'description'],
  series: ['series', 'scenario'],
};

function normalizeHeaderName(value = '') {
  return String(value)
    .trim()
    .replace(/\uFEFF/g, '')
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[%\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function canonicalHeaderName(value = '') {
  const normalized = normalizeHeaderName(value);
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return canonical;
  }
  return normalized;
}

function detectDelimiter(line = '') {
  const sample = String(line || '').trim();
  if (!sample) return ',';
  if (/;/.test(sample) && !/,/.test(sample)) return ';';
  if (/,/.test(sample)) return ',';
  if (/\t/.test(sample)) return '\t';
  return '|';
}

function splitHeaderLine(headerLine) {
  const line = String(headerLine || '').trim();
  if (!line) return [];
  const delimiter = detectDelimiter(line);

  return line
    .split(delimiter)
    .map((c) => c.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
}

export function validateEpModelHeaders(headerLine) {
  const cols = splitHeaderLine(headerLine).map((c) => canonicalHeaderName(c));
  const missing = REQUIRED.filter((c) => !cols.includes(c));
  return { ok: missing.length === 0, missing, columns: splitHeaderLine(headerLine), normalized: cols };
}

export function normalizeEpModelRow(row = {}) {
  return Object.fromEntries(
    Object.entries(row)
      .map(([key, value]) => [canonicalHeaderName(key), value])
      .filter(([key]) => key)
  );
}

function num(v) {
  const n = Number(String(v || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export async function loadExternalEpCurve() {
  try {
    const raw = await fs.readFile(epModelPath(), 'utf8');
    const firstLine = raw.split(/\r?\n/).find((line) => line.trim()) || '';
    const delimiter = detectDelimiter(firstLine);
    const rows = parse(raw, { columns: true, skip_empty_lines: true, bom: true, delimiter });
    const points = rows
      .map((r) => {
        const record = normalizeEpModelRow(r);
        return {
          return_period_years: num(record.return_period_years),
          aep: record.aep != null && record.aep !== '' ? num(record.aep) : undefined,
          loss_kes: num(record.loss_kes),
          loss_net_kes: record.loss_net_kes != null && record.loss_net_kes !== '' ? num(record.loss_net_kes) : undefined,
          loss_p05_kes: record.loss_p05_kes != null && record.loss_p05_kes !== '' ? num(record.loss_p05_kes) : undefined,
          loss_p95_kes: record.loss_p95_kes != null && record.loss_p95_kes !== '' ? num(record.loss_p95_kes) : undefined,
          tier: String(record.tier || '').trim() || undefined,
          label: String(record.label || '').trim() || undefined,
        };
      })
      .filter((p) => p.return_period_years > 0)
      .sort((a, b) => a.return_period_years - b.return_period_years);

    for (const p of points) {
      if (p.aep == null || p.aep === 0) {
        p.aep = 1 / p.return_period_years;
      }
    }

    const { views, available } = buildEpViewsFromPoints(points);

    return {
      source: 'external_team',
      points,
      ep_views: views,
      ep_views_available: available,
      ep_curve: views.gross.points,
      ep_curve_net: views.net?.points ?? null,
      uncertainty_band: views.uncertainty?.band ?? null,
    };
  } catch {
    return null;
  }
}
