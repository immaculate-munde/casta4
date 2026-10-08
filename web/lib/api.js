export function ragApiBase() {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('api');
    if (q) return q.replace(/\/$/, '');
    // Same-origin proxy via next.config rewrites (avoids CORS; still needs rag-server on 3001)
    return '';
  }
  return (process.env.NEXT_PUBLIC_RAG_API_URL || 'http://localhost:3001').replace(/\/$/, '');
}

/** Append query params (skips null/undefined/empty). */
export function withQuery(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') qs.set(key, String(value));
  }
  const tail = qs.toString();
  return tail ? `${path}?${tail}` : path;
}

export async function fetchRagJson(path) {
  const res = await fetch(`${ragApiBase()}${path}`);
  return parseJsonResponse(res, path);
}

export async function postRagJson(path, body) {
  const res = await fetch(`${ragApiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJsonResponse(res, path);
}

async function parseJsonResponse(res, path) {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    throw new Error(
      `API returned HTML instead of JSON (${path}, HTTP ${res.status}). Is rag-server.js running on port 3001? Restart it after code changes.`
    );
  }
  let data;
  try {
    data = trimmed ? JSON.parse(trimmed) : {};
  } catch {
    throw new Error(`${path} → HTTP ${res.status}: ${text.slice(0, 180)}`);
  }
  if (!res.ok) {
    const detail = data.error || data.message || text.slice(0, 120);
    if (data.missing?.length && !String(detail).includes(data.missing[0])) {
      throw new Error(`${detail} (${data.missing.join(', ')})`);
    }
    throw new Error(detail);
  }
  return data;
}

export async function askClaims(question, context = []) {
  const base = ragApiBase();
  const path = base ? `${base}/ask` : '/api/rag/ask';
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return {
    answer: data.answer || 'No answer returned.',
    sources: Array.isArray(data.sources) ? data.sources : [],
  };
}
