import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DEFAULT_HOME, isSignedIn } from '@/lib/auth-roles';

const COOKIE = 'casta4_session';
const MAX_AGE = 60 * 60 * 24 * 7;

function encodeSession(session) {
  return Buffer.from(JSON.stringify(session), 'utf8').toString('base64');
}

function decodeSession(value) {
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export async function GET() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return NextResponse.json({ session: null });
  const session = decodeSession(raw);
  if (!isSignedIn(session)) {
    return NextResponse.json({ session: null });
  }
  return NextResponse.json({
    session: { email: session.email, name: session.name },
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim() || email.split('@')[0] || 'User';

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const session = { email, name, signedInAt: Date.now() };
  const jar = await cookies();
  jar.set(COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });

  return NextResponse.json({
    ok: true,
    redirect: DEFAULT_HOME,
    session: { email, name },
  });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(COOKIE);
  return NextResponse.json({ ok: true });
}
