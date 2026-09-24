import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Refreshes the Supabase session cookie and bounces signed-out visitors to /login.
// Optimistic only: real authorization is requireMember() on every page and action.
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list, headers) => {
        for (const c of list) req.cookies.set(c.name, c.value);
        res = NextResponse.next({ request: req });
        for (const c of list) res.cookies.set(c.name, c.value, c.options);
        for (const [k, v] of Object.entries(headers ?? {})) res.headers.set(k, v);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const path = req.nextUrl.pathname;
  const isPublic = path === '/login' || path.startsWith('/auth/') || path === '/demo' || path.startsWith('/demo/');
  if (!data?.claims && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  // Machine endpoints (/api/*) authenticate with HMAC, not cookies.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\.(?:png|svg|jpg|ico)$).*)'],
};
