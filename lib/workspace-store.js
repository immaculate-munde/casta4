/**
 * Active workspace files (exposure CSV, uploaded RAG docs).
 */

import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
import { clearPortfolioCache } from './nairobi-flood-cat.js';
import { applyRegionToManifest } from './region-config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_WORKSPACE = path.join(ROOT, 'data', 'workspace');
const BUNDLED_DATA = path.join(ROOT, 'data', 'team_a_nairobi');

export function workspaceRoot() {
  return process.env.WORKSPACE_ROOT ? path.resolve(process.env.WORKSPACE_ROOT) : DEFAULT_WORKSPACE;
}

export function activeDir() {
  return path.join(workspaceRoot(), 'active');
}

export function exposurePath() {
  return path.join(activeDir(), 'exposure.csv');
}

export function manifestPath() {
  return path.join(workspaceRoot(), 'manifest.json');
}

export function userDocsDir() {
  return path.join(activeDir(), 'docs');
}

export function epModelPath() {
  return path.join(activeDir(), 'ep_curve_model.csv');
}

/** Minimum columns for map pins. Hazard tiers are filled in normalizeExposureCsv if missing. */
const REQUIRED_EXPOSURE_COLS = ['loc_id', 'lat', 'lon', 'housing_class', 'tiv_kes'];

const HAZARD_TIER_COLS = [
  'hazard_score_common',
  'hazard_score_occasional',
  'hazard_score_moderate',
  'hazard_score_severe',
  'hazard_score_extreme',
];

const COLUMN_ALIASES = {
  location_id: 'loc_id',
  id: 'loc_id',
  latitude: 'lat',
  longitude: 'lon',
  lng: 'lon',
  hazard: 'hazard_score_moderate',
  hazard_score: 'hazard_score_moderate',
  hazard_moderate: 'hazard_score_moderate',
};

function canonicalColumn(name) {
  const k = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return COLUMN_ALIASES[k] || k;
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function escapeCsvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normalizeExposureRecord(raw) {
  const row = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key) continue;
    row[canonicalColumn(key)] = typeof value === 'string' ? value.trim() : value;
  }

  let fill =
    numOrNull(row.hazard_score_moderate) ??
    numOrNull(row.hazard_score_common) ??
    numOrNull(row.hazard_score_severe) ??
    0;

  for (const tier of HAZARD_TIER_COLS) {
    const existing = numOrNull(row[tier]);
    row[tier] = existing != null ? existing : fill;
  }

  return row;
}

/** Parse upload, map aliases, fill missing hazard tiers, return canonical CSV text. */
export function normalizeExposureCsv(csvText) {
  let records;
  try {
    records = parse(csvText, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
  } catch (e) {
    const err = new Error(`Could not parse CSV: ${e.message}`);
    err.status = 400;
    throw err;
  }
  if (!records.length) {
    const err = new Error('CSV has no data rows');
    err.status = 400;
    throw err;
  }

  const rows = records.map(normalizeExposureRecord);
  const missingCore = REQUIRED_EXPOSURE_COLS.filter((c) => !(c in rows[0] && rows[0][c] !== ''));
  if (missingCore.length) {
    const err = new Error(`Missing required columns: ${missingCore.join(', ')}`);
    err.status = 400;
    err.missing = missingCore;
    throw err;
  }

  const colOrder = [];
  for (const c of [...REQUIRED_EXPOSURE_COLS, ...HAZARD_TIER_COLS]) {
    if (!colOrder.includes(c)) colOrder.push(c);
  }
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!colOrder.includes(k)) colOrder.push(k);
    }
  }

  const lines = [colOrder.join(',')];
  for (const r of rows) {
    lines.push(colOrder.map((c) => escapeCsvCell(r[c])).join(','));
  }
  return { csv: lines.join('\n'), rowCount: rows.length, columns: colOrder };
}

export function validateExposureHeaders(headerLine) {
  const cols = headerLine.split(',').map((c) => canonicalColumn(c.replace(/^"|"$/g, '')));
  const missing = REQUIRED_EXPOSURE_COLS.filter((c) => !cols.includes(c));
  const hasHazardHint =
    HAZARD_TIER_COLS.some((c) => cols.includes(c)) ||
    cols.includes('hazard') ||
    cols.includes('hazard_score');
  return {
    ok: missing.length === 0,
    missing,
    columns: cols,
    hazard_tier_columns: HAZARD_TIER_COLS,
    hazard_hint: hasHazardHint
      ? 'Tier hazard columns or a single hazard / hazard_score column (copied to all tiers if tiers omitted).'
      : 'No hazard column found — all tiers will default to 0 unless you add hazard_score_moderate or hazard.',
  };
}

export async function ensureWorkspaceDirs() {
  await fs.mkdir(userDocsDir(), { recursive: true });
  await fs.mkdir(activeDir(), { recursive: true });
}

export async function readManifest() {
  try {
    const raw = await fs.readFile(manifestPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      region_label: 'Nairobi',
      region_id: 'nairobi',
      source: 'default',
      uploads: [],
    };
  }
}

async function writeManifest(manifest) {
  await ensureWorkspaceDirs();
  manifest.updated_at = new Date().toISOString();
  await fs.writeFile(manifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
}

export async function saveExposureCsv(csvText, meta = {}) {
  const firstLine = csvText.split(/\r?\n/)[0] || '';
  const headerCheck = validateExposureHeaders(firstLine);
  const { csv: normalizedCsv, rowCount, columns } = normalizeExposureCsv(csvText);
  const validation = { ...headerCheck, columns_after_normalize: columns, row_count: rowCount };

  await ensureWorkspaceDirs();
  await fs.writeFile(exposurePath(), normalizedCsv, 'utf8');
  clearPortfolioCache();

  let manifest = await readManifest();
  manifest.source = 'upload';
  manifest.region_label = meta.region_label || manifest.region_label || 'Custom region';
  manifest.region_id = meta.region_id || manifest.region_id || 'custom';
  manifest = applyRegionToManifest(manifest, meta);
  manifest.exposure_rows = rowCount;
  manifest.uploads = [
    {
      type: 'exposure',
      filename: meta.filename || 'exposure.csv',
      uploaded_at: new Date().toISOString(),
    },
    ...(manifest.uploads || []).slice(0, 19),
  ];
  await writeManifest(manifest);
  return { manifest, validation };
}

export async function resetToDefaultPack() {
  await ensureWorkspaceDirs();
  const src = path.join(BUNDLED_DATA, 'exposure_nairobi_with_hazard.csv');
  const csv = await fs.readFile(src, 'utf8');
  await fs.writeFile(exposurePath(), csv, 'utf8');
  clearPortfolioCache();

  const manifest = applyRegionToManifest({
    region_label: 'Nairobi',
    region_id: 'nairobi',
    source: 'default',
    uploads: [{ type: 'reset', uploaded_at: new Date().toISOString() }],
    updated_at: new Date().toISOString(),
  });
  await fs.writeFile(manifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

export async function saveEpModelCsv(csvText, meta = {}) {
  const firstLine = csvText.split(/\r?\n/)[0] || '';
  const { validateEpModelHeaders } = await import('./ep-curve-model.js');
  const validation = validateEpModelHeaders(firstLine);
  if (!validation.ok) {
    const err = new Error(`Missing columns: ${validation.missing.join(', ')}`);
    err.status = 400;
    err.missing = validation.missing;
    throw err;
  }
  await ensureWorkspaceDirs();
  await fs.writeFile(epModelPath(), csvText, 'utf8');
  const manifest = await readManifest();
  manifest.model_team_label = meta.model_label || manifest.model_team_label || 'External model';
  manifest.uploads = [
    { type: 'ep_curve_model', filename: meta.filename || 'ep_curve_model.csv', uploaded_at: new Date().toISOString() },
    ...(manifest.uploads || []).slice(0, 19),
  ];
  await writeManifest(manifest);
  return { manifest, validation };
}

export async function saveUserDocument(filename, text) {
  await ensureWorkspaceDirs();
  const safe = String(filename || 'upload.txt').replace(/[^a-zA-Z0-9._-]/g, '_');
  const full = path.join(userDocsDir(), safe);
  await fs.writeFile(full, text, 'utf8');

  const manifest = await readManifest();
  manifest.uploads = [
    { type: 'document', filename: safe, uploaded_at: new Date().toISOString(), chars: text.length },
    ...(manifest.uploads || []).slice(0, 19),
  ];
  await writeManifest(manifest);
  return { filename: safe, chars: text.length };
}

export async function listUserDocuments() {
  try {
    await ensureWorkspaceDirs();
    const files = await fs.readdir(userDocsDir());
    const docs = [];
    for (const name of files) {
      if (!name.endsWith('.txt')) continue;
      const stat = await fs.stat(path.join(userDocsDir(), name));
      docs.push({ filename: name, bytes: stat.size, updated_at: stat.mtime.toISOString() });
    }
    return docs;
  } catch {
    return [];
  }
}

/** In-memory + disk text for RAG injection (shared workspace). */
let uploadedDocCache = null;

export async function loadUploadedDocTexts() {
  if (uploadedDocCache) return uploadedDocCache;
  const texts = [];
  try {
    const files = await listUserDocuments();
    for (const f of files) {
      const body = await fs.readFile(path.join(userDocsDir(), f.filename), 'utf8');
      texts.push({ filename: f.filename, text: body });
    }
  } catch {
    /* empty */
  }
  uploadedDocCache = texts;
  return texts;
}

export function invalidateUploadedDocCache() {
  uploadedDocCache = null;
}

const DEFAULT_CAT_SETTINGS = {
  use_ai_rectifier: true,
  deductible_pct: 0.05,
  reinsurance_qs_pct: 0.25,
  influence_km: 1.2,
};

export async function readCatSettings() {
  const manifest = await readManifest();
  return { ...DEFAULT_CAT_SETTINGS, ...(manifest.cat_settings || {}) };
}

export async function saveCatSettings(partial) {
  const manifest = await readManifest();
  const next = { ...DEFAULT_CAT_SETTINGS, ...(manifest.cat_settings || {}) };
  for (const key of ['use_ai_rectifier', 'deductible_pct', 'reinsurance_qs_pct', 'influence_km']) {
    if (partial[key] !== undefined) next[key] = partial[key];
  }
  manifest.cat_settings = next;
  await writeManifest(manifest);
  return manifest.cat_settings;
}

export async function getWorkspaceStatus() {
  await ensureWorkspaceDirs();
  let hasExposure = false;
  let rowCount = 0;
  try {
    await fs.access(exposurePath());
    hasExposure = true;
    const csv = await fs.readFile(exposurePath(), 'utf8');
    rowCount = Math.max(0, csv.split(/\r?\n/).filter(Boolean).length - 1);
  } catch {
    hasExposure = false;
  }
  let hasEpModel = false;
  try {
    await fs.access(epModelPath());
    hasEpModel = true;
  } catch {
    hasEpModel = false;
  }
  const manifest = await readManifest();
  const docs = await listUserDocuments();
  return {
    workspace_root: workspaceRoot(),
    has_active_exposure: hasExposure,
    exposure_row_count: rowCount,
    has_ep_model: hasEpModel,
    model_team_label: manifest.model_team_label || null,
    document_count: docs.length,
    manifest,
    documents: docs,
    cat_settings: await readCatSettings(),
    cat_model_url_configured: Boolean(process.env.CAT_MODEL_URL),
  };
}

export { REQUIRED_EXPOSURE_COLS, HAZARD_TIER_COLS };
