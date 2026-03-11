import { createRemoteJWKSet, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

const USER_POOL_ID =
  process.env.COGNITO_USER_POOL_ID ?? process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "";
const CLIENT_ID =
  process.env.COGNITO_CLIENT_ID ?? process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "";
const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getIssuer(): string | null {
  if (!USER_POOL_ID) {
    return null;
  }

  const region = USER_POOL_ID.split("_", 1)[0];
  if (!region) {
    return null;
  }

  return `https://cognito-idp.${region}.amazonaws.com/${USER_POOL_ID}`;
}

function getJwks() {
  const issuer = getIssuer();
  if (!issuer) {
    return null;
  }

  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  }

  return jwks;
}

export async function getUserSub(req: NextRequest): Promise<string | null> {
  if (USE_MOCK_AUTH && process.env.NODE_ENV !== "production") {
    return "dev-mock-user";
  }

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.slice(7);
  const issuer = getIssuer();
  const jwkSet = getJwks();

  if (!issuer || !CLIENT_ID || !jwkSet) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, jwkSet, {
      issuer,
      audience: CLIENT_ID,
    });
    if (payload.token_use !== "id") {
      return null;
    }
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
