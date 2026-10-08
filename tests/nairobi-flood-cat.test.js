import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseExposureCsv,
  buildDamageMatrix,
  computeLossCurve,
  loadPortfolio,
} from '../lib/nairobi-flood-cat.js';

test('damage matrix maps severity scores to higher losses as hazard rises', () => {
  const matrix = buildDamageMatrix();
  assert.ok(matrix.semi_permanent[0.25] > 0);
  assert.ok(matrix.semi_permanent[0.5] > matrix.semi_permanent[0.25]);
  assert.ok(matrix.informal_iron_sheet[0.5] > matrix.semi_permanent[0.5]);
});

test('default Nairobi exposure still creates a valid EP curve', async () => {
  const portfolio = await loadPortfolio();
  const curve = computeLossCurve(portfolio.exposure);
  assert.equal(curve.ep_curve.length, 5);
  assert.ok(curve.ep_curve.every((point) => Number.isFinite(point.loss_kes)));
  assert.ok(curve.points.every((point) => point.return_period_years > 0));
});

test('uploaded CSV exposure can produce an EP curve', () => {
  const csv = `loc_id,lat,lon,housing_class,floor_area_m2,cost_per_m2_kes,tiv_kes,synthetic,source,hazard_score_common,hazard_score_occasional,hazard_score_moderate,hazard_score_severe,hazard_score_extreme
NBO-UP-01,-1.300000,36.800000,semi_permanent,40,15000,600000,True,"uploaded test",0.10,0.20,0.35,0.55,0.80
NBO-UP-02,-1.310000,36.810000,informal_iron_sheet,20,10000,200000,True,"uploaded test",0.15,0.30,0.50,0.70,0.90`;

  const exposure = parseExposureCsv(csv);
  assert.equal(exposure.length, 2);
  const curve = computeLossCurve(exposure);
  assert.equal(curve.ep_curve.length, 5);
  assert.ok(curve.ep_curve.every((point) => Number.isFinite(point.loss_kes)));
  assert.ok(curve.points.every((point) => point.return_period_years > 0));
});
