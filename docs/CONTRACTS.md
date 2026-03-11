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

### Optional Request Hint Fields

| Field | Type | Description |
|------|------|-------------|
| `questionIntent` | string | Intent hint such as `ranking`, `comparison`, `composition`, `time_series`, `raw_detail`, `single_kpi`, `funnel`, `retention`, or `generic` |
| `isTimeSeries` | boolean | Whether the request is a time-series question |
| `compositionMode` | boolean | Whether the request asks for a composition or breakdown |
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
- Dashboard share APIs remain out of scope for this contract and may still use Next.js-side storage helpers until migrated separately.

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

Share-link creation endpoints persist share metadata in the bucket configured by `SESSION_BUCKET`.

Rules:

- `POST /api/share` requires an authenticated caller.
- `POST /api/sessions/[id]/share` requires an authenticated caller.
- Shared read routes remain public and enforce expiry on lookup.
- Expired share entries may be deleted opportunistically during lookup.

