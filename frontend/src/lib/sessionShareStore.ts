import { nanoid } from "nanoid";
import type { SessionData } from "@/types/session";
import { hasSessionBucket, s3Delete, s3GetJson, s3PutJson } from "./sessionS3";

interface SessionShareEntry {
  sessionData: SessionData;
  expiresAt: number;
}

export type ResolveSessionShareCodeResult =
  | { status: "ok"; sessionData: SessionData; expiresAt: string }
  | { status: "expired" }
  | { status: "missing" };

const TTL_SECONDS = 7 * 24 * 60 * 60;

export const sessionShareCodeKey = (code: string) => `shares/session/${code}.json`;

export function hasSessionShareStore(): boolean {
  return hasSessionBucket();
}

export async function createSessionShareCode(sessionData: SessionData): Promise<{
  code: string;
  expiresAt: Date;
}> {
  if (!hasSessionShareStore()) {
    throw new Error("Session share storage is unavailable.");
  }

  const code = nanoid(8);
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  await s3PutJson(sessionShareCodeKey(code), {
    sessionData,
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
  });
  return { code, expiresAt };
}

export async function resolveSessionShareCode(code: string): Promise<ResolveSessionShareCodeResult> {
  const entry = await s3GetJson<SessionShareEntry>(sessionShareCodeKey(code));

  if (!entry) {
    return { status: "missing" };
  }

  if (Math.floor(Date.now() / 1000) > entry.expiresAt) {
    await s3Delete(sessionShareCodeKey(code)).catch(() => undefined);
    return { status: "expired" };
  }

  return {
    status: "ok",
    sessionData: entry.sessionData,
    expiresAt: new Date(entry.expiresAt * 1000).toISOString(),
  };
}
