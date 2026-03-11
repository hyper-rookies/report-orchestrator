import { createHmac, timingSafeEqual } from "crypto";

const SHARE_TTL_SECONDS = 7 * 24 * 60 * 60;

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

function getSecret(): Buffer {
  const secret = process.env.SHARE_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SHARE_TOKEN_SECRET must be set and at least 32 characters.");
  }

  return Buffer.from(secret, "utf-8");
}

function encodeJsonBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64url");
}

function decodeJsonBase64Url(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf-8")) as unknown;
}

function createSignature(signingInput: string): Buffer {
  return createHmac("sha256", getSecret()).update(signingInput).digest();
}

export async function signShareToken(payload: ShareTokenPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJsonBase64Url({ alg: "HS256", typ: "JWT" });
  const body = encodeJsonBase64Url({
    s: payload.weekStart,
    e: payload.weekEnd,
    l: payload.weekLabel,
    iat: now,
    exp: now + SHARE_TTL_SECONDS,
  });
  const signingInput = `${header}.${body}`;
  const signature = createSignature(signingInput).toString("base64url");

  return `${signingInput}.${signature}`;
}

export async function verifyShareToken(token: string): Promise<VerifyShareTokenResult> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { status: "invalid" };
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  try {
    const header = decodeJsonBase64Url(headerPart) as { alg?: unknown; typ?: unknown };
    if (header.alg !== "HS256" || header.typ !== "JWT") {
      return { status: "invalid" };
    }

    const expectedSignature = createSignature(`${headerPart}.${payloadPart}`);
    const actualSignature = Buffer.from(signaturePart, "base64url");
    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      return { status: "invalid" };
    }

    const payload = decodeJsonBase64Url(payloadPart) as {
      s?: unknown;
      e?: unknown;
      l?: unknown;
      exp?: unknown;
    };

    if (
      typeof payload.s !== "string" ||
      typeof payload.e !== "string" ||
      typeof payload.l !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return { status: "invalid" };
    }

    if (Math.floor(Date.now() / 1000) > payload.exp) {
      return { status: "expired" };
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
  } catch {
    return { status: "invalid" };
  }
}

export function getExpiresAt(): Date {
  return new Date(Date.now() + SHARE_TTL_SECONDS * 1000);
}
