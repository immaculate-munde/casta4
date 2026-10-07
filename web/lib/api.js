export function ragApiBase() {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('api');
    if (q) return q.replace(/\/$/, '');
  }
  return (process.env.NEXT_PUBLIC_RAG_API_URL || 'http://localhost:3001').replace(/\/$/, '');
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
  const res = await fetch(`${base}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.answer || 'No answer returned.';
}
