import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/env";

const AUTH_PAGES = ["/login", "/signup"];

// Refreshes the Supabase session cookie and does optimistic redirects.
// Real authorization happens again on the server, close to the data.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;
  const isDashboard = ["/dashboard", "/onboarding", "/admin"].some((p) => pathname.startsWith(p));

  if (!isSupabaseConfigured) {
    if (isDashboard) {
      return NextResponse.redirect(new URL("/login?setup=1", request.url));
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  const redirectWithCookies = (path: string) => {
    const target = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
    return target;
  };

  if (isDashboard && !signedIn) {
    const next = encodeURIComponent(pathname + request.nextUrl.search);
    return redirectWithCookies(`/login?next=${next}`);
  }

  if (signedIn && AUTH_PAGES.includes(pathname)) {
    return redirectWithCookies("/dashboard");
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding", "/admin/:path*", "/login", "/signup", "/auth/:path*"],
};
