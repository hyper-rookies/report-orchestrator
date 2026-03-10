import { nanoid } from "nanoid";
import type { SessionData } from "@/types/session";

interface SessionShareEntry {
  sessionData: SessionData;
  expiresAt: number;
}

export type ResolveSessionShareCodeResult =
  | { status: "ok"; sessionData: SessionData; expiresAt: string }
  | { status: "expired" }
  | { status: "missing" };

const TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_ENTRIES = 200;

declare global {
  var __sessionShareStore: Map<string, SessionShareEntry> | undefined;
}

function getStore(): Map<string, SessionShareEntry> {
  if (!global.__sessionShareStore) {
    global.__sessionShareStore = new Map();
  }

  return global.__sessionShareStore;
}

function pruneStore(store: Map<string, SessionShareEntry>): void {
  while (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) {
      break;
    }
    store.delete(oldestKey);
  }
}

export function createSessionShareCode(sessionData: SessionData): {
  code: string;
  expiresAt: Date;
} {
  const store = getStore();
  const code = nanoid(8);
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  store.set(code, {
    sessionData,
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
  });

  pruneStore(store);

  return { code, expiresAt };
}

export function resolveSessionShareCode(code: string): ResolveSessionShareCodeResult {
  const store = getStore();
  // This store is intentionally process-local for now, so links are not durable
  // across server restarts or load-balanced instance hops.
  const entry = store.get(code);

  if (!entry) {
    return { status: "missing" };
  }

  if (Math.floor(Date.now() / 1000) > entry.expiresAt) {
    return { status: "expired" };
  }

  return {
    status: "ok",
    sessionData: entry.sessionData,
    expiresAt: new Date(entry.expiresAt * 1000).toISOString(),
  };
}
