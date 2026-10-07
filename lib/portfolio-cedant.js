/** Synthetic cedant + Kenya Re treaty book flags (deterministic per loc_id). */

export const CEDANTS = [
  { id: 'APA', name: 'APA Insurance (Kenya)' },
  { id: 'BRITAM', name: 'Britam General Insurance' },
  { id: 'CIC', name: 'CIC General Insurance' },
  { id: 'JUBILEE', name: 'Jubilee Allianz General Insurance' },
  { id: 'UAP', name: 'UAP Old Mutual Insurance' },
  { id: 'MADISON', name: 'Madison General Insurance Kenya' },
];

function hashLoc(locId) {
  const s = String(locId || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function parseBool(v) {
  if (v === true || v === 1) return true;
  const t = String(v || '').trim().toLowerCase();
  return t === 'true' || t === '1' || t === 'yes' || t === 'y';
}

/**
 * Attach cedant and kenya_re_in_book from CSV columns or synthetic rules.
 */
export function attachCedantFields(raw, normalized) {
  let cedant_id = String(raw.cedant_id || raw.cedant || '').trim().toUpperCase();
  let cedant_name = String(raw.cedant_name || '').trim();
  let kenya_re_in_book = raw.kenya_re_in_book !== undefined && raw.kenya_re_in_book !== ''
    ? parseBool(raw.kenya_re_in_book)
    : undefined;

  const h = hashLoc(normalized.loc_id);

  if (!cedant_id) {
    const cedant = CEDANTS[h % CEDANTS.length];
    cedant_id = cedant.id;
    cedant_name = cedant.name;
  } else if (!cedant_name) {
    cedant_name = CEDANTS.find((c) => c.id === cedant_id)?.name || cedant_id;
  }

  if (kenya_re_in_book === undefined) {
    // ~36% in Kenya Re treaty book; bias toward higher TIV locations
    const tivBoost = normalized.tiv_kes >= 15_000_000 ? 15 : 0;
    kenya_re_in_book = (h % 100) < 36 + tivBoost;
  }

  return {
    ...normalized,
    cedant_id,
    cedant_name,
    kenya_re_in_book,
  };
}
