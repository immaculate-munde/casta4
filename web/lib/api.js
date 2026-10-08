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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
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
