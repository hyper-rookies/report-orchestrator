import { nanoid } from "nanoid";
import { hasSessionBucket, s3Delete, s3GetJson, s3PutJson } from "./sessionS3";

interface ShareEntry {
  jwt: string;
  expiresAt: number; // Unix seconds
}

export type ResolveShareCodeEntryResult =
  | { status: "ok"; entry: { jwt: string; expiresAt: string } }
  | { status: "expired" }
  | { status: "missing" };

export const dashboardShareCodeKey = (code: string) => `shares/dashboard/${code}.json`;

export function hasShareStore(): boolean {
  return hasSessionBucket();
}

export async function createCode(jwt: string, expiresAt: Date): Promise<string> {
  if (!hasShareStore()) {
    throw new Error("Share storage is unavailable.");
  }

  const code = nanoid(8);
  await s3PutJson(dashboardShareCodeKey(code), {
    jwt,
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
  });
  return code;
}

export async function resolveCodeEntry(code: string): Promise<ResolveShareCodeEntryResult> {
  const entry = await s3GetJson<ShareEntry>(dashboardShareCodeKey(code));
  if (!entry) {
    return { status: "missing" };
  }
  if (Math.floor(Date.now() / 1000) > entry.expiresAt) {
    await s3Delete(dashboardShareCodeKey(code)).catch(() => undefined);
    return { status: "expired" };
  }

  return {
    status: "ok",
    entry: {
      jwt: entry.jwt,
      expiresAt: new Date(entry.expiresAt * 1000).toISOString(),
    },
  };
}

export async function resolveCode(code: string): Promise<string | null> {
  const result = await resolveCodeEntry(code);
  return result.status === "ok" ? result.entry.jwt : null;
}
