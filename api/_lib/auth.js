// /api/_lib/auth.js
// Validates the caller's Microsoft (Entra ID) access token and
// resolves them to an app_users row (role, initials, etc.).
//
// App-registration prerequisites (one-time, on the SAME app
// registration PropCMA's MSAL client already uses):
//   1. Expose an API → Add a scope, e.g. "access_as_user".
//      The Application ID URI becomes  api://<client-id>
//   2. Manifest → set "requestedAccessTokenVersion": 2
//      (so access tokens are v2 and the issuer below matches).
//   3. Frontend requests this scope:
//      acquireTokenSilent({ scopes: ["api://<client-id>/access_as_user"] })
//
// Env vars:
//   MS_TENANT_ID       your Entra tenant id
//   MS_API_AUDIENCE    "api://<client-id>"  (or the bare client id —
//                      v2 tokens use the client id as `aud`)

import { createRemoteJWKSet, jwtVerify } from "jose";
import { supabase } from "./supabase.js";

const JWKS = createRemoteJWKSet(
  new URL(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/discovery/v2.0/keys`
  )
);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Verify the bearer token and return the app_users row.
 * Throws HttpError(401/403) on failure.
 */
export async function requireUser(req, allowedRoles = null) {
  const authz = req.headers.authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) throw new HttpError(401, "Missing bearer token");

  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, {
      issuer: `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/v2.0`,
      audience: process.env.MS_API_AUDIENCE,
    }));
  } catch (e) {
    throw new HttpError(401, `Token validation failed: ${e.message}`);
  }

  const oid = payload.oid;
  if (!oid) throw new HttpError(401, "Token has no oid claim");

  const { data: user, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("oid", oid)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new HttpError(500, "User lookup failed");
  if (!user)
    // Include the caller's own oid so an admin can provision them
    // without chasing it up in Entra. Safe to echo: the token has
    // already been cryptographically validated above, so this is the
    // caller's own id being shown back to them — not a lookup of
    // anyone else, and not a secret.
    throw new HttpError(
      403,
      `Signed in with Microsoft as ${payload.preferred_username || payload.email || "unknown"}, ` +
      `but not set up in the Deal Sheet app. Ask an administrator to add this Object ID: ${oid}`
    );

  if (allowedRoles && !allowedRoles.includes(user.role))
    throw new HttpError(403, `Requires role: ${allowedRoles.join(" or ")}`);

  return user; // { oid, email, display_name, initials, role, ... }
}

/** Standard error responder for handlers. */
export function sendError(res, e) {
  const status = e instanceof HttpError ? e.status : 500;
  const message = e instanceof HttpError ? e.message : "Internal error";
  if (status === 500) console.error(e);
  res.status(status).json({ error: message });
}
