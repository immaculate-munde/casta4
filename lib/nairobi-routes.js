import { Router } from 'express';
import {
  loadPortfolio,
  loadPortfolioFromCsv,
  enrichRow,
  tierLossesForRow,
  computePortfolioSummary,
  computeLossCurve,
  getMeta,
  TIERS,
} from './nairobi-flood-cat.js';

const router = Router();

function validTier(id) {
  return TIERS.some((t) => t.id === id) ? id : 'moderate';
}

router.get('/meta', (_req, res) => {
  res.json(getMeta());
});

router.get('/summary', async (_req, res) => {
  try {
    const { exposure } = await loadPortfolio();
    res.json(computePortfolioSummary(exposure));
  } catch (err) {
    console.error('Nairobi summary error:', err);
    res.status(500).json({ error: 'Failed to load portfolio summary' });
  }
});

router.get('/hotspots', async (_req, res) => {
  try {
    const { hotspots } = await loadPortfolio();
    res.json({ count: hotspots.length, hotspots });
  } catch (err) {
    console.error('Nairobi hotspots error:', err);
    res.status(500).json({ error: 'Failed to load hotspots' });
  }
});

router.get('/loss-curve', async (_req, res) => {
  try {
    const { exposure } = await loadPortfolio();
    res.json(computeLossCurve(exposure));
  } catch (err) {
    console.error('Nairobi loss-curve error:', err);
    res.status(500).json({ error: 'Failed to compute loss curve' });
  }
});

router.post('/upload', async (req, res) => {
  try {
    const payload = req.body || {};
    const exposureCsv = String(payload.exposure_csv || payload.csv || payload.exposure || '').trim();
    if (!exposureCsv) {
      return res.status(400).json({ error: 'Missing exposure CSV payload' });
    }

    const hotspotsCsv = String(payload.hotspots_csv || payload.hotspots || '').trim();
    const portfolio = await loadPortfolioFromCsv(exposureCsv, hotspotsCsv, { source: 'uploaded' });
    const summary = computePortfolioSummary(portfolio.exposure);
    const curve = computeLossCurve(portfolio.exposure);

    res.json({
      source: 'uploaded',
      summary,
      curve,
      count: portfolio.exposure.length,
      exposure: portfolio.exposure.map((row) => ({
        ...row,
        hazard: row.hazards?.moderate ?? 0,
        max_hazard: row.max_hazard,
      })),
      hotspots: portfolio.hotspots,
    });
  } catch (err) {
    console.error('Nairobi upload error:', err);
    res.status(500).json({ error: 'Failed to compute uploaded EP curve' });
  }
});

router.get('/exposure', async (req, res) => {
  try {
    const tierId = validTier(String(req.query.tier || 'moderate'));
    const { exposure } = await loadPortfolio();
    const rows = exposure.map((row) => {
      const e = enrichRow(row, tierId);
      return {
        loc_id: e.loc_id,
        lat: e.lat,
        lon: e.lon,
        housing_class: e.housing_class,
        housing_label: e.housing_label,
        tiv_kes: e.tiv_kes,
        hazard: e.hazard,
        max_hazard: e.max_hazard,
        hazard_band: e.hazard_band,
        damage_ratio: e.damage_ratio,
        loss_kes: e.loss_kes,
      };
    });
    res.json({
      tier: tierId,
      count: rows.length,
      locations: rows,
    });
  } catch (err) {
    console.error('Nairobi exposure error:', err);
    res.status(500).json({ error: 'Failed to load exposure' });
  }
});

router.get('/exposure/:locId', async (req, res) => {
  try {
    const locId = String(req.params.locId || '').trim().toUpperCase();
    const { exposure } = await loadPortfolio();
    const row = exposure.find((r) => r.loc_id.toUpperCase() === locId);
    if (!row) {
      return res.status(404).json({ error: 'Location not found', loc_id: req.params.locId });
    }
    res.json({
      ...row,
      tier_losses: tierLossesForRow(row),
    });
  } catch (err) {
    console.error('Nairobi exposure detail error:', err);
    res.status(500).json({ error: 'Failed to load location' });
  }
});

export default router;
