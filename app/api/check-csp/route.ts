import { NextResponse } from "next/server";

/**
 * Validation-only endpoint. Returns the CSP frame-ancestors value
 * in the JSON body so the validation panel can verify iframe allowlist
 * at runtime (browsers strip CSP from fetch response headers).
 * Delete this route when you delete the validation component.
 */
export async function GET() {
  const ALLOWED_IFRAME_PARENTS = [
    "https://doppel-dashboard-staging-a7496acff9c6.herokuapp.com",
  ];

  const frameAncestors = ["'self'", ...ALLOWED_IFRAME_PARENTS].join(" ");
  const csp = `frame-ancestors ${frameAncestors}`;

  return NextResponse.json({ csp });
}
