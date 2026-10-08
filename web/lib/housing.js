export function housingToConstruction(housingClass) {
  if (housingClass === 'concrete_rcc') return 'RCC';
  if (housingClass === 'informal_iron_sheet' || housingClass === 'semi_permanent') return 'Informal';
  return 'Masonry';
}

export function dr100Band(dr) {
  const d = Number(dr) || 0;
  if (d >= 0.5) return 'high';
  if (d >= 0.25) return 'watch';
  return 'low';
}
