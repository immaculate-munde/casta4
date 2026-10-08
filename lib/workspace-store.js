/**
 * Active workspace files (exposure CSV, uploaded RAG docs).
 */

import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
import { catEngineHealthy, catModelConfigured, runCatSimulation } from './cat-engine-client.js';
import { clearPortfolioCache, computeLossCurve, loadPortfolio } from './nairobi-flood-cat.js';

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

async function generateAutoEpCurveFromExposure(csvText) {
  try {
    if (catModelConfigured() && (await catEngineHealthy())) {
      const sim = await runCatSimulation({ csv: csvText });
      const points = Array.isArray(sim?.ep_curve_gross) ? sim.ep_curve_gross : Array.isArray(sim?.ep_curve) ? sim.ep_curve : [];
      if (points.length) {
        const rows = points.map((p) => [p.return_period_years, p.aep ?? '', Number.isFinite(p.loss_kes) ? p.loss_kes : 0]);
        const generated = ['return_period_years,aep,loss_kes', ...rows.map((r) => r.map((cell) => escapeCsvCell(cell)).join(','))].join('\n');
        await fs.writeFile(epModelPath(), generated, 'utf8');
        return { source: 'cat_model', points: rows.length };
      }
    }

    const { exposure } = await loadPortfolio();
    const computed = await computeLossCurve(exposure);
    const points = computed?.ep_curve || [];
    if (!points.length) return { source: 'none', points: 0 };

    const rows = points.map((p) => [p.return_period_years, p.aep ?? '', Number.isFinite(p.loss_kes) ? p.loss_kes : 0]);
    const generated = ['return_period_years,aep,loss_kes', ...rows.map((r) => r.map((cell) => escapeCsvCell(cell)).join(','))].join('\n');
    await fs.writeFile(epModelPath(), generated, 'utf8');
    return { source: 'local_proxy', points: rows.length };
  } catch (err) {
    console.warn('Exposure CSV auto-EP generation failed:', err.message);
    return { source: 'failed', points: 0, error: err.message };
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function slugify(value, fallback = 'property') {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || fallback;
}

function parseCurrency(value) {
  const n = Number(String(value || '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseFloatOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deriveLocationCoords(text) {
  const patterns = [
    /lat[^0-9-]*(-?\d+(?:\.\d+)?)\D*lon[^0-9-]*(-?\d+(?:\.\d+)?)/i,
    /(-?\d+(?:\.\d+)?)\s*°?\s*[NS]\s*,\s*(-?\d+(?:\.\d+)?)\s*°?\s*[EW]/i,
    /GPS COORDINATES:\s*(-?\d+(?:\.\d+)?)°?\s*[NS],\s*(-?\d+(?:\.\d+)?)°?\s*[EW]/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (!m) continue;
    let lat = parseFloatOrNull(m[1]);
    let lon = parseFloatOrNull(m[2]);
    if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { lat, lon };
    }
  }

  const latOnly = text.match(/lat[^0-9-]*(-?\d+(?:\.\d+)?)/i);
  const lonOnly = text.match(/lon[^0-9-]*(-?\d+(?:\.\d+)?)/i);
  if (latOnly && lonOnly) {
    const lat = parseFloatOrNull(latOnly[1]);
    const lon = parseFloatOrNull(lonOnly[1]);
    if (lat != null && lon != null) return { lat, lon };
  }

  const nairobiLat = -1.2861;
  const nairobiLon = 36.8172;
  return { lat: nairobiLat, lon: nairobiLon };
}

function buildExposureRowFromDocumentText(text, filename) {
  const lower = String(text || '').toLowerCase();
  const coords = deriveLocationCoords(text);
  const nameMatch =
    /(client|property|building|project|development)[:\-\s]+([A-Za-z0-9 &./()'-]+)/i.exec(text) ||
    /([A-Za-z][A-Za-z0-9 &./()'-]{4,80})/i.exec(text);
  const locId = slugify(nameMatch ? nameMatch[2] || nameMatch[1] : filename, 'property');

  let tiv = 500_000_000;
  const tivMatches = [
    /tiv[^0-9]*kes\s*([0-9,]+(?:\.\d+)?)/i,
    /sum insured[^0-9]*kes\s*([0-9,]+(?:\.\d+)?)/i,
    /insured value[^0-9]*kes\s*([0-9,]+(?:\.\d+)?)/i,
    /value[^0-9]*kes\s*([0-9,]+(?:\.\d+)?)/i,
    /KES\s*([0-9,]+(?:\.\d+)?)/i,
  ];
  for (const pattern of tivMatches) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = parseCurrency(match[1]);
    if (parsed != null) {
      tiv = Math.max(1_000_000, parsed);
      break;
    }
  }

  const floodSignals = [
    'flood',
    'river',
    'stormwater',
    'drainage',
    'rainwater',
    'waterlogging',
    'basement',
    'low-lying',
    'sump',
    'storm drain',
  ];
  const floodHit = floodSignals.some((k) => lower.includes(k));
  const maintenanceIssue = /roof|membrane|repair|replace|non-functional|defect|warning|aging|old/.test(lower);
  const elevated = /elevated|raised|high ground|above sea level|no flood history|good drainage/.test(lower);
  const resilience = /sprinkler|backup|generator|ups|fire pump|cctv|security|monitorin|resilience/.test(lower);

  let common = 0.22;
  let occasional = 0.32;
  let moderate = 0.46;
  let severe = 0.34;
  let extreme = 0.2;

  if (floodHit) {
    common += 0.12;
    occasional += 0.16;
    moderate += 0.18;
    severe += 0.2;
    extreme += 0.1;
  }
  if (maintenanceIssue) {
    common += 0.08;
    moderate += 0.08;
    severe += 0.08;
  }
  if (elevated) {
    common -= 0.06;
    moderate -= 0.08;
    severe -= 0.05;
  }
  if (resilience) {
    common -= 0.05;
    moderate -= 0.05;
  }

  common = clamp01(common);
  occasional = clamp01(occasional);
  moderate = clamp01(moderate);
  severe = clamp01(severe);
  extreme = clamp01(extreme);

  const row = {
    loc_id: locId,
    lat: coords.lat,
    lon: coords.lon,
    housing_class: /commercial|office|retail|mixed use|property/.test(lower) ? 'concrete_rcc' : 'permanent_masonry',
    tiv_kes: Math.round(tiv),
    hazard_score_common: Number(common.toFixed(3)),
    hazard_score_occasional: Number(occasional.toFixed(3)),
    hazard_score_moderate: Number(moderate.toFixed(3)),
    hazard_score_severe: Number(severe.toFixed(3)),
    hazard_score_extreme: Number(extreme.toFixed(3)),
  };

  const csv = [
    ['loc_id', 'lat', 'lon', 'housing_class', 'tiv_kes', 'hazard_score_common', 'hazard_score_occasional', 'hazard_score_moderate', 'hazard_score_severe', 'hazard_score_extreme'].join(','),
    Object.values(row).map((v) => escapeCsvCell(v)).join(','),
  ].join('\n');

  return { row, csv };
}

export async function saveExposureFromDocumentText(text, meta = {}) {
  const docText = String(text || '').trim();
  if (!docText) {
    const err = new Error('Document did not contain readable text');
    err.status = 400;
    throw err;
  }

  const { row, csv } = buildExposureRowFromDocumentText(docText, meta.filename || 'document');
  const result = await saveExposureCsv(csv, {
    filename: meta.filename || `${row.loc_id}.csv`,
    region_label: meta.region_label || 'Extracted from document',
    region_id: meta.region_id || row.loc_id,
  });

  return {
    ...result,
    exposure_row: row,
    source_document: meta.filename || 'document',
  };
}

export async function saveExposureCsv(csvText, meta = {}) {
  const firstLine = csvText.split(/\r?\n/)[0] || '';
  const headerCheck = validateExposureHeaders(firstLine);
  const { csv: normalizedCsv, rowCount, columns } = normalizeExposureCsv(csvText);
  const validation = { ...headerCheck, columns_after_normalize: columns, row_count: rowCount };

  await ensureWorkspaceDirs();
  await fs.writeFile(exposurePath(), normalizedCsv, 'utf8');
  clearPortfolioCache();

  const autoEp = await generateAutoEpCurveFromExposure(normalizedCsv);
  const generatedFile = 'ep_curve_model.csv';

  const manifest = await readManifest();
  manifest.source = 'upload';
  manifest.region_label = meta.region_label || manifest.region_label || 'Custom region';
  manifest.region_id = meta.region_id || manifest.region_id || 'custom';
  manifest.exposure_rows = rowCount;
  manifest.auto_ep_curve = autoEp;
  manifest.generated_ep_csv_filename = generatedFile;
  manifest.uploads = [
    {
      type: 'exposure',
      filename: meta.filename || 'exposure.csv',
      uploaded_at: new Date().toISOString(),
    },
    ...(manifest.uploads || []).slice(0, 19),
  ];
  await writeManifest(manifest);
  return {
    manifest,
    validation,
    auto_ep_curve: autoEp,
    generated_ep_csv_filename: generatedFile,
    generated_ep_csv_url: '/api/workspace/download-generated-ep',
  };
}

export async function resetToDefaultPack() {
  await ensureWorkspaceDirs();
  const src = path.join(BUNDLED_DATA, 'exposure_nairobi_with_hazard.csv');
  const csv = await fs.readFile(src, 'utf8');
  await fs.writeFile(exposurePath(), csv, 'utf8');
  clearPortfolioCache();

  const manifest = {
    region_label: 'Nairobi',
    region_id: 'nairobi',
    source: 'default',
    uploads: [{ type: 'reset', uploaded_at: new Date().toISOString() }],
    updated_at: new Date().toISOString(),
  };
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
  const generatedEpCsvUrl = hasEpModel ? '/api/workspace/download-generated-ep' : null;
  return {
    workspace_root: workspaceRoot(),
    has_active_exposure: hasExposure,
    exposure_row_count: rowCount,
    has_ep_model: hasEpModel,
    generated_ep_csv_url: generatedEpCsvUrl,
    generated_ep_csv_filename: manifest.generated_ep_csv_filename || (hasEpModel ? 'ep_curve_model.csv' : null),
    model_team_label: manifest.model_team_label || null,
    document_count: docs.length,
    manifest,
    documents: docs,
    cat_settings: await readCatSettings(),
    cat_model_url_configured: Boolean(process.env.CAT_MODEL_URL),
  };
}

export { REQUIRED_EXPOSURE_COLS, HAZARD_TIER_COLS };
