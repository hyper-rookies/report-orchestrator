# SS-05: SessionContext provider + useSessionStore

**전제 조건:** SS-02, SS-03, SS-04가 모두 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/context/SessionContext.tsx`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 생성할 파일

- `frontend/src/context/SessionContext.tsx`

---

## 구현 코드

### `frontend/src/context/SessionContext.tsx`

```typescript
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
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
  if (USE_MOCK_AUTH) return {};
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) return {};
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
      const res = await fetch("/api/sessions", { headers });
      if (res.ok) {
        setSessions((await res.json()) as SessionMeta[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const saveSession = useCallback(async (args: SaveSessionArgs) => {
    const headers = await getAuthHeaders();
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(args),
    });
    void refreshSessions();
  }, [refreshSessions]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const headers = await getAuthHeaders();
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ title }),
    });
    setSessions((prev) =>
      prev.map((s) => (s.sessionId === sessionId ? { ...s, title } : s))
    );
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    const headers = await getAuthHeaders();
    await fetch(`/api/sessions/${sessionId}`, { method: "DELETE", headers });
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
  }, []);

  const shareSession = useCallback(async (sessionId: string): Promise<ShareResult> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/sessions/${sessionId}/share`, {
      method: "POST",
      headers,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ShareResult;
  }, []);

  const value = useMemo(
    () => ({ sessions, loading, refreshSessions, saveSession, renameSession, deleteSession, shareSession }),
    [sessions, loading, refreshSessions, saveSession, renameSession, deleteSession, shareSession]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessionContext must be used inside SessionProvider");
  return ctx;
}
```

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `frontend/src/context/SessionContext.tsx` 생성됨
- [ ] `SessionProvider` export됨
- [ ] `useSessionContext` export됨 (SessionProvider 밖에서 사용 시 Error throw)
- [ ] sessions 로드: 마운트 시 자동 `GET /api/sessions` 호출
- [ ] saveSession 후 refreshSessions 자동 호출
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-05/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-05 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/context/SessionContext.tsx docs/tasks/SS-05/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): add SessionContext provider and store hook (SS-05)"`
