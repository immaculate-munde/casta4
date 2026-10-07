const GREETING_TEMPLATES = [
  "What's cooking, {name}?",
  'Hey {name} — what should we dig into?',
  "Good to see you, {name}. What's on your mind?",
  'Ready when you are, {name}.',
  'Back at it, {name}? Ask me anything.',
  '{name}, what can ReAgent help you with today?',
  'Karibu, {name}. What would you like to know?',
  'Hi {name} — policies, treaties, or flood risk?',
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function titleCase(word) {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** First name (or friendly handle) from sign-in display name or email. */
export function displayFirstName(name, email) {
  const trimmed = String(name || '').trim();
  if (trimmed) {
    const part = trimmed.split(/\s+/)[0];
    return titleCase(part);
  }
  const local = String(email || '').split('@')[0] || '';
  if (!local) return null;
  const token = local.replace(/[._-]+/g, ' ').trim().split(/\s+/)[0];
  return token ? titleCase(token) : null;
}

/**
 * Pick a stable greeting for an empty chat (seed = session id or greetingSeed).
 */
export function pickChatGreeting({ name, email, seed = 'default' }) {
  const first = displayFirstName(name, email);
  const who = first || 'there';
  const idx = hashString(String(seed)) % GREETING_TEMPLATES.length;
  return GREETING_TEMPLATES[idx].replace(/\{name\}/g, who);
}
