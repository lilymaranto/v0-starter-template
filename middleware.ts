// @hardened — do not modify without re-running validation panel.
// Structural invariants enforced: ALLOWED_IFRAME_PARENTS, frame-ancestors CSP,
// no X-Frame-Options, API routes excluded from matcher.
//
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

  // In production, lock down frame-ancestors to self + allowed dashboard origins.
  // In non-production (v0 preview, local dev), allow any embedder so the
  // preview iframe is not blocked by CSP.
  const isProduction = process.env.NODE_ENV === "production" &&
    !request.headers.get("host")?.includes("vusercontent.net") &&
    !request.headers.get("host")?.includes("v0.dev") &&
    !request.headers.get("host")?.includes("localhost");

  if (isProduction) {
    const frameAncestors = ["'self'", ...ALLOWED_IFRAME_PARENTS].join(" ");
    response.headers.set(
      "Content-Security-Policy",
      `frame-ancestors ${frameAncestors}`
    );
  }
  // else: no frame-ancestors set, so any embedder (v0 preview, localhost) works

  // Do NOT set X-Frame-Options here. SAMEORIGIN would block the cross-origin
  // dashboard embed that frame-ancestors explicitly allows.
  // Browsers that support CSP ignore XFO; browsers that don't support CSP
  // are too old for this use case. Removing XFO prevents the header conflict.
  response.headers.delete("X-Frame-Options");

  return response;
}

// Only apply to page routes, not to static assets or API routes
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-|apple-icon|api/).*)",
  ],
};
