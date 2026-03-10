# SS-01: 의존성 + S3 유틸 + 공통 타입

**전제 조건:** 없음 (독립)

## 작업 개요

`@aws-sdk/client-s3` 설치, `frontend/src/lib/sessionS3.ts`, `frontend/src/types/session.ts` 생성.
**다른 파일은 수정하지 않는다.**

## 사전 작업: 의존성 설치

```bash
cd frontend
npm install @aws-sdk/client-s3
```

## 생성할 파일

- `frontend/src/types/session.ts`
- `frontend/src/lib/sessionS3.ts`

---

## 구현 코드

### `frontend/src/types/session.ts`

```typescript
import type { SseFrame } from "@/hooks/useSse";

export interface SessionMeta {
  sessionId: string;
  title: string;
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  frames?: SseFrame[]; // chunk/status/delta 제외한 frames만 저장
}

export interface SessionData extends SessionMeta {
  messages: StoredMessage[];
}
```

### `frontend/src/lib/sessionS3.ts`

```typescript
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

function getClient(): S3Client {
  return new S3Client({ region: process.env.AWS_REGION ?? "ap-northeast-2" });
}

function getBucket(): string {
  const bucket = process.env.SESSION_BUCKET;
  if (!bucket) throw new Error("SESSION_BUCKET env var is not set.");
  return bucket;
}

export async function s3GetJson<T>(key: string): Promise<T | null> {
  try {
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: key })
    );
    const body = await res.Body?.transformToString("utf-8");
    if (!body) return null;
    return JSON.parse(body) as T;
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "NoSuchKey") return null;
    throw err;
  }
}

export async function s3PutJson(key: string, data: unknown): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
    })
  );
}

export async function s3Delete(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key })
  );
}

export const indexKey = (sub: string) => `sessions/${sub}/index.json`;
export const sessionKey = (sub: string, id: string) => `sessions/${sub}/${id}.json`;
```

## 환경 변수 추가

`frontend/.env.local`에 추가 (없으면 생성):
```
SESSION_BUCKET=your-s3-bucket-name
AWS_REGION=ap-northeast-2
```

`frontend/.env.example`에도 추가:
```
SESSION_BUCKET=
AWS_REGION=ap-northeast-2
```

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `frontend/src/types/session.ts` 생성됨 (SessionMeta, StoredMessage, SessionData)
- [ ] `frontend/src/lib/sessionS3.ts` 생성됨 (s3GetJson, s3PutJson, s3Delete, indexKey, sessionKey)
- [ ] `@aws-sdk/client-s3` package.json에 추가됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SS-01/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SS-01 status → `"done"` 또는 `"blocked"`
3. `git add frontend/src/types/session.ts frontend/src/lib/sessionS3.ts frontend/.env.example frontend/package.json frontend/package-lock.json docs/tasks/SS-01/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(sessions): add S3 utility and session types (SS-01)"`
