# Contracts

All schemas are versioned. The current production version is **v1**.
Each Action Group is versioned independently.

---

## Versioning Strategy

- Every request and response object carries a top-level `"version"` field.
- **Within v1**: additive changes (new optional fields) are backward-compatible and do not require a version bump.
- **Breaking changes** (removing a field, changing a field's type, renaming a field) require a new version (e.g., `v2`).
- Action Groups are versioned independently. `query/v2` may ship before `analysis/v2`.
- v1 contracts must remain operational for a minimum of 2 sprints after a v2 version is declared stable.
- Codex must not modify a contract schema without a corresponding update to this document.

---

## 1. Action Group: query / v1

Handled by `query-lambda`. Registered to Bedrock Agent as Action Group `query`.

### 1.1 buildSQL

Generates a safe, policy-compliant Athena SQL string from a structured request.
The generated SQL must never be executed directly by the caller — pass it to `executeAthenaQuery`.

#### buildSQL — Request

```json
{
  "version": "v1",
  "view": "v_latest_ga4_acquisition_daily",
  "dateRange": {
    "start": "2026-01-01",
    "end": "2026-01-31"
  },
  "dimensions": ["channel_group", "source"],
  "metrics": ["sessions", "conversions", "total_revenue"],
  "filters": [
    {
      "column": "channel_group",
      "op": "=",
      "value": "organic"
    }
  ],
  "limit": 1000
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | `"v1"` | yes | |
| `view` | string | yes | Must be in `allowed_views` (reporting_policy.json) |
| `dateRange.start` | `YYYY-MM-DD` | yes | Inclusive |
| `dateRange.end` | `YYYY-MM-DD` | yes | Inclusive |
| `dimensions` | string[] | yes | Min 1 |
| `metrics` | string[] | yes | Min 1 |
| `filters` | Filter[] | no | Each filter: `{column, op, value}` |
| `filters[].op` | enum | yes | `=` `!=` `>` `<` `>=` `<=` `LIKE` `IN` |
| `filters[].value` | string \| number \| string[] | yes | string[] only valid for `IN` |
| `limit` | integer | no | Default: 1000. Max: 10000 |

#### buildSQL — Response

```json
{
  "version": "v1",
  "sql": "SELECT channel_group, source, sessions, conversions, total_revenue FROM hyper_intern_m1c.v_latest_ga4_acquisition_daily WHERE dt BETWEEN '2026-01-01' AND '2026-01-31' AND channel_group = 'organic' LIMIT 1000"
}
```

#### buildSQL — SQL build rules (enforced by query-lambda, not by the caller)

1. Only views from `allowed_views` in `reporting_policy.json` may appear in `FROM`.
2. Base tables (`ga4_acquisition_daily`, etc.) must never be referenced directly.
3. The SELECT clause must use only columns declared in `catalog_discovered.json` for the given view.
4. Columns in `denied_columns_global` (`_run_rank`, `run_id`) must be excluded from SELECT.
5. A `WHERE dt BETWEEN '{start}' AND '{end}'` clause is always injected as interpolated string literals. Parameterized bindings are not used. `start` and `end` must match `YYYY-MM-DD` format; query-lambda rejects any value that does not.
6. DML statements (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `CREATE`, `ALTER`) are rejected with `DML_REJECTED`.
7. `store_reinstall` is type STRING in AppsFlyer tables — comparisons must use `!= 'true'`, not `= FALSE`.

---

### 1.2 executeAthenaQuery

Executes a SQL string against Athena and returns mapped rows.

#### executeAthenaQuery — Request

```json
{
  "version": "v1",
  "sql": "SELECT channel_group, sessions FROM ...",
  "timeoutSeconds": 30,
  "maxRows": 10000,
  "workgroup": "hyper-intern-m1c-wg",
  "database": "hyper_intern_m1c",
  "outputLocation": "s3://hyper-intern-m1c-athena-results/query-results/",
  "pollIntervalMs": 500
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | `"v1"` | yes | |
| `sql` | string | yes | Must come from `buildSQL` output |
| `timeoutSeconds` | integer | yes | Max wait before `QUERY_TIMEOUT` error. Recommended: 30 |
| `maxRows` | integer | yes | Rows fetched from Athena result. Hard cap: 10000 |
| `workgroup` | string | no | Default: env `ATHENA_WORKGROUP` (`hyper-intern-m1c-wg`) |
| `database` | string | no | Default: env `ATHENA_DATABASE` (`hyper_intern_m1c`) |
| `outputLocation` | string (S3 URI) | no | Default: env `ATHENA_OUTPUT_LOCATION` |
| `pollIntervalMs` | integer | no | Default: 500. Min: 200 |

#### executeAthenaQuery — Response

```json
{
  "version": "v1",
  "rows": [
    { "channel_group": "organic", "sessions": 12450 },
    { "channel_group": "paid_search", "sessions": 8300 }
  ],
  "rowCount": 2,
  "truncated": false,
  "queryExecutionId": "a1b2c3d4-0000-0000-0000-000000000000"
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `rows` | `Array<Record<string, string \| number>>` | STRING columns → string; BIGINT/DOUBLE → number; `_run_rank` and `run_id` stripped |
| `rowCount` | integer | Actual row count returned |
| `truncated` | boolean | `true` if result hit `maxRows` cap |
| `queryExecutionId` | string | Athena query execution ID for audit |

---

## 2. Action Group: analysis / v1

Handled by `analysis-lambda`. Pure computation — no AWS SDK calls.

### 2.1 computeDelta

Aligns `baseline` and `comparison` row sets on `groupBy` keys and computes absolute and percentage change for each metric.

#### computeDelta — Request

```json
{
  "version": "v1",
  "baseline": [
    { "channel_group": "organic", "sessions": 10000, "conversions": 500 },
    { "channel_group": "paid_search", "sessions": 8000, "conversions": 320 }
  ],
  "comparison": [
    { "channel_group": "organic", "sessions": 12450, "conversions": 610 },
    { "channel_group": "paid_search", "sessions": 7900, "conversions": 315 }
  ],
  "groupBy": ["channel_group"],
  "metrics": ["sessions", "conversions"]
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | `"v1"` | yes | |
| `baseline` | `Array<Record<string, string \| number>>` | yes | Prior period rows |
| `comparison` | `Array<Record<string, string \| number>>` | yes | Current period rows |
| `groupBy` | string[] | yes | Columns used as join key |
| `metrics` | string[] | yes | Columns to compute delta on; must be numeric |

#### computeDelta — Response

```json
{
  "version": "v1",
  "deltas": [
    {
      "key": { "channel_group": "organic" },
      "baseline": { "sessions": 10000, "conversions": 500 },
      "comparison": { "sessions": 12450, "conversions": 610 },
      "delta": { "sessions": 2450, "conversions": 110 },
      "pctChange": { "sessions": 0.245, "conversions": 0.22 }
    },
    {
      "key": { "channel_group": "paid_search" },
      "baseline": { "sessions": 8000, "conversions": 320 },
      "comparison": { "sessions": 7900, "conversions": 315 },
      "delta": { "sessions": -100, "conversions": -5 },
      "pctChange": { "sessions": -0.0125, "conversions": -0.015625 }
    }
  ]
}
```

#### computeDelta — Alignment rules

- Rows are matched by the composite value of `groupBy` columns.
- If a key exists in `comparison` but not `baseline`, `baseline` fields are `null` and `pctChange` is `null`.
- If a key exists in `baseline` but not `comparison`, `comparison` fields are `null`, `delta` is `null`, `pctChange` is `null`.
- `pctChange` is `null` (not `Infinity`) when `baseline` value is `0` or `null`.

#### computeDelta — Metric value casting rules

- If a metric column value is already a number (`int` or `float`), use it as-is.
- If a metric column value is a string that parses as a float (`float(value)` in Python / `parseFloat` in JS succeeds and is not `NaN`), coerce it to float before computing delta. This handles Athena `DECIMAL` columns that arrive as strings.
- If a metric value is `null` or missing, treat it as absent (see alignment rules above).
- If a metric value is a non-numeric string that cannot be parsed as float, return `INVALID_METRIC_VALUE` (HTTP 400) with the offending column name in `error.message`.

---

## 3. Action Group: viz / v1

Handled by `viz-lambda`. Pure spec generation — no data fetching, no AWS SDK calls.

### 3.1 buildChartSpec

Generates a frontend-renderable chart specification from row data.

#### buildChartSpec — Request

```json
{
  "version": "v1",
  "rows": [
    { "channel_group": "organic", "sessions": 12450, "conversions": 610 },
    { "channel_group": "paid_search", "sessions": 7900, "conversions": 315 }
  ],
  "chartType": "bar",
  "title": "Sessions and Conversions by Channel",
  "xAxis": "channel_group",
  "yAxis": ["sessions", "conversions"]
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | `"v1"` | yes | |
| `rows` | `Array<Record<string, string \| number>>` | yes | Same shape as `executeAthenaQuery` response rows |
| `chartType` | `"bar" \| "line" \| "table"` | yes | |
| `title` | string | no | |
| `xAxis` | string | no | Column name; required for `bar`/`line`, ignored for `table` |
| `yAxis` | string[] | no | Column names; required for `bar`/`line`, ignored for `table` |

#### buildChartSpec — Response

```json
{
  "version": "v1",
  "spec": {
    "type": "bar",
    "title": "Sessions and Conversions by Channel",
    "xAxis": "channel_group",
    "series": [
      { "metric": "sessions", "label": "Sessions" },
      { "metric": "conversions", "label": "Conversions" }
    ],
    "data": [
      { "channel_group": "organic", "sessions": 12450, "conversions": 610 },
      { "channel_group": "paid_search", "sessions": 7900, "conversions": 315 }
    ]
  }
}
```

For `chartType: "table"`, `xAxis` and `series` are omitted and `data` contains all columns.

---

## 4. Error Schema

All Action Group Lambdas use meaningful HTTP status codes. The response body schema is identical regardless of status code.

```json
{
  "version": "v1",
  "error": {
    "code": "QUERY_TIMEOUT",
    "message": "Athena query exceeded 30s timeout.",
    "retryable": false,
    "actionGroup": "query"
  }
}
```

### HTTP status codes

| Status | When |
| --- | --- |
| `200` | Success — no `error` field in body |
| `400` | Caller error: contract violation, validation failure, DML rejected |
| `500` | Internal error: Athena failure, timeout, guardrail block, unknown |

### Body schema

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `"v1"` | |
| `error.code` | string (enum) | See codes below |
| `error.message` | string | Human-readable; may be shown to end user |
| `error.retryable` | boolean | `true` if the Agent may safely retry the same call |
| `error.actionGroup` | string | `"query"` \| `"analysis"` \| `"viz"` \| `"orchestrator"` |

### Error codes

| Code | Action Group | HTTP | Retryable | Meaning |
| --- | --- | --- | --- | --- |
| `QUERY_TIMEOUT` | query | 500 | false | Athena execution exceeded `timeoutSeconds` |
| `ATHENA_FAILED` | query | 500 | false | Athena returned `FAILED` state |
| `SCHEMA_VIOLATION` | query | 400 | false | SQL references denied view, table, or column |
| `DML_REJECTED` | query | 400 | false | SQL contains DML statement |
| `ALIGNMENT_ERROR` | analysis | 400 | false | `groupBy` columns not found in input rows |
| `INVALID_METRIC_VALUE` | analysis | 400 | false | Metric value is non-numeric and cannot be parsed as float |
| `INVALID_CHART_TYPE` | viz | 400 | false | `chartType` not in allowed enum |
| `MISSING_AXIS` | viz | 400 | false | `xAxis`/`yAxis` required but absent for bar/line |
| `GUARDRAIL_BLOCKED` | orchestrator | 500 | false | Bedrock guardrail rejected the request |
| `UNKNOWN` | any | 500 | false | Unclassified internal error |

---

## 5. Report Response Schema (SSE Events)

The Orchestrator Lambda streams Server-Sent Events to the browser. Each event follows the SSE wire format:

```text
event: <type>\n
data: <JSON>\n\n
```

All timestamps use **UTC ISO8601 format** (`Z` suffix). The frontend is responsible for converting to KST (`UTC+9`) for display.

Six event types are defined for v1:

### 5.1 meta

Sent immediately after the SSE connection is established, before the Agent is invoked.

```json
{
  "version": "v1",
  "reportId": "rpt-20260303-abc123",
  "timestamp": "2026-03-03T09:00:00Z",
  "requestSummary": {
    "view": "v_latest_ga4_acquisition_daily",
    "dateRange": { "start": "2026-01-01", "end": "2026-01-31" }
  }
}
```

### 5.2 progress

Sent at each major step transition. May be sent multiple times.

```json
{
  "version": "v1",
  "step": "buildSQL",
  "message": "Generating SQL for v_latest_ga4_acquisition_daily"
}
```

`step` enum: `"buildSQL"` | `"executeAthena"` | `"computeDelta"` | `"buildChart"`

### 5.3 table

Sent once when tabular data is ready.

```json
{
  "version": "v1",
  "rows": [
    { "channel_group": "organic", "sessions": 12450 }
  ],
  "rowCount": 1,
  "truncated": false
}
```

### 5.4 chart

Sent once when the chart spec is ready. Contains the full `buildChartSpec` response spec.

```json
{
  "version": "v1",
  "spec": {
    "type": "bar",
    "title": "Sessions by Channel",
    "xAxis": "channel_group",
    "series": [{ "metric": "sessions", "label": "Sessions" }],
    "data": [{ "channel_group": "organic", "sessions": 12450 }]
  }
}
```

### 5.5 final

Sent as the last event before the SSE stream closes.

```json
{
  "version": "v1",
  "reportId": "rpt-20260303-abc123",
  "totalRows": 12,
  "completedAt": "2026-03-03T09:00:04Z"
}
```

### 5.6 error

Sent if a non-recoverable error occurs at any stage. The stream closes after this event.

```json
{
  "version": "v1",
  "code": "QUERY_TIMEOUT",
  "message": "Athena query exceeded 30s timeout.",
  "retryable": false
}
```

---

## 6. Athena ResultSet → Row Mapping Contract

`executeAthenaQuery` is responsible for mapping the raw Athena `ResultSet` structure to `Array<Record<string, string | number>>`.

### Row mapping rules

1. The first row of the Athena `ResultSet` is the header row — use it to extract column names.
2. Column type mapping:
   - `STRING`, `VARCHAR`, `CHAR`, `DATE` → JavaScript/Python `str`
   - `BIGINT`, `INT`, `INTEGER`, `SMALLINT`, `TINYINT` → `int` / `number`
   - `DOUBLE`, `FLOAT`, `DECIMAL` → `float` / `number`
   - Unknown types → `str`
3. Strip `_run_rank` and `run_id` columns unconditionally.
4. `store_reinstall` values remain as strings (`"true"` / `"false"`); do not coerce to boolean.
5. If `rowCount` equals `maxRows`, set `truncated: true`.

---

## Appendix: Allowed Views (v1)

Defined authoritatively in `reporting_policy.json`. Reproduced here for reference:

| View | Source | Key Metrics |
| --- | --- | --- |
| `v_latest_ga4_acquisition_daily` | GA4 | sessions, total_users, conversions, total_revenue |
| `v_latest_ga4_engagement_daily` | GA4 | engagement_rate, bounce_rate |
| `v_latest_appsflyer_installs_daily` | AppsFlyer | installs, media_source, campaign |
| `v_latest_appsflyer_events_daily` | AppsFlyer | event_count, event_revenue, event_name |

`v_latest_appsflyer_retention_daily` is excluded from `allowed_views` in Phase 1 (no data source).
