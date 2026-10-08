/**
 * External team EP curve CSV (Monte Carlo / financial engine output).
 */

import fs from 'fs/promises';
import { parse } from 'csv-parse/sync';
import { epModelPath } from './workspace-store.js';

const REQUIRED = ['return_period_years', 'loss_kes'];

export function validateEpModelHeaders(headerLine) {
  const cols = headerLine.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const missing = REQUIRED.filter((c) => !cols.includes(c));
  return { ok: missing.length === 0, missing, columns: cols };
}

function num(v) {
  const n = Number(String(v || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export async function loadExternalEpCurve() {
  try {
    const raw = await fs.readFile(epModelPath(), 'utf8');
    const rows = parse(raw, { columns: true, skip_empty_lines: true });
    const points = rows
      .map((r) => ({
        return_period_years: num(r.return_period_years),
        aep: r.aep != null && r.aep !== '' ? num(r.aep) : undefined,
        loss_kes: num(r.loss_kes),
        loss_net_kes: r.loss_net_kes != null && r.loss_net_kes !== '' ? num(r.loss_net_kes) : undefined,
        loss_p05_kes: r.loss_p05_kes != null && r.loss_p05_kes !== '' ? num(r.loss_p05_kes) : undefined,
        loss_p95_kes: r.loss_p95_kes != null && r.loss_p95_kes !== '' ? num(r.loss_p95_kes) : undefined,
        tier: String(r.tier || '').trim() || undefined,
        label: String(r.label || '').trim() || undefined,
      }))
      .filter((p) => p.return_period_years > 0)
      .sort((a, b) => a.return_period_years - b.return_period_years);

    for (const p of points) {
      if (p.aep == null || p.aep === 0) {
        p.aep = 1 / p.return_period_years;
      }
    }

    return {
      source: 'external_team',
      points,
      ep_curve: points.map((p) => ({
        return_period_years: p.return_period_years,
        aep: p.aep,
        loss_kes: p.loss_kes,
      })),
      ep_curve_net: points.some((p) => p.loss_net_kes != null)
        ? points.map((p) => ({
            return_period_years: p.return_period_years,
            aep: p.aep,
            loss_kes: p.loss_net_kes ?? p.loss_kes,
          }))
        : null,
      uncertainty_band: points.some((p) => p.loss_p05_kes != null && p.loss_p95_kes != null)
        ? points.map((p) => ({
            return_period_years: p.return_period_years,
            p05_kes: p.loss_p05_kes,
            p95_kes: p.loss_p95_kes,
          }))
        : null,
    };
  } catch {
    return null;
  }
}
