"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import type { SessionMeta, StoredMessage } from "@/types/session";

interface SaveSessionArgs {
  sessionId: string;
  title: string;
  messages: StoredMessage[];
}

interface ShareResult {
  url: string;
  expiresAt: string;
}

interface SessionContextValue {
  sessions: SessionMeta[];
  loading: boolean;
  refreshSessions: () => Promise<void>;
  saveSession: (args: SaveSessionArgs) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  shareSession: (sessionId: string) => Promise<ShareResult>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (USE_MOCK_AUTH) {
    return {};
  }

  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) {
      return {};
    }

    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshSessions = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/sessions", { headers });
      if (response.ok) {
        setSessions((await response.json()) as SessionMeta[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const saveSession = useCallback(
    async (args: SaveSessionArgs) => {
      const headers = await getAuthHeaders();
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(args),
      });
      void refreshSessions();
    },
    [refreshSessions]
  );

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const headers = await getAuthHeaders();
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ title }),
    });
    setSessions((prev) =>
      prev.map((session) => (session.sessionId === sessionId ? { ...session, title } : session))
    );
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    const headers = await getAuthHeaders();
    await fetch(`/api/sessions/${sessionId}`, { method: "DELETE", headers });
    setSessions((prev) => prev.filter((session) => session.sessionId !== sessionId));
  }, []);

  const shareSession = useCallback(async (sessionId: string): Promise<ShareResult> => {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/sessions/${sessionId}/share`, {
      method: "POST",
      headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as ShareResult;
  }, []);

  const value = useMemo(
    () => ({
      sessions,
      loading,
      refreshSessions,
      saveSession,
      renameSession,
      deleteSession,
      shareSession,
    }),
    [sessions, loading, refreshSessions, saveSession, renameSession, deleteSession, shareSession]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionContext(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSessionContext must be used inside SessionProvider");
  }

  return context;
}
