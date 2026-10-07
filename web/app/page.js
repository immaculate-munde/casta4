import Link from 'next/link';

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 28 }}>Kenya Re · Casta4</h1>
      <p style={{ margin: 0, color: '#5c6570', maxWidth: 420, textAlign: 'center' }}>
        Next.js frontend. Run <code>node rag-server.js</code> on port 3001, then start this app with{' '}
        <code>npm run dev</code> in <code>web/</code>.
      </p>
      <nav style={{ display: 'flex', gap: 16 }}>
        <Link href="/catastrophe" style={{ fontWeight: 600 }}>
          Nairobi flood desk
        </Link>
        <Link href="/chat" style={{ fontWeight: 600 }}>
          Claims chat
        </Link>
      </nav>
    </main>
  );
}
