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
} from './workspace-store.js';
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
    const { filename, text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Body must include text' });
    }
    if (text.length > 500_000) {
      return res.status(400).json({ error: 'Document too large (max 500k chars)' });
    }
    const saved = await saveUserDocument(filename, text);
    invalidateUploadedDocCache();
    res.json({ ok: true, ...saved, documents: await listUserDocuments() });
  } catch (err) {
    console.error('workspace document upload:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

router.get('/ep-model-schema', (_req, res) => {
  res.json({
    required_columns: ['return_period_years', 'loss_kes'],
    optional_columns: ['aep', 'loss_net_kes', 'loss_p05_kes', 'loss_p95_kes', 'tier', 'label'],
  });
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
