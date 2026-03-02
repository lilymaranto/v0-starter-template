// Middleware for iframe embedding support (finisher pattern).
// Allow parent origin for dashboard embedding (iframe CSP).
// Keeps policy route-scoped -- only applies frame-ancestors to app routes.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWED_IFRAME_PARENTS = [
  "https://doppel-dashboard-staging-a7496acff9c6.herokuapp.com",
];

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Build frame-ancestors directive: self + allowed dashboard origins
  const frameAncestors = ["'self'", ...ALLOWED_IFRAME_PARENTS].join(" ");

  response.headers.set(
    "Content-Security-Policy",
    `frame-ancestors ${frameAncestors}`
  );

  // Also set X-Frame-Options for older browsers (ALLOW-FROM is deprecated
  // but still helps with some legacy user agents)
  response.headers.set("X-Frame-Options", "SAMEORIGIN");

  return response;
}

// Only apply to app routes, not to static assets or API routes
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-|apple-icon).*)",
  ],
};
