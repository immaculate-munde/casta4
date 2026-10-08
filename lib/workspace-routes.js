import { Router } from 'express';
import {
  getWorkspaceStatus,
  saveExposureCsv,
  saveUserDocument,
  resetToDefaultPack,
  listUserDocuments,
  REQUIRED_EXPOSURE_COLS,
  HAZARD_TIER_COLS,
  invalidateUploadedDocCache,
  saveEpModelCsv,
  readManifest,
  readCatSettings,
  saveCatSettings,
} from './workspace-store.js';
import { loadPortfolio, computePortfolioSummary } from './nairobi-flood-cat.js';
import {
  MODEL_OUTPUT_OPTIONAL,
  MODEL_OUTPUT_REQUIRED,
  buildPortfolioModelInput,
} from './model-io.js';
import { extractDocumentText } from './document-ingest.js';
const router = Router();

router.get('/status', async (_req, res) => {
  try {
    res.json(await getWorkspaceStatus());
  } catch (err) {
    console.error('workspace status:', err);
    res.status(500).json({ error: 'Failed to read workspace status' });
  }
});

router.get('/exposure-schema', (_req, res) => {
  res.json({
    required_columns: REQUIRED_EXPOSURE_COLS,
    hazard_tier_columns: HAZARD_TIER_COLS,
    note: 'If tier hazard_* columns are omitted, include hazard or hazard_score_moderate (0–1) and values copy to all tiers.',
  });
});

router.post('/exposure', async (req, res) => {
  try {
    const csv = req.body?.csv;
    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ error: 'Body must include csv string' });
    }
    const result = await saveExposureCsv(csv, {
      filename: req.body.filename,
      region_label: req.body.region_label,
      region_id: req.body.region_id,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('workspace exposure upload:', err);
    res.status(err.status || 500).json({ error: err.message, missing: err.missing });
  }
});

router.post('/document', async (req, res) => {
  try {
    const { filename, text, file_base64, content_type } = req.body || {};
    const { text: extracted, storageName } = await extractDocumentText({
      text,
      file_base64,
      filename,
      content_type,
    });
    if (extracted.length > 500_000) {
      return res.status(400).json({ error: 'Document too large after extraction (max 500k chars)' });
    }
    const saved = await saveUserDocument(storageName, extracted);
    invalidateUploadedDocCache();
    res.json({ ok: true, ...saved, original_filename: filename || storageName, documents: await listUserDocuments() });
  } catch (err) {
    console.error('workspace document upload:', err);
    res.status(err.status || 500).json({ error: err.message || 'Upload failed' });
  }
});

router.get('/cat-settings', async (_req, res) => {
  try {
    res.json(await readCatSettings());
  } catch (err) {
    console.error('workspace cat-settings get:', err);
    res.status(500).json({ error: 'Failed to read CAT settings' });
  }
});

router.post('/cat-settings', async (req, res) => {
  try {
    const body = req.body || {};
    const saved = await saveCatSettings({
      use_ai_rectifier: body.use_ai_rectifier,
      deductible_pct: body.deductible_pct,
      reinsurance_qs_pct: body.reinsurance_qs_pct,
      influence_km: body.influence_km,
    });
    res.json({ ok: true, cat_settings: saved });
  } catch (err) {
    console.error('workspace cat-settings post:', err);
    res.status(500).json({ error: err.message || 'Failed to save CAT settings' });
  }
});

router.get('/ep-model-schema', (_req, res) => {
  res.json({
    required_columns: MODEL_OUTPUT_REQUIRED,
    optional_columns: MODEL_OUTPUT_OPTIONAL,
    ep_view_switch: ['gross', 'net', 'uncertainty'],
    note: 'One CSV row per return period. Net and p5/p95 columns enable the Net and Uncertainty switches in the UI.',
  });
});

/** Structured portfolio input for your dynamic model (JSON). */
router.get('/model-input', async (_req, res) => {
  try {
    const { exposure } = await loadPortfolio();
    const summary = computePortfolioSummary(exposure);
    const manifest = await readManifest();
    res.json(buildPortfolioModelInput({ exposure, summary, manifest }));
  } catch (err) {
    console.error('workspace model-input:', err);
    res.status(500).json({ error: 'Failed to build model input' });
  }
});

router.post('/ep-model', async (req, res) => {
  try {
    const csv = req.body?.csv;
    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ error: 'Body must include csv string' });
    }
    const result = await saveEpModelCsv(csv, {
      filename: req.body.filename,
      model_label: req.body.model_label,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('workspace ep-model upload:', err);
    res.status(err.status || 500).json({ error: err.message, missing: err.missing });
  }
});

router.post('/reset-default', async (_req, res) => {
  try {
    const manifest = await resetToDefaultPack();
    invalidateUploadedDocCache();
    res.json({ ok: true, manifest });
  } catch (err) {
    console.error('workspace reset:', err);
    res.status(500).json({ error: 'Reset failed' });
  }
});

export default router;
