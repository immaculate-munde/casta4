const GREETING_ONLY =
  /^(hi+|hello+|hey+|hiya+|yo+|howdy+|good\s+(morning|afternoon|evening)|how\s+are\s+you|who\s+are\s+you)[\s!?.]*$/i;

const GREETING_PREFIX =
  /^(hi+|hello+|hey+|hiya+|yo+|good\s+(morning|afternoon|evening))[\s,!]+/i;

/** Sidebar title from first user message — skip bare greetings. */
export function titleFromFirstMessage(text) {
  const raw = String(text || '').trim();
  if (!raw) return 'New chat';
  if (GREETING_ONLY.test(raw)) return 'New chat';
  const stripped = raw.replace(GREETING_PREFIX, '').trim();
  const use = stripped.length >= 12 ? stripped : raw;
  if (use.length <= 48) return use;
  return `${use.slice(0, 45).trim()}…`;
}

export function defaultEpCurveTitle(regionLabel) {
  return `EP curve · ${regionLabel || 'Portfolio'}`;
}

export function defaultPropertyTitle(locId) {
  return locId ? `Property · ${locId}` : 'Property underwriting';
}
