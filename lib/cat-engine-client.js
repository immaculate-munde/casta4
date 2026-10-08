import axios from 'axios';
import fs from 'fs/promises';
import { exposurePath, readCatSettings } from './workspace-store.js';

const BASE = (process.env.CAT_MODEL_URL || '').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.CAT_MODEL_TIMEOUT_MS) || 120_000;

let healthCache = { ok: false, checkedAt: 0 };

export function catModelConfigured() {
  return Boolean(BASE);
}

export async function catEngineHealthy(force = false) {
  if (!BASE) return false;
  const now = Date.now();
  if (!force && now - healthCache.checkedAt < 30_000) return healthCache.ok;
  try {
    const { data } = await axios.get(`${BASE}/health`, { timeout: 5000 });
    healthCache = { ok: Boolean(data?.ok), checkedAt: now };
  } catch {
    healthCache = { ok: false, checkedAt: now };
  }
  return healthCache.ok;
}

export async function readActiveExposureCsv() {
  return fs.readFile(exposurePath(), 'utf8');
}

/**
 * Run Linus portfolio simulation on active workspace exposure (or provided CSV).
 */
export async function runCatSimulation(options = {}) {
  if (!BASE) {
    const err = new Error('CAT_MODEL_URL is not set');
    err.status = 503;
    throw err;
  }

  const saved = await readCatSettings();
  const csv = options.csv ?? (await readActiveExposureCsv());
  const { data } = await axios.post(
    `${BASE}/simulate`,
    {
      csv,
      use_ai_rectifier: options.use_ai_rectifier ?? saved.use_ai_rectifier,
      deductible_pct: options.deductible_pct ?? saved.deductible_pct,
      reinsurance_qs_pct: options.reinsurance_qs_pct ?? saved.reinsurance_qs_pct,
      influence_km: options.influence_km ?? saved.influence_km,
    },
    { timeout: TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
  );
  return data;
}

export async function fetchCatVulnerabilityCurves() {
  if (!BASE) return null;
  const { data } = await axios.get(`${BASE}/vulnerability-curves`, { timeout: 15_000 });
  return data;
}

export async function underwriteSingleRisk(payload) {
  if (!BASE) {
    const err = new Error('CAT_MODEL_URL is not set');
    err.status = 503;
    throw err;
  }
  const saved = await readCatSettings();
  const { data } = await axios.post(
    `${BASE}/underwrite-single`,
    {
      ...payload,
      use_ai_rectifier: payload.use_ai_rectifier ?? saved.use_ai_rectifier,
      deductible_pct: payload.deductible_pct ?? saved.deductible_pct,
      reinsurance_qs_pct: payload.reinsurance_qs_pct ?? saved.reinsurance_qs_pct,
      influence_km: payload.influence_km ?? saved.influence_km,
    },
    { timeout: TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
  );
  return data;
}
