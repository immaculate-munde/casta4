const kes = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

/**
 * Build RAG prefix when a flood-desk property is selected.
 */
export function formatPropertyContext(ctx) {
  if (!ctx?.loc_id) return null;

  const lines = [
    '[Underwriting context — selected map property]',
    `Location ID: ${ctx.loc_id}`,
    `Cedant (primary insurer): ${ctx.cedant_name || ctx.cedant_id || 'Unknown'}`,
    `Kenya Re treaty book: ${ctx.kenya_re_in_book ? 'YES — currently reinsured' : 'NO — modeled exposure only'}`,
    `Construction: ${ctx.housing_label || ctx.housing_class || '—'}`,
    `TIV: ${kes.format(ctx.tiv_kes || 0)}`,
    `Coordinates: ${ctx.lat?.toFixed?.(5)}, ${ctx.lon?.toFixed?.(5)}`,
    `Flood scenario tier: ${ctx.active_tier || 'moderate'}`,
    `Hazard (this tier): ${ctx.hazard != null ? `${Math.round(ctx.hazard * 100)}%` : '—'}`,
    `Modelled ground-up loss (this tier): ${kes.format(ctx.loss_kes || 0)}`,
    '',
    'Answer as Kenya Re underwriter: flood risk, expected loss if we reinsure this cedant on this property, and treaty/policy referral points. Use retrieved documents plus the figures above.',
    '',
    'Underwriter question:',
  ];

  return lines.join('\n');
}

export function enrichQuestionWithProperty(userText, propertyContext) {
  const prefix = formatPropertyContext(propertyContext);
  if (!prefix) return userText;
  return `${prefix}\n${userText.trim()}`;
}
