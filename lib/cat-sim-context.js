import { resolveRegionConfig } from './region-config.js';
import { readCatSettings, readManifest } from './workspace-store.js';

/** CAT simulate options from active workspace manifest + saved model settings. */
export async function buildCatSimulationOptions(overrides = {}) {
  const [saved, manifest] = await Promise.all([readCatSettings(), readManifest()]);
  const region = resolveRegionConfig(manifest);
  return {
    use_ai_rectifier: saved.use_ai_rectifier,
    deductible_pct: saved.deductible_pct,
    reinsurance_qs_pct: saved.reinsurance_qs_pct,
    influence_km: saved.influence_km,
    region_id: region.region_id,
    region_label: manifest?.region_label || region.region_id || 'Portfolio',
    use_hotspot_zones: region.cat_data_scope?.ai_drainage_hotspots === 'nairobi_hotspots_csv',
    operations_return_period: 100,
    risk_load_pct: 35,
    ...overrides,
  };
}
