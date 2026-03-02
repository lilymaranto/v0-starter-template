import { NextResponse } from "next/server";
import { headers } from "next/headers";

/**
 * Validation-only endpoint for Check 16 (embed header conflict).
 * Performs a same-origin fetch to "/" to observe real response headers
 * set by middleware/upstream, then returns both intended and observed values.
 * Delete this route when you delete the validation component.
 */

const ALLOWED_IFRAME_PARENTS = [
  "https://doppel-dashboard-staging-a7496acff9c6.herokuapp.com",
];

export async function GET() {
  const frameAncestors = ["'self'", ...ALLOWED_IFRAME_PARENTS].join(" ");
  const intendedCsp = `frame-ancestors ${frameAncestors}`;

  try {
    // Determine origin from incoming request headers
    const hdrs = await headers();
    const host = hdrs.get("host") ?? "localhost:3000";
    const proto = hdrs.get("x-forwarded-proto") ?? "http";
    const origin = `${proto}://${host}`;

    // Fetch the app root to observe real middleware headers
    const res = await fetch(`${origin}/`, {
      method: "HEAD",
      cache: "no-store",
      redirect: "manual",
    });

    const observedCsp = res.headers.get("content-security-policy") ?? "";
    const observedXFrameOptions = res.headers.get("x-frame-options") ?? "";

    return NextResponse.json({
      intendedCsp,
      allowedParents: ALLOWED_IFRAME_PARENTS,
      observedCsp,
      observedXFrameOptions: observedXFrameOptions || null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        intendedCsp,
        allowedParents: ALLOWED_IFRAME_PARENTS,
        observedCsp: null,
        observedXFrameOptions: null,
        error: err instanceof Error ? err.message : "fetch failed",
      },
      { status: 500 }
    );
  }
}
