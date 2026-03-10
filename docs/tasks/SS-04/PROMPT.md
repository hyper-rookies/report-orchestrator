# SS-04: sessionShareStore.ts + session share APIs

**Prerequisite:** SS-03 must be marked `"done"` in `docs/tasks/status.json`.

## Overview

Create the session share store and public session share API routes:

- `frontend/src/lib/sessionShareStore.ts`
- `frontend/src/app/api/sessions/[id]/share/route.ts`
- `frontend/src/app/api/share/session/[code]/route.ts`

The documented contract in this prompt matches the current implementation.

---

## Contract

### `POST /api/sessions/[id]/share`

Success body:

```json
{
  "code": "string",
  "url": "https://.../share/session/<code>",
  "expiresAt": "ISO-8601 timestamp"
}
```

### `GET /api/share/session/[code]`

Success body:

```json
{
  "sessionId": "string",
  "title": "string",
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp",
  "messages": []
}
```

Error body for all non-2xx responses:

```json
{
  "error": "string"
}
```

## Status Code Matrix

| Route | Status | Meaning |
|------|--------|---------|
| `POST /api/sessions/[id]/share` | `200` | Session share link created |
| `POST /api/sessions/[id]/share` | `400` | Malformed session id |
| `POST /api/sessions/[id]/share` | `401` | Unauthorized |
| `POST /api/sessions/[id]/share` | `404` | Session was not found |
| `POST /api/sessions/[id]/share` | `500` | Session share creation failed |
| `GET /api/share/session/[code]` | `200` | Shared session resolved successfully |
| `GET /api/share/session/[code]` | `400` | Malformed share code |
| `GET /api/share/session/[code]` | `404` | Unknown or non-existent share code |
| `GET /api/share/session/[code]` | `410` | Expired share or expired backing entry |
| `GET /api/share/session/[code]` | `500` | Share resolution failed |

---

## Validation

```bash
cd frontend && npx tsc --noEmit
```

Expected: exit code `0`.

## Acceptance Criteria

- [ ] `frontend/src/lib/sessionShareStore.ts` exists with `createSessionShareCode` and `resolveSessionShareCode`
- [ ] `POST /api/sessions/[id]/share` returns `404` when the session is missing
- [ ] `POST /api/sessions/[id]/share` returns `{ code, url, expiresAt }` on success
- [ ] `GET /api/share/session/[code]` returns `SessionData` on success
- [ ] `GET /api/share/session/[code]` returns `404` for unknown/non-existent code
- [ ] `GET /api/share/session/[code]` returns `410` for expired share or expired backing entry
- [ ] All non-2xx responses return `{ error: string }`
- [ ] TTL of 7 days (`604800` seconds) is applied
- [ ] `cd frontend && npx tsc --noEmit` passes

## Completion

1. Update `docs/tasks/SS-04/REPORT.md`.
2. Update `docs/tasks/status.json` with `"done"` or `"blocked"` for `SS-04`.
3. Stage the route/store files plus docs.
4. Commit with `feat(sessions): add session share store and API routes (SS-04)`.
