# CONTRACTS

Encoding contract: all agents must read and write Markdown, JSON, TypeScript, and text files as UTF-8 (preferably without BOM) to prevent Korean text corruption.

## SSE Events (Orchestrator -> Frontend)

The orchestrator emits the following SSE event types:

- `meta`
- `progress`
- `chunk`
- `table`
- `chart`
- `final`
- `error`

## Chart Spec Contract (`chart` event)

`chart` event payload shape:

```json
{
  "version": "v1",
  "spec": {
    "type": "bar | line | table | pie | stackedBar",
    "title": "optional",
    "selectionReason": "required",
    "data": []
  }
}
```

## Additive Viz Contract Fields

`chartType` remains required. The additive change is that callers may now set
`chartType: "auto"` and may optionally provide selection hints.

When the orchestrator invokes the viz action group, it may rewrite the outgoing
viz parameters using the original user question:

- Explicit user requests such as pie, line, bar, table, or stacked bar override the agent-provided `chartType`.
- When the user does not explicitly request a chart type, the orchestrator forces `chartType: "auto"` and injects prompt-derived hints such as `questionIntent`, `compositionMode`, `shareMode`, `comparisonMode`, and `isTimeSeries`.
- `compositionMode` is broader than `shareMode`: generic composition questions may still render as bar or stacked bar, while share / proportion / ratio questions are the primary path that prefers pie charts in auto mode.
- `single_kpi` questions should prefer a number-like or table-like answer shape and should not be forced into a chart unless the user explicitly asks for one.

### Optional Request Hint Fields

| Field | Type | Description |
|------|------|-------------|
| `questionIntent` | string | Intent hint such as `ranking`, `comparison`, `composition`, `time_series`, `raw_detail`, `single_kpi`, `funnel`, `retention`, or `generic` |
| `isTimeSeries` | boolean | Whether the request is a time-series question |
| `compositionMode` | boolean | Whether the request asks for a composition or breakdown |
| `shareMode` | boolean | Whether the request explicitly asks for share / ratio / proportion style output |
| `comparisonMode` | boolean | Whether the request compares groups or periods |
| `deltaIncluded` | boolean | Whether delta or change values are included |
| `categoryCount` | integer | Optional category count hint |
| `metricCount` | integer | Optional metric count hint |
| `rowCount` | integer | Optional row count hint |

### Additive Response Field

| Field | Path | Description |
|------|------|-------------|
| `selectionReason` | `spec.selectionReason` | Reason for the selected chart type, for example `"auto: ranking, categoryCount=5<=15 -> bar"` or `"explicit: bar"` |

Example response:

```json
{
  "version": "v1",
  "spec": {
    "type": "bar",
    "title": "Sessions by Channel",
    "selectionReason": "auto: ranking, categoryCount=3<=15 -> bar",
    "xAxis": "channel",
    "series": [
      { "metric": "sessions", "label": "Sessions" }
    ],
    "data": [
      { "channel": "Organic", "sessions": 100 },
      { "channel": "Paid", "sessions": 80 },
      { "channel": "Referral", "sessions": 20 }
    ]
  }
}
```

### `bar` and `line`

```json
{
  "type": "bar",
  "title": "optional",
  "selectionReason": "required",
  "xAxis": "dimension_column",
  "series": [
    { "metric": "sessions", "label": "Sessions" }
  ],
  "data": []
}
```

### `stackedBar`

`stackedBar` uses the same schema as `bar` and supports multiple series.

```json
{
  "type": "stackedBar",
  "title": "optional",
  "selectionReason": "required",
  "xAxis": "dimension_column",
  "series": [
    { "metric": "retained_users", "label": "Retained Users" },
    { "metric": "cohort_size", "label": "Cohort Size" }
  ],
  "data": []
}
```

### `pie`

```json
{
  "type": "pie",
  "title": "optional",
  "selectionReason": "required",
  "nameKey": "channel_group",
  "valueKey": "sessions",
  "data": []
}
```

### `table`

```json
{
  "type": "table",
  "title": "optional",
  "selectionReason": "required",
  "data": []
}
```

## Orchestrator Request Contract

`POST` body for the report orchestrator:

```json
{
  "question": "required non-empty string",
  "autoApproveActions": "optional boolean, defaults to true"
}
```

Rules:

- `question` is required, trimmed, and must be 2000 characters or fewer.
- Malformed JSON must return HTTP `400`.
- `autoApproveActions` is optional and must be a boolean when present.
- If the client omits `autoApproveActions`, the server falls back to `BEDROCK_AUTO_APPROVE_ACTIONS` and defaults to `true` when the env is unset.
- The current web client always sends `autoApproveActions: true`; manual approve / reject continuation is not exposed in the frontend yet.
- Before Bedrock is called, the orchestrator may preprocess the question against the shared reporting policy and catalog.
- Obvious unsupported questions such as `Airbridge`, `OS/platform`, phase-deferred dimensions, raw row-level asks, cross-view joins, or ranges beyond the `90` day policy may be rejected before Bedrock execution.
- `channel_group` is an allowed curated dimension and must not be short-circuited as an unsupported `channel` request.
- Prompt augmentation must tell the agent that internal date handling uses `dt` and that it must not ask the user for schema or column names.
- For relative-date asks like `지난주`, `최근 4주`, or `지난달`, prompt augmentation should anchor the request to the latest available `dt` in the selected curated view rather than blindly using the wall-clock date.
- Event-like terms such as `purchase`, `sign_up`, `af_purchase`, and `first_open` should be preserved as filters when the user asks for a specific event, unless the user explicitly asks for an event-name breakdown.
- Cohort asks such as `day 7`, `D7`, and `7일차 retention` should be normalized to `cohort_day = 7` and should prefer a derived retention-rate answer shape when possible.
- Single KPI asks such as `최신 날짜 Google Ads 설치 수 알려줘` should preserve the requested filter and should avoid unnecessary grouped breakdowns.

## Eval Reference API Contract

The orchestrator Lambda also exposes a read-only eval helper route for the local benchmark runner.

Rules:

- Route: `POST /eval/reference`
- This route must return `404` unless `DISABLE_AUTH=true`.
- Supported request payloads are:
  - `{ "operation": "latestDates" }`
  - `{ "operation": "executeQuery", "sql": "...", "maxRows"?: number, "timeoutSeconds"?: number, "caseId"?: string }`
- `latestDates` returns `{ version, operation, latestDates }`, where `latestDates` contains one `YYYY-MM-DD` value per allowed curated view.
- `executeQuery` returns `{ version, operation, rows, rowCount, truncated, queryId }` and may echo `caseId` when provided.
- The route must not execute arbitrary unsafe SQL. It must reuse the existing `query-lambda` `executeAthenaQuery` validation path, so only buildSQL-compatible read-only queries are allowed.
- This route exists only for short-lived benchmark automation and should not be treated as a permanent public product API.

## Session Storage Contract

Session storage is served by the orchestrator Lambda Function URL. The Next.js `app/api` routes proxy to that backend and must not access S3 directly for session CRUD or session share reads.

Rules:

- `GET /api/sessions` lists the authenticated caller's session metadata sorted by `updatedAt` descending.
- `POST /api/sessions` creates or overwrites a session for the authenticated caller.
- `GET /api/sessions/[id]`, `PATCH /api/sessions/[id]`, and `DELETE /api/sessions/[id]` operate only on the authenticated caller's namespace.
- `POST /api/sessions/[id]/share` creates a public share code backed by `SESSION_BUCKET`.
- `GET /api/share/session/[code]` remains public and resolves stored session data until expiry.

## Bookmark Storage Contract

Bookmark storage is also served by the orchestrator Lambda Function URL. The Next.js `app/api` routes proxy to that backend and must not access S3 directly for bookmark CRUD.

Rules:

- `GET /api/bookmarks` lists the authenticated caller's bookmarks sorted by `createdAt` descending.
- `POST /api/bookmarks` requires a non-empty `prompt` string and a `frames` array of `{ type, data }` objects.
- `POST /api/bookmarks` derives `title`, `previewType`, and optional `chartType` from the stored frames and returns `{ bookmarkId }`.
- `GET /api/bookmarks/[id]` and `DELETE /api/bookmarks/[id]` operate only on the authenticated caller's namespace.

## Query Lambda Execute Contract

`executeAthenaQuery` only accepts buildSQL-compatible read-only queries.

Rules:

- Only single-statement `SELECT` queries are allowed.
- SQL comments, `SELECT *`, DDL/DML, and advanced query forms such as `JOIN`, `UNION`, `WITH`, `INTERSECT`, and `EXCEPT` are rejected.
- The `FROM` dataset must match an allowed view in `catalog_discovered.json` and `reporting_policy.json`.
- `workgroup`, `database`, and `outputLocation` are resolved only from server env:
  - `ATHENA_WORKGROUP`
  - `ATHENA_DATABASE`
  - `ATHENA_OUTPUT_LOCATION`
- Request-level overrides for Athena connection settings are ignored.

## Row Mapping Contract

Athena row mapping rules:

- Integer types map to `int`
- Floating types map to `float`
- String-like types map to `str`
- `NULL` cells map to `null`
- `_run_rank` and `run_id` are stripped from the response

## Share Link Storage Contract

Dashboard share links are also served by the orchestrator Lambda Function URL. The Next.js `app/api/share` routes proxy to that backend and must not access S3 directly.

Rules:

- `POST /api/share` requires an authenticated caller.
- `POST /api/share` stores dashboard share metadata in `SESSION_BUCKET` and returns `{ code, url, expiresAt }`.
- `GET /api/share/[code]` remains public and resolves `{ weekStart, weekEnd, weekLabel, expiresAt }` until expiry.
- `GET /api/share/[code]` may still accept a legacy `?token=` query parameter during migration, but newly generated links should rely on stored share codes only.
- `POST /api/sessions/[id]/share` requires an authenticated caller.
- Shared read routes remain public and enforce expiry on lookup.
- Expired share entries may be deleted opportunistically during lookup.