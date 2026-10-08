/**
 * JS flood loss engine (CSV hazard scores → exponential damage ratio).
 */

export const TIERS = [
  { id: 'common', field: 'hazard_score_common', label: 'Common', returnPeriodYears: 5, aep: 0.2 },
  { id: 'occasional', field: 'hazard_score_occasional', label: 'Occasional', returnPeriodYears: 10, aep: 0.1 },
  { id: 'moderate', field: 'hazard_score_moderate', label: 'Moderate', returnPeriodYears: 25, aep: 0.04 },
  { id: 'severe', field: 'hazard_score_severe', label: 'Severe', returnPeriodYears: 100, aep: 0.01 },
  { id: 'extreme', field: 'hazard_score_extreme', label: 'Extreme', returnPeriodYears: 250, aep: 0.004 },
];

const VULNERABILITY = {
  informal_iron_sheet: { cap: 0.92, alpha: 4.2 },
  semi_permanent: { cap: 0.88, alpha: 3.6 },
  permanent_masonry: { cap: 0.85, alpha: 3.0 },
  concrete_rcc: { cap: 0.8, alpha: 2.4 },
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function damageRatio(housingClass, hazardScore) {
  const h = Math.max(0, Math.min(1, num(hazardScore)));
  const params = VULNERABILITY[housingClass] || VULNERABILITY.semi_permanent;
  const ratio = params.cap * (1 - Math.exp(-params.alpha * h));
  return Math.min(params.cap, ratio);
}

export function hazardBand(score) {
  const s = num(score);
  if (s >= 0.5) return 'high';
  if (s >= 0.25) return 'watch';
  return 'low';
}

export function enrichRow(row, tierId) {
  const tier = TIERS.find((t) => t.id === tierId) || TIERS[2];
  const hazard = row.hazards[tier.id];
  const dr = damageRatio(row.housing_class, hazard);
  const loss_kes = dr * row.tiv_kes;
  return {
    ...row,
    active_tier: tier.id,
    hazard,
    hazard_band: hazardBand(hazard),
    damage_ratio: dr,
    loss_kes,
  };
}

export function tierLossesForRow(row) {
  return TIERS.map((tier) => {
    const hazard = row.hazards[tier.id];
    const dr = damageRatio(row.housing_class, hazard);
    return {
      tier: tier.id,
      label: tier.label,
      return_period_years: tier.returnPeriodYears,
      aep: tier.aep,
      hazard,
      damage_ratio: dr,
      loss_kes: dr * row.tiv_kes,
    };
  });
}

function totalTiv(exposure) {
  return exposure.reduce((s, r) => s + r.tiv_kes, 0);
}

export function computeLossCurve(exposure) {
  const points = TIERS.map((tier) => {
    let portfolio_loss_kes = 0;
    const by_housing = {};

    for (const row of exposure) {
      const hazard = row.hazards[tier.id];
      const dr = damageRatio(row.housing_class, hazard);
      const loss = dr * row.tiv_kes;
      portfolio_loss_kes += loss;

      if (!by_housing[row.housing_class]) {
        by_housing[row.housing_class] = {
          housing_class: row.housing_class,
          label: row.housing_label,
          loss_kes: 0,
          tiv_kes: 0,
        };
      }
      by_housing[row.housing_class].loss_kes += loss;
      by_housing[row.housing_class].tiv_kes += row.tiv_kes;
    }

    return {
      tier: tier.id,
      label: tier.label,
      return_period_years: tier.returnPeriodYears,
      aep: tier.aep,
      portfolio_loss_kes,
      loss_pct_of_tiv: totalTiv(exposure) > 0 ? portfolio_loss_kes / totalTiv(exposure) : 0,
      by_housing: Object.values(by_housing),
    };
  });

  return {
    engine: 'javascript-legacy',
    points,
    ep_curve: points.map((p) => ({
      return_period_years: p.return_period_years,
      aep: p.aep,
      loss_kes: p.portfolio_loss_kes,
    })),
  };
}
