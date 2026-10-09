/**
 * Workspace blob storage: Supabase Postgres when configured, else local filesystem.
 */

import fs from 'fs/promises';
import path from 'path';
import { casta4WorkspaceId, getSupabaseAdmin, isSupabaseConfigured } from './supabase-admin.js';

const DEFAULT_MANIFEST = {
  region_label: 'Nairobi',
  region_id: 'nairobi',
  source: 'default',
  uploads: [],
};

export function persistenceBackend() {
  return isSupabaseConfigured() ? 'supabase' : 'filesystem';
}

export function persistenceLabel() {
  if (isSupabaseConfigured()) {
    return `supabase:${casta4WorkspaceId()}`;
  }
  return null;
}

// ── Filesystem paths (injected from workspace-store to avoid circular imports) ──

let fsPaths = null;

export function bindFilesystemPaths({
  workspaceRoot,
  exposurePath,
  manifestPath,
  epModelPath,
  userDocsDir,
  bundledExposurePath,
}) {
  fsPaths = { workspaceRoot, exposurePath, manifestPath, epModelPath, userDocsDir, bundledExposurePath };
}

function paths() {
  if (!fsPaths) throw new Error('Filesystem workspace paths not bound');
  return fsPaths;
}

async function ensureFsDirs() {
  const { userDocsDir, exposurePath } = paths();
  await fs.mkdir(path.dirname(exposurePath()), { recursive: true });
  await fs.mkdir(userDocsDir(), { recursive: true });
}

async function loadBundledDefaultExposure() {
  const { bundledExposurePath } = paths();
  return fs.readFile(bundledExposurePath(), 'utf8');
}

let ensureWorkspaceInflight = null;

async function fetchSupabaseWorkspaceRow(sb, id) {
  const { data, error } = await sb.from('casta4_workspaces').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureSupabaseWorkspaceRowOnce() {
  const sb = getSupabaseAdmin();
  const id = casta4WorkspaceId();
  const existing = await fetchSupabaseWorkspaceRow(sb, id);
  if (existing) return existing;

  const exposure_csv = await loadBundledDefaultExposure();
  const manifest = { ...DEFAULT_MANIFEST, updated_at: new Date().toISOString() };
  const { data: inserted, error: insErr } = await sb
    .from('casta4_workspaces')
    .insert({ id, manifest, exposure_csv })
    .select('*')
    .single();

  if (insErr) {
    // Row created by a parallel boot or earlier run — load it instead of failing startup.
    if (insErr.code === '23505') {
      const row = await fetchSupabaseWorkspaceRow(sb, id);
      if (row) return row;
    }
    throw insErr;
  }
  return inserted;
}

function ensureSupabaseWorkspaceRow() {
  if (!ensureWorkspaceInflight) {
    ensureWorkspaceInflight = ensureSupabaseWorkspaceRowOnce().finally(() => {
      ensureWorkspaceInflight = null;
    });
  }
  return ensureWorkspaceInflight;
}

async function getSupabaseRow() {
  return ensureSupabaseWorkspaceRow();
}

async function patchSupabaseRow(patch) {
  const sb = getSupabaseAdmin();
  const id = casta4WorkspaceId();
  await ensureSupabaseWorkspaceRow();
  const { error } = await sb
    .from('casta4_workspaces')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function readManifestBlob() {
  if (isSupabaseConfigured()) {
    const row = await getSupabaseRow();
    return row.manifest && typeof row.manifest === 'object' ? row.manifest : { ...DEFAULT_MANIFEST };
  }
  try {
    const raw = await fs.readFile(paths().manifestPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { ...DEFAULT_MANIFEST };
  }
}

export async function writeManifestBlob(manifest) {
  manifest.updated_at = new Date().toISOString();
  if (isSupabaseConfigured()) {
    await patchSupabaseRow({ manifest });
    return;
  }
  await ensureFsDirs();
  await fs.writeFile(paths().manifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
}

export async function readExposureCsvText() {
  if (isSupabaseConfigured()) {
    const row = await getSupabaseRow();
    return row.exposure_csv || null;
  }
  try {
    return await fs.readFile(paths().exposurePath(), 'utf8');
  } catch {
    return null;
  }
}

export async function writeExposureCsvText(csvText) {
  if (isSupabaseConfigured()) {
    await patchSupabaseRow({ exposure_csv: csvText });
    return;
  }
  await ensureFsDirs();
  await fs.writeFile(paths().exposurePath(), csvText, 'utf8');
}

export async function hasExposureCsv() {
  const text = await readExposureCsvText();
  return Boolean(text && text.trim());
}

export async function readEpModelCsvText() {
  if (isSupabaseConfigured()) {
    const row = await getSupabaseRow();
    return row.ep_curve_model_csv || null;
  }
  try {
    return await fs.readFile(paths().epModelPath(), 'utf8');
  } catch {
    return null;
  }
}

export async function writeEpModelCsvText(csvText) {
  if (isSupabaseConfigured()) {
    await patchSupabaseRow({ ep_curve_model_csv: csvText });
    return;
  }
  await ensureFsDirs();
  await fs.writeFile(paths().epModelPath(), csvText, 'utf8');
}

export async function hasEpModelCsv() {
  const text = await readEpModelCsvText();
  return Boolean(text && text.trim());
}

export async function resetWorkspaceFiles(defaultExposureCsv, manifest) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const id = casta4WorkspaceId();
    await sb.from('casta4_workspace_documents').delete().eq('workspace_id', id);
    await patchSupabaseRow({
      exposure_csv: defaultExposureCsv,
      ep_curve_model_csv: null,
      manifest,
    });
    return;
  }
  await ensureFsDirs();
  await fs.writeFile(paths().exposurePath(), defaultExposureCsv, 'utf8');
  try {
    await fs.unlink(paths().epModelPath());
  } catch {
    /* no ep file */
  }
  const docDir = paths().userDocsDir();
  try {
    const names = await fs.readdir(docDir);
    await Promise.all(names.map((n) => fs.unlink(path.join(docDir, n)).catch(() => {})));
  } catch {
    /* empty */
  }
  await fs.writeFile(paths().manifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
}

export async function listDocumentMeta() {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const id = casta4WorkspaceId();
    await ensureSupabaseWorkspaceRow();
    const { data, error } = await sb
      .from('casta4_workspace_documents')
      .select('filename, content, updated_at')
      .eq('workspace_id', id)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((d) => ({
      filename: d.filename,
      bytes: Buffer.byteLength(d.content || '', 'utf8'),
      updated_at: d.updated_at,
    }));
  }
  try {
    await ensureFsDirs();
    const files = await fs.readdir(paths().userDocsDir());
    const docs = [];
    for (const name of files) {
      if (!name.endsWith('.txt')) continue;
      const stat = await fs.stat(path.join(paths().userDocsDir(), name));
      docs.push({ filename: name, bytes: stat.size, updated_at: stat.mtime.toISOString() });
    }
    return docs;
  } catch {
    return [];
  }
}

export async function readDocumentText(filename) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('casta4_workspace_documents')
      .select('content')
      .eq('workspace_id', casta4WorkspaceId())
      .eq('filename', filename)
      .maybeSingle();
    if (error) throw error;
    return data?.content ?? null;
  }
  try {
    return await fs.readFile(path.join(paths().userDocsDir(), filename), 'utf8');
  } catch {
    return null;
  }
}

export async function writeDocumentText(filename, text) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin();
    await ensureSupabaseWorkspaceRow();
    const { error } = await sb.from('casta4_workspace_documents').upsert(
      {
        workspace_id: casta4WorkspaceId(),
        filename,
        content: text,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,filename' }
    );
    if (error) throw error;
    return;
  }
  await ensureFsDirs();
  await fs.writeFile(path.join(paths().userDocsDir(), filename), text, 'utf8');
}

export async function ensurePersistenceReady() {
  if (isSupabaseConfigured()) {
    await ensureSupabaseWorkspaceRow();
    return;
  }
  await ensureFsDirs();
}
