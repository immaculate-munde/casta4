import { cookies } from 'next/headers';
import { isSignedIn } from '@/lib/auth-roles';

const COOKIE = 'casta4_session';

function decodeSession(value) {
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export async function getServerSession() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const session = decodeSession(raw);
  if (!isSignedIn(session)) return null;
  return { email: session.email.toLowerCase(), name: session.name };
}
