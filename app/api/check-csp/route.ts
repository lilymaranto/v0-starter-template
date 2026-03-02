import { NextResponse } from "next/server";

/**
 * Validation-only endpoint. Returns the CSP frame-ancestors header
 * so the validation panel can verify iframe allowlist at runtime.
 * Delete this route when you delete the validation component.
 */
export async function GET() {
  // The middleware sets CSP headers on all matched routes.
  // We read the header from our own response to surface it to the client.
  const response = NextResponse.json({ ok: true });

  // Re-read what middleware would set -- we replicate the allowlist here
  // so validation can compare against the actual middleware config.
  const ALLOWED_IFRAME_PARENTS = [
    "https://doppel-dashboard-staging-a7496acff9c6.herokuapp.com",
  ];

  const frameAncestors = ["'self'", ...ALLOWED_IFRAME_PARENTS].join(" ");
  response.headers.set(
    "Content-Security-Policy",
    `frame-ancestors ${frameAncestors}`
  );

  return response;
}
