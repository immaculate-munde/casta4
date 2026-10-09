import { Router } from 'express';
import {
  loadPortfolio,
  computePortfolioSummary,
  computeLossCurve,
  computeExposureMap,
  tierLossesForRow,
  getMeta,
  TIERS,
} from './nairobi-flood-cat.js';
import { loadExternalEpCurve } from './ep-curve-model.js';
import { buildVulnerabilityPayload } from './vulnerability-matrix.js';
import { catEngineHealthy, catModelConfigured, runCatSimulation } from './cat-engine-client.js';
import { buildCatSimulationOptions } from './cat-sim-context.js';

const router = Router();

function validTier(id) {
  return TIERS.some((t) => t.id === id) ? id : 'moderate';
}

router.get('/meta', async (_req, res) => {
  try {
    res.json(await getMeta());
  } catch (err) {
    console.error('Nairobi meta error:', err);
    res.status(500).json({ error: 'Failed to load meta' });
  }
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
    const computed = await computeLossCurve(exposure);
    const external = await loadExternalEpCurve();
    let cat_model = null;
    if (catModelConfigured() && (await catEngineHealthy())) {
      try {
        cat_model = await runCatSimulation(await buildCatSimulationOptions());
      } catch (err) {
        console.warn('loss-curve CAT simulation skipped:', err.message);
      }
    }
    res.json({
      ...computed,
      external_model: external,
      cat_model,
      model_ep_curve: external?.ep_curve ?? null,
      model_ep_curve_net: external?.ep_curve_net ?? null,
      model_uncertainty_band: external?.uncertainty_band ?? null,
    });
  } catch (err) {
    console.error('Nairobi loss-curve error:', err);
    res.status(500).json({ error: 'Failed to compute loss curve' });
  }
});

router.get('/exposure', async (req, res) => {
  try {
    const tierId = validTier(String(req.query.tier || 'moderate'));
    const { exposure, hotspots } = await loadPortfolio();
    const data = await computeExposureMap(exposure, hotspots, tierId);
    res.json(data);
  } catch (err) {
    console.error('Nairobi exposure error:', err);
    res.status(500).json({ error: 'Failed to load exposure' });
  }
});

router.get('/vulnerability', async (_req, res) => {
  try {
    const { exposure } = await loadPortfolio();
    if (catModelConfigured() && (await catEngineHealthy())) {
      try {
        const { fetchCatVulnerabilityCurves } = await import('./cat-engine-client.js');
        const cat = await fetchCatVulnerabilityCurves();
        const inBook = new Set(exposure.map((r) => r.housing_class));
        const housingMap = {
          Informal: ['informal_iron_sheet', 'semi_permanent'],
          Masonry: ['permanent_masonry'],
          RCC: ['concrete_rcc'],
        };
        const curves = (cat.curves || []).flatMap((c) => {
          const housingClasses = housingMap[c.construction_type] || [];
          return housingClasses.map((housing_class) => ({
            housing_class,
            label: c.label,
            in_current_exposure: inBook.has(housing_class),
            points: (c.points || []).map((p) => ({
              hazard: p.hazard_severity,
              damage_ratio: p.damage_ratio,
            })),
          }));
        });
        return res.json({
          source: 'linus_jrc_engine',
          matrix_file: 'nairobi-flood-cat/engine/vulnerability.py',
          housing_classes_in_exposure: [...inBook],
          curves,
        });
      } catch (err) {
        console.warn('CAT vulnerability curves fallback to CSV:', err.message);
      }
    }
    res.json(await buildVulnerabilityPayload({ exposure }));
  } catch (err) {
    console.error('Nairobi vulnerability error:', err);
    res.status(500).json({ error: 'Failed to load vulnerability matrix' });
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
    const tier_losses = await tierLossesForRow(row);
    res.json({
      ...row,
      tier_losses,
    });
  } catch (err) {
    console.error('Nairobi exposure detail error:', err);
    res.status(500).json({ error: 'Failed to load location' });
  }
});

export default router;
