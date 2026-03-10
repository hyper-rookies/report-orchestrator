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
  saveSession: (args: SaveSessionArgs) => Promise<SessionMeta>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  shareSession: (sessionId: string) => Promise<ShareResult>;
  getSessionTitle: (sessionId: string) => string | null;
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

function sortSessionsByUpdatedAt(items: SessionMeta[]): SessionMeta[] {
  return [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim().length > 0) {
      return body.error;
    }
  } catch {
    // fall through to fallback
  }

  return fallback;
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
    // Keep the initial fetch at provider mount because the app-wide sidebar renders
    // recent sessions on every authenticated route in the `(app)` layout.
    void refreshSessions();
  }, [refreshSessions]);

  const saveSession = useCallback(
    async (args: SaveSessionArgs) => {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(args),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "세션 저장에 실패했습니다."));
      }

      const savedMeta = (await response.json()) as SessionMeta;
      setSessions((prev) =>
        sortSessionsByUpdatedAt([
          savedMeta,
          ...prev.filter((session) => session.sessionId !== savedMeta.sessionId),
        ])
      );

      return savedMeta;
    },
    []
  );

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, "세션 이름 변경에 실패했습니다."));
    }

    const updated = (await response.json()) as {
      sessionId: string;
      title: string;
      updatedAt: string;
    };

    setSessions((prev) =>
      sortSessionsByUpdatedAt(
        prev.map((session) =>
          session.sessionId === updated.sessionId
            ? { ...session, title: updated.title, updatedAt: updated.updatedAt }
            : session
        )
      )
    );
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE", headers });
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, "세션 삭제에 실패했습니다."));
    }
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

  const getSessionTitle = useCallback(
    (sessionId: string) => sessions.find((session) => session.sessionId === sessionId)?.title ?? null,
    [sessions]
  );

  const value = useMemo(
    () => ({
      sessions,
      loading,
      refreshSessions,
      saveSession,
      renameSession,
      deleteSession,
      shareSession,
      getSessionTitle,
    }),
    [
      sessions,
      loading,
      refreshSessions,
      saveSession,
      renameSession,
      deleteSession,
      shareSession,
      getSessionTitle,
    ]
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
