# SH-01: JWT sign/verify + 단축코드 스토어

**전제 조건:** SC-04가 `docs/tasks/status.json`에서 `"done"` 상태여야 한다.

## 작업 개요

`frontend/src/lib/shareToken.ts`와 `frontend/src/lib/shareCodeStore.ts`를 생성한다.
**다른 파일은 수정하지 않는다.**

## 사전 작업: 의존성 설치

```bash
cd frontend
npm install jose nanoid
```

## 생성할 파일

- `frontend/src/lib/shareToken.ts`
- `frontend/src/lib/shareCodeStore.ts`

## 환경 변수 추가

`frontend/.env.local`에 추가 (파일이 없으면 생성):

```
SHARE_TOKEN_SECRET=change-me-to-a-32-char-or-longer-secret
```

`frontend/.env.example`에도 추가 (커밋용):

```
SHARE_TOKEN_SECRET=
```

---

## 구현 코드

### `frontend/src/lib/shareToken.ts`

```typescript
import { SignJWT, jwtVerify } from "jose";

const SHARE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7일

function getSecret(): Uint8Array {
  const secret = process.env.SHARE_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SHARE_TOKEN_SECRET must be set and at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export interface ShareTokenPayload {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
}

export async function signShareToken(payload: ShareTokenPayload): Promise<string> {
  return new SignJWT({ s: payload.weekStart, e: payload.weekEnd, l: payload.weekLabel })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SHARE_TTL_SECONDS}s`)
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifyShareToken(token: string): Promise<ShareTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.s !== "string" ||
      typeof payload.e !== "string" ||
      typeof payload.l !== "string"
    ) return null;
    return { weekStart: payload.s, weekEnd: payload.e, weekLabel: payload.l };
  } catch {
    return null;
  }
}

export function getExpiresAt(): Date {
  return new Date(Date.now() + SHARE_TTL_SECONDS * 1000);
}
```

### `frontend/src/lib/shareCodeStore.ts`

```typescript
import { nanoid } from "nanoid";

interface ShareEntry {
  jwt: string;
  expiresAt: number; // Unix seconds
}

// 서버 싱글턴 (Next.js 서버 프로세스 전역)
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
  const code = nanoid(8); // aB3xY7qZ 형태
  store.set(code, { jwt, expiresAt: Math.floor(expiresAt.getTime() / 1000) });
  // 만료된 항목 정리 (코드 생성 시마다 스캔)
  const now = Math.floor(Date.now() / 1000);
  for (const [k, v] of store.entries()) {
    if (v.expiresAt < now) store.delete(k);
  }
  return code;
}

export function resolveCode(code: string): string | null {
  const store = getStore();
  const entry = store.get(code);
  if (!entry) return null;
  if (Math.floor(Date.now() / 1000) > entry.expiresAt) {
    store.delete(code);
    return null;
  }
  return entry.jwt;
}
```

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `frontend/src/lib/shareToken.ts` 생성됨
- [ ] `frontend/src/lib/shareCodeStore.ts` 생성됨
- [ ] `signShareToken` / `verifyShareToken` / `getExpiresAt` export됨
- [ ] `createCode` / `resolveCode` export됨
- [ ] `SHARE_TOKEN_SECRET` 미설정 시 `Error` throw
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SH-01/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SH-01 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/lib/shareToken.ts frontend/src/lib/shareCodeStore.ts frontend/.env.example docs/tasks/SH-01/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(share): add JWT sign/verify and short code store (SH-01)"`
```
