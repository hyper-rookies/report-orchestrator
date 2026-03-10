import { nanoid } from "nanoid";

interface ShareEntry {
  jwt: string;
  expiresAt: number; // Unix seconds
}

const MAX_ENTRIES = 500;

declare global {
  // eslint-disable-next-line no-var
  var __shareCodeStore: Map<string, ShareEntry> | undefined;
}

function getStore(): Map<string, ShareEntry> {
  if (!global.__shareCodeStore) {
    global.__shareCodeStore = new Map();
  }
  return global.__shareCodeStore;
}

function pruneStore(store: Map<string, ShareEntry>, now: number): void {
  for (const [key, value] of store.entries()) {
    if (value.expiresAt < now) {
      store.delete(key);
    }
  }

  while (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) {
      break;
    }
    store.delete(oldestKey);
  }
}

export function createCode(jwt: string, expiresAt: Date): string {
  const store = getStore();
  const code = nanoid(8);
  store.set(code, { jwt, expiresAt: Math.floor(expiresAt.getTime() / 1000) });

  const now = Math.floor(Date.now() / 1000);
  pruneStore(store, now);

  return code;
}

export function resolveCodeEntry(code: string): { jwt: string; expiresAt: string } | null {
  const store = getStore();
  // This is only a process-local short-code cache. Restarts or multi-instance routing
  // can miss entries until the signed-token fallback is used by the caller.
  const entry = store.get(code);
  if (!entry) {
    return null;
  }
  if (Math.floor(Date.now() / 1000) > entry.expiresAt) {
    store.delete(code);
    return null;
  }

  return {
    jwt: entry.jwt,
    expiresAt: new Date(entry.expiresAt * 1000).toISOString(),
  };
}

export function resolveCode(code: string): string | null {
  return resolveCodeEntry(code)?.jwt ?? null;
}
