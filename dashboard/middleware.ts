import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for asset files
  if (pathname.startsWith('/_next') || pathname.match(/\.(png|jpg|jpeg|svg|ico|css|js|woff2?)$/)) {
    return NextResponse.next();
  }

  // Redirect legacy /console to /skills
  if (pathname === '/console') {
    return NextResponse.redirect(new URL('/skills', request.url));
  }

  const sessionCookie = request.cookies.get('synapse_session');

  // If already authenticated and accessing /login, redirect to destination or /skills
  if (pathname === '/login' && sessionCookie?.value) {
    const next = request.nextUrl.searchParams.get('next') || '/skills';
    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

