import { Router } from 'express';
import {
  catEngineHealthy,
  catModelConfigured,
  fetchCatVulnerabilityCurves,
  runCatSimulation,
  underwriteSingleRisk,
} from './cat-engine-client.js';
import axios from 'axios';

const router = Router();

router.get('/health', async (_req, res) => {
  res.json({
    configured: catModelConfigured(),
    reachable: catModelConfigured() ? await catEngineHealthy(true) : false,
  });
});

router.post('/simulate', async (req, res) => {
  try {
    if (!catModelConfigured()) {
      return res.status(503).json({ error: 'CAT_MODEL_URL not configured' });
    }
    const sim = await runCatSimulation(req.body || {});
    res.json(sim);
  } catch (err) {
    console.error('CAT simulate:', err.message);
    res.status(err.response?.status || err.status || 502).json({
      error: err.response?.data?.detail || err.message || 'CAT simulation failed',
    });
  }
});

router.post('/underwrite-single', async (req, res) => {
  try {
    if (!catModelConfigured()) {
      return res.status(503).json({ error: 'CAT_MODEL_URL not configured' });
    }
    const data = await underwriteSingleRisk(req.body || {});
    res.json(data);
  } catch (err) {
    console.error('CAT underwrite-single:', err.message);
    res.status(err.response?.status || err.status || 502).json({
      error: err.response?.data?.detail || err.message || 'Underwriting failed',
    });
  }
});

router.get('/disclosures', async (_req, res) => {
  try {
    if (!catModelConfigured()) {
      return res.status(503).json({ error: 'CAT_MODEL_URL not configured' });
    }
    const base = process.env.CAT_MODEL_URL.replace(/\/$/, '');
    const { data } = await axios.get(`${base}/disclosures`, { timeout: 15_000 });
    res.json(data);
  } catch (err) {
    console.error('CAT disclosures:', err.message);
    res.status(502).json({ error: err.message || 'Failed to load disclosures' });
  }
});

router.get('/vulnerability', async (_req, res) => {
  try {
    if (!catModelConfigured()) {
      return res.status(503).json({ error: 'CAT_MODEL_URL not configured' });
    }
    const data = await fetchCatVulnerabilityCurves();
    res.json(data);
  } catch (err) {
    console.error('CAT vulnerability:', err.message);
    res.status(err.response?.status || 502).json({ error: err.message || 'Failed to load vulnerability curves' });
  }
});

export default router;
