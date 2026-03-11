# Ticket-00 Deployment Preparation Checklist

## Purpose

This document is the operator-owned checklist for production deployment.
Code changes in this repo assume these settings are prepared before release.

## Required Environment Variables

| Area | Variable | Requirement |
|------|----------|-------------|
| Frontend auth | `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | required |
| Frontend auth | `NEXT_PUBLIC_COGNITO_CLIENT_ID` | required |
| Frontend auth | `NEXT_PUBLIC_COGNITO_DOMAIN` | required for OAuth login |
| Frontend auth | `NEXT_PUBLIC_APP_URL` | required for OAuth redirect |
| Frontend auth | `NEXT_PUBLIC_USE_MOCK_AUTH` | must be `false` |
| Frontend share | `SHARE_TOKEN_SECRET` | required, 32+ chars |
| Shared storage | `SESSION_BUCKET` | required |
| Orchestrator | `BEDROCK_AGENT_ID` | required |
| Orchestrator | `BEDROCK_AGENT_ALIAS_ID` | required |
| Orchestrator | `COGNITO_USER_POOL_ID` | required |
| Orchestrator | `COGNITO_CLIENT_ID` | required |
| Orchestrator | `DISABLE_AUTH` | must be `false` |
| Orchestrator | `BEDROCK_AUTO_APPROVE_ACTIONS` | explicitly set for the environment |
| Query lambda | `ATHENA_WORKGROUP` | required |
| Query lambda | `ATHENA_DATABASE` | required |
| Query lambda | `ATHENA_OUTPUT_LOCATION` | required |
| Shared AWS region | `AWS_REGION` | required |

## Infrastructure Preconditions

- `SESSION_BUCKET` exists and is writable by the Next.js server runtime.
- `SESSION_BUCKET` has server-side encryption enabled.
- `SESSION_BUCKET` has public access blocked.
- `SESSION_BUCKET` has lifecycle rules for expired share prefixes if long-term cleanup is desired.
- Athena workgroup is fixed and allowed for the query lambda role only.
- Athena result bucket/path matches `ATHENA_OUTPUT_LOCATION`.
- Lambda roles have least-privilege access to:
  - Cognito/JWKS verification path
  - Bedrock agent invoke
  - Athena query execution
  - S3 read/write for session and share storage

## Deployment Blockers

Do not release if any of the following is true:

- `DISABLE_AUTH=true`
- `NEXT_PUBLIC_USE_MOCK_AUTH=true`
- `SESSION_BUCKET` is missing
- `SHARE_TOKEN_SECRET` is missing or short
- `ATHENA_*` env values are unset
- Bedrock agent/alias IDs are unset
- The query lambda role can write Athena results outside the approved output location

## Manual Smoke Checks

### Auth

- Open the app while logged out and confirm protected pages redirect to login.
- Call `/api/sessions` without a bearer token and confirm `401`.
- Call `/api/share` without a bearer token and confirm `401`.

### Chat / Orchestrator

- Ask a normal supported analytics question and confirm `meta -> progress -> table -> chart/final`.
- Send malformed JSON to the orchestrator and confirm HTTP `400`.
- Send an empty `question` and confirm HTTP `400`.

### Query Lambda

- Run one normal buildSQL -> execute flow and confirm Athena succeeds.
- Confirm a destructive query such as `DELETE ...` is rejected with `SCHEMA_VIOLATION`.
- Confirm Athena results still land only in `ATHENA_OUTPUT_LOCATION`.

### Share Links

- Create a dashboard share link while logged in and confirm the returned URL does not include `?token=`.
- Open a dashboard share link without login and confirm read-only access works.
- Create a session share link, redeploy or recycle the app process, and confirm the link still works.
- Confirm expired links return `410`.

### Session / Bookmark Storage

- Save, rename, delete, and share a session.
- Create, read, and delete a bookmark.
- Temporarily unset `SESSION_BUCKET` in a non-prod environment and confirm read APIs fail with `503`, not empty success responses.

## Monitoring / Ops

- Enable CloudWatch alarms for orchestrator errors and Athena timeout spikes.
- Track `QUERY_TIMEOUT`, `ATHENA_FAILED`, and `SCHEMA_VIOLATION` counts separately.
- Review Bedrock agent logs after rollout for repeated `APPROVAL_REQUIRED` or schema-validation loops.
