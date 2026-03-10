import { SignJWT, errors, jwtVerify } from "jose";

const SHARE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.SHARE_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SHARE_TOKEN_SECRET must be set and at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export interface ShareTokenPayload {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
}

export interface VerifiedShareTokenPayload extends ShareTokenPayload {
  expiresAt: string;
}

export type VerifyShareTokenResult =
  | { status: "ok"; payload: VerifiedShareTokenPayload }
  | { status: "expired" }
  | { status: "invalid" };

export async function signShareToken(payload: ShareTokenPayload): Promise<string> {
  return new SignJWT({ s: payload.weekStart, e: payload.weekEnd, l: payload.weekLabel })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SHARE_TTL_SECONDS}s`)
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifyShareToken(token: string): Promise<VerifyShareTokenResult> {
  const secret = getSecret();

  try {
    const { payload } = await jwtVerify(token, secret);
    if (
      typeof payload.s !== "string" ||
      typeof payload.e !== "string" ||
      typeof payload.l !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return { status: "invalid" };
    }
    return {
      status: "ok",
      payload: {
        weekStart: payload.s,
        weekEnd: payload.e,
        weekLabel: payload.l,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      return { status: "expired" };
    }

    return { status: "invalid" };
  }
}

export function getExpiresAt(): Date {
  return new Date(Date.now() + SHARE_TTL_SECONDS * 1000);
}
