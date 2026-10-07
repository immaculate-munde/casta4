import { NextResponse } from 'next/server';
import { isSignedIn } from './lib/auth-roles';

const COOKIE = 'casta4_session';
const PROTECTED_PREFIXES = ['/dashboard', '/catastrophe'];

function decodeSession(value) {
  try {
    return JSON.parse(atob(value));
  } catch {
    return null;
  }
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const raw = request.cookies.get(COOKIE)?.value;
  if (!raw) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  const session = decodeSession(raw);
  if (!isSignedIn(session)) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/catastrophe/:path*'],
};
