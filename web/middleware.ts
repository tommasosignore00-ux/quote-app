import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Protected routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/onboarding',
  '/api/quotes',
  '/api/clients',
  '/api/jobs',
];

// Public routes that should NOT redirect
const publicRoutes = [
  '/auth',
  '/subscription/success',
  '/subscription/cancel',
  '/api/auth',
  '/api/stripe/webhook',
];

// Session timeout in milliseconds (30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Allow public routes
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));
  if (isPublicRoute) {
    return response;
  }

  // Only check protected routes
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));
  if (!isProtected) {
    return response;
  }

  // Create Supabase client with proper cookie handling (v0.8+ API)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // First set cookies on the request (for SSR)
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          // Then set cookies on the response (for the browser)
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  try {
    // Use getUser() - it validates the token with Supabase server
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log('Middleware: no valid user, redirecting to login', { pathname });
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    // Session exists - check last activity for timeout
    const lastActivityCookie = request.cookies.get('last-activity')?.value;
    const lastActivity = lastActivityCookie ? parseInt(lastActivityCookie) : Date.now();
    const now = Date.now();

    if (now - lastActivity > SESSION_TIMEOUT) {
      await supabase.auth.signOut();
      const redirectResponse = NextResponse.redirect(new URL('/auth/login', request.url));
      redirectResponse.cookies.delete('last-activity');
      return redirectResponse;
    }

    // Update last activity timestamp
    response.cookies.set('last-activity', now.toString(), {
      maxAge: SESSION_TIMEOUT / 1000,
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return response;
  } catch (err) {
    console.error('Middleware error:', err);
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }
}

export const config = {
  matcher: [
    // Match all paths except static and public
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
