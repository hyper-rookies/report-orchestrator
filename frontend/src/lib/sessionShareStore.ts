import { nanoid } from "nanoid";
import type { SessionData } from "@/types/session";

interface SessionShareEntry {
  sessionData: SessionData;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __sessionShareStore: Map<string, SessionShareEntry> | undefined;
}

const TTL_SECONDS = 7 * 24 * 60 * 60;

function getStore(): Map<string, SessionShareEntry> {
  if (!global.__sessionShareStore) {
    global.__sessionShareStore = new Map();
  }

  return global.__sessionShareStore;
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

  const now = Math.floor(Date.now() / 1000);
  for (const [key, value] of store.entries()) {
    if (value.expiresAt < now) {
      store.delete(key);
    }
  }

  return { code, expiresAt };
}

export function resolveSessionShareCode(code: string): SessionData | null {
  const store = getStore();
  const entry = store.get(code);

  if (!entry) {
    return null;
  }

  if (Math.floor(Date.now() / 1000) > entry.expiresAt) {
    store.delete(code);
    return null;
  }

  return entry.sessionData;
}
