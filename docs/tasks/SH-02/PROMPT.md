# SH-02: POST /api/share + GET /api/share/[code]

**Prerequisite:** SH-01 must be marked `"done"` in `docs/tasks/status.json`.

## Overview

Create the public share API routes:

- `frontend/src/app/api/share/route.ts`
- `frontend/src/app/api/share/[code]/route.ts`

The documented contract in this prompt matches the current implementation.

---

## Contract

### `POST /api/share`

Request body:

```json
{
  "weekStart": "YYYY-MM-DD",
  "weekEnd": "YYYY-MM-DD",
  "weekLabel": "string"
}
```

Success body:

```json
{
  "code": "string",
  "url": "https://.../share/<code>?token=<jwt>",
  "expiresAt": "ISO-8601 timestamp"
}
```

### `GET /api/share/[code]`

Success body:

```json
{
  "weekStart": "YYYY-MM-DD",
  "weekEnd": "YYYY-MM-DD",
  "weekLabel": "string",
  "expiresAt": "ISO-8601 timestamp"
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
| `POST /api/share` | `200` | Share link created |
| `POST /api/share` | `400` | Malformed JSON or invalid share request payload |
| `POST /api/share` | `500` | Share link creation failed |
| `GET /api/share/[code]` | `200` | Share resolved successfully |
| `GET /api/share/[code]` | `400` | Malformed share code or malformed share token |
| `GET /api/share/[code]` | `404` | Unknown or non-existent share code |
| `GET /api/share/[code]` | `410` | Expired share, expired token, or expired backing entry |
| `GET /api/share/[code]` | `500` | Share resolution failed |

---

## Validation

```bash
cd frontend && npx tsc --noEmit
```

Expected: exit code `0`.

## Acceptance Criteria

- [ ] `frontend/src/app/api/share/route.ts` exists with a POST handler
- [ ] `frontend/src/app/api/share/[code]/route.ts` exists with a GET handler
- [ ] `POST /api/share` returns `400` for malformed JSON or invalid request fields
- [ ] `GET /api/share/[code]` returns `404` for unknown/non-existent code
- [ ] `GET /api/share/[code]` returns `410` for expired share, expired token, or expired backing entry
- [ ] `GET /api/share/[code]` returns `{ weekStart, weekEnd, weekLabel, expiresAt }` on success
- [ ] All non-2xx responses return `{ error: string }`
- [ ] `cd frontend && npx tsc --noEmit` passes

## Completion

1. Update `docs/tasks/SH-02/REPORT.md`.
2. Update `docs/tasks/status.json` with `"done"` or `"blocked"` for `SH-02`.
3. Stage the API files plus docs.
4. Commit with `feat(share): add POST /api/share and GET /api/share/[code] routes (SH-02)`.
