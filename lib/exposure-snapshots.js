/**
 * Saved regional exposure books (switch without re-upload).
 */

import fs from 'fs/promises';
import path from 'path';
import { applyRegionToManifest } from './region-config.js';
import { casta4WorkspaceId, getSupabaseAdmin, isSupabaseConfigured } from './supabase-admin.js';
import {
  readManifestBlob,
  writeExposureCsvText,
  writeManifestBlob,
} from './workspace-persistence.js';

function snapshotsDir(workspaceRootFn) {
  return path.join(workspaceRootFn(), 'snapshots');
}

function snapshotIndexPath(workspaceRootFn) {
  return path.join(snapshotsDir(workspaceRootFn), 'index.json');
}

function snapshotFilePath(workspaceRootFn, regionId) {
  const safe = String(regionId || 'custom').replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(snapshotsDir(workspaceRootFn), `${safe}.csv`);
}

async function readFsIndex(workspaceRootFn) {
  try {
    const raw = await fs.readFile(snapshotIndexPath(workspaceRootFn), 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeFsIndex(workspaceRootFn, list) {
  await fs.mkdir(snapshotsDir(workspaceRootFn), { recursive: true });
  await fs.writeFile(snapshotIndexPath(workspaceRootFn), JSON.stringify(list, null, 2), 'utf8');
}

export async function listExposureSnapshots({ workspaceRootFn } = {}) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const ws = casta4WorkspaceId();
    const { data, error } = await sb
      .from('casta4_exposure_snapshots')
      .select('region_id, region_label, row_count, source_filename, updated_at')
      .eq('workspace_id', ws)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({
      region_id: r.region_id,
      region_label: r.region_label,
      row_count: r.row_count,
      source_filename: r.source_filename,
      updated_at: r.updated_at,
    }));
  }

  if (!workspaceRootFn) return [];
  return readFsIndex(workspaceRootFn);
}

export async function upsertExposureSnapshot(
  { csvText, rowCount, meta = {}, workspaceRootFn },
  manifestDraft
) {
  const manifest = applyRegionToManifest(manifestDraft || {}, meta);
  const region_id = manifest.region_id || 'custom';
  const region_label = manifest.region_label || region_id;
  const entry = {
    region_id,
    region_label,
    row_count: rowCount,
    source_filename: meta.filename || null,
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const ws = casta4WorkspaceId();
    const { error } = await sb.from('casta4_exposure_snapshots').upsert(
      {
        workspace_id: ws,
        region_id,
        region_label,
        exposure_csv: csvText,
        row_count: rowCount,
        source_filename: meta.filename || null,
        updated_at: entry.updated_at,
      },
      { onConflict: 'workspace_id,region_id' }
    );
    if (error) throw error;
    return entry;
  }

  if (!workspaceRootFn) return entry;
  await fs.mkdir(snapshotsDir(workspaceRootFn), { recursive: true });
  await fs.writeFile(snapshotFilePath(workspaceRootFn, region_id), csvText, 'utf8');
  const list = await readFsIndex(workspaceRootFn);
  const without = list.filter((s) => s.region_id !== region_id);
  await writeFsIndex(workspaceRootFn, [entry, ...without]);
  return entry;
}

export async function activateExposureSnapshot(regionId, { workspaceRootFn, clearPortfolioCache }) {
  const id = String(regionId || '').trim();
  if (!id) {
    const err = new Error('region_id required');
    err.status = 400;
    throw err;
  }

  let csvText;
  let meta = { region_id: id };

  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const ws = casta4WorkspaceId();
    const { data, error } = await sb
      .from('casta4_exposure_snapshots')
      .select('*')
      .eq('workspace_id', ws)
      .eq('region_id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const err = new Error(`No saved book for region "${id}"`);
      err.status = 404;
      throw err;
    }
    csvText = data.exposure_csv;
    meta = {
      region_id: data.region_id,
      region_label: data.region_label,
      filename: data.source_filename,
    };
  } else {
    if (!workspaceRootFn) {
      const err = new Error('Snapshot storage unavailable');
      err.status = 503;
      throw err;
    }
    try {
      csvText = await fs.readFile(snapshotFilePath(workspaceRootFn, id), 'utf8');
    } catch {
      const err = new Error(`No saved book for region "${id}"`);
      err.status = 404;
      throw err;
    }
    const list = await readFsIndex(workspaceRootFn);
    const row = list.find((s) => s.region_id === id);
    if (row) {
      meta.region_label = row.region_label;
      meta.filename = row.source_filename;
    }
  }

  await writeExposureCsvText(csvText);
  clearPortfolioCache?.();

  const manifest = applyRegionToManifest(await readManifestBlob(), meta);
  manifest.source = 'snapshot';
  manifest.active_region_id = id;
  manifest.exposure_rows = Math.max(0, csvText.split(/\r?\n/).filter(Boolean).length - 1);
  manifest.updated_at = new Date().toISOString();
  await writeManifestBlob(manifest);

  return { manifest, region_id: id };
}
