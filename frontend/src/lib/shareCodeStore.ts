import { nanoid } from "nanoid";

interface ShareEntry {
  jwt: string;
  expiresAt: number; // Unix seconds
}

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

export function createCode(jwt: string, expiresAt: Date): string {
  const store = getStore();
  const code = nanoid(8);
  store.set(code, { jwt, expiresAt: Math.floor(expiresAt.getTime() / 1000) });

  const now = Math.floor(Date.now() / 1000);
  for (const [k, v] of store.entries()) {
    if (v.expiresAt < now) {
      store.delete(k);
    }
  }

  return code;
}

export function resolveCodeEntry(code: string): { jwt: string; expiresAt: string } | null {
  const store = getStore();
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
