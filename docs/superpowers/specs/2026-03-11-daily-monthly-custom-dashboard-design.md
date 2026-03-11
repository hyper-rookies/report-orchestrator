# Daily / Monthly / Custom Dashboard Design

**Date:** 2026-03-11
**Status:** Approved
**Phase:** Phase 2 (Daily + Monthly reports + Custom Dashboard)

---

## Goal

Extend the existing `/dashboard` page with Daily and Monthly report tabs powered by on-demand Athena SQL queries + per-section LLM comments, and add a Custom Dashboard tab where users curate their own view of pinned sections.

---

## Architecture

### Tab Structure

```text
/dashboard?period=weekly    (existing — precomputed static JSON + LLM comment added)
/dashboard?period=daily     (new — date picker + on-demand Athena + Bedrock comment)
/dashboard?period=monthly   (new — month picker + on-demand Athena + Bedrock comment)
/dashboard?period=custom    (new — pinned sections, period-separated pickers)
```

### Data Flow

**Daily / Monthly (on-demand):**

```text
User selects date → useReportSection(period, date, sectionId)
  → GET /api/reports/{period}?date=...&section=...   (Bearer token from fetchAuthSession)
  → Decode JWT → extract sub
  → Compute frozen from staleness rules
  → Check S3 cache (key: reports/{sub}/{period}/{date}/{sectionId}.json)
      HIT  → return { result: cachedSectionResult, frozen }
             (HIT + frozen=true returns REAL data marked stale — NOT empty)
      MISS + frozen=true → return { result: emptySectionResult, frozen: true }
             (no Athena/Bedrock — data window has closed)
      MISS + frozen=false → Athena SQL (concurrent where possible, 30s timeout)
                          → Bedrock comment (Claude Haiku, max 200 tokens)
                          → Save SectionResult to S3
                          → return { result, frozen: false }
```

**Weekly (extended precompute):**

```text
precompute_dashboard.py (runs on schedule / manually)
  → SQL queries per WEEKS entry (existing)
  → Group 9 queries into 5 display sections (see Weekly Sections below)
  → Bedrock comment per section (Claude Haiku, max 200 tokens; "" on failure — non-blocking)
  → Write to frontend/public/dashboard-cache/week={start}_{end}.json
    schema extended: { ...existing, sections: [{ id, title, comment, charts, tables }] }
```

**Custom Dashboard:**

```text
Load pins.json → Pin[] (sectionId, period)
Per period group:
  → daily group:   date picker → for each pinned daily section: call /api/reports/daily?date=&section=
  → weekly group:  WeekSelector (reuses existing manifest.json) → display from static cache
  → monthly group: month picker → for each pinned monthly section: call /api/reports/monthly?date=&section=
  → S3 cache reused where available
```

---

## Data Models

### ChartSpec and TableSpec

`ChartSpec` and `TableSpec` match the existing SSE frame shapes used throughout the app:

```typescript
// matches SseFrame type="chart" payload
interface ChartSpec {
  chartType: "bar" | "line" | "pie" | "scatter" | "table";
  xAxis?: string;
  yAxis?: string[];
  data: Record<string, unknown>[];
  selectionReason?: string;
}

// matches SseFrame type="table" payload
interface TableSpec {
  columns: string[];
  rows: Record<string, unknown>[];
}
```

These are the same structures already rendered by `DashboardCardView` and `AssistantMessage`.

### Section Result (S3 cache)

```typescript
interface SectionResult {
  sectionId: string;
  period: "daily" | "weekly" | "monthly";
  date: string;           // "2026-03-11" (daily) | "2026-W11" (weekly) | "2026-03" (monthly)
  charts: ChartSpec[];    // [] on frozen MISS
  tables: TableSpec[];    // [] on frozen MISS
  comment: string;        // LLM summary; "" on frozen MISS or Bedrock failure
  generatedAt: string;    // ISO timestamp; "" on frozen MISS
}
// `frozen` is NOT stored — computed at read time by API (see Staleness Rules).
// Empty frozen-MISS result: { sectionId, period, date, charts:[], tables:[], comment:"", generatedAt:"" }
```

### Pin

```typescript
interface Pin {
  sectionId: string;           // e.g. "traffic", "funnel"
  period: "daily" | "weekly" | "monthly";
  title: string;               // display label
}
// Uniqueness key: (sectionId, period) composite — no duplicate pairs.
// Max pins: 12 total (across all periods) to bound Athena concurrency.
```

---

## S3 Storage Layout

All report data uses `SESSION_BUCKET` (env var `SESSION_BUCKET` / `NEXT_PUBLIC_SESSION_BUCKET`), same bucket as sessions and bookmarks.

The monthly `date` query param (`2026-03`) maps directly to the S3 path segment — no reformatting needed.

```text
reports/{sub}/daily/{yyyy-mm-dd}/{sectionId}.json    # SectionResult
reports/{sub}/monthly/{yyyy-mm}/{sectionId}.json     # SectionResult  ("2026-03" verbatim from ?date=)
reports/{sub}/pins.json                              # Pin[]
```

Weekly results remain in `frontend/public/dashboard-cache/week={start}_{end}.json` (static Next.js assets).

---

## Staleness Rules

`frozen` is computed by the API at read time, not stored in S3:

```python
import calendar
from datetime import date, timedelta

def is_frozen(period: str, date_str: str) -> bool:
    today = date.today()
    if period == "daily":
        d = date.fromisoformat(date_str)           # "2026-03-11"
        return today >= d + timedelta(days=7)
    if period == "monthly":
        year, month = map(int, date_str.split("-"))
        month_end = date(year, month, calendar.monthrange(year, month)[1])
        return today >= month_end + timedelta(days=7)
    return False  # weekly: static cache, no on-demand path
```

| Period | Stale if | Cache HIT + frozen | Cache MISS + frozen |
| --- | --- | --- | --- |
| Daily | `today >= date + 7 days` | Return real data + `frozen:true` | Return empty result (no Athena/Bedrock) |
| Monthly | `today >= monthEnd + 7 days` | Same | Same |
| Weekly | N/A | N/A | N/A |

Frontend stale indicator is shown when `frozen: true` in API response.

---

## Sections

### Daily (5 sections)

Filter: `WHERE dt = date '{date}'` (partition-pruning safe, Athena `date` literal)

| sectionId | Title | Strategy | Output |
| --- | --- | --- | --- |
| `traffic` | Traffic Overview | 1 query | `channel_group, sessions, conversions, total_revenue` grouped by channel_group |
| `channel` | Channel Performance | 1 JOIN query | `channel_group, sessions, engagement_rate` — LEFT JOIN on channel_group |
| `installs` | Install Monitoring | 1 query | `media_source, installs` |
| `events` | Event Monitoring | 1 query | `event_name, event_count, event_revenue` |
| `kpi` | Daily KPI Snapshot | 4 concurrent queries, merged in Python | Single-row summary table + bar chart |

**`channel` section SQL** (single Athena query, LEFT JOIN):

```sql
SELECT a.channel_group,
       SUM(a.sessions)       AS sessions,
       AVG(e.engagement_rate) AS engagement_rate
FROM   v_latest_ga4_acquisition_daily  a
LEFT JOIN v_latest_ga4_engagement_daily e USING (channel_group, dt)
WHERE  a.dt = date '{date}'
GROUP BY 1
ORDER BY sessions DESC
```

**`kpi` section** — 4 queries run concurrently (asyncio.gather), merged into one TableSpec row:

```sql
-- q1: ga4 totals
SELECT SUM(sessions) AS total_sessions,
       SUM(conversions) AS total_conversions,
       SUM(total_revenue) AS total_revenue
FROM v_latest_ga4_acquisition_daily WHERE dt = date '{date}'

-- q2: appsflyer installs
SELECT SUM(installs) AS total_installs
FROM v_latest_appsflyer_installs_daily WHERE dt = date '{date}'

-- q3: top channel by sessions
SELECT channel_group AS top_channel
FROM v_latest_ga4_acquisition_daily WHERE dt = date '{date}'
ORDER BY sessions DESC LIMIT 1

-- q4: top media source by installs
SELECT media_source AS top_media_source
FROM v_latest_appsflyer_installs_daily WHERE dt = date '{date}'
ORDER BY installs DESC LIMIT 1
```

Python merges q1–q4 into one dict row. Output: 1 `TableSpec` (6 KPI columns) + 1 `ChartSpec` (bar, 3 numeric KPIs).

### Monthly (6 sections)

Filter: `WHERE dt >= date '{yyyy-mm}-01' AND dt < date '{yyyy-mm}-01' + interval '1' month`
(partition-pruning safe — no `DATE_FORMAT`)

| sectionId | Title | Strategy | Output |
| --- | --- | --- | --- |
| `revenue` | Channel Revenue Contribution | 1 query | `channel_group, SUM(total_revenue)` |
| `campaigns` | Campaign Performance | 1 query | `campaign, SUM(installs)` |
| `funnel` | Funnel Analysis | 1 query | `event_name, SUM(event_count)` ORDER BY event_count DESC |
| `retention` | Retention Analysis | 1 query | `cohort_day, SUM(retained_users), SUM(cohort_size)` |
| `quality` | User Quality Analysis | 2 separate queries, 2 ChartSpecs | See below |
| `product` | Product Impact Analysis | 2 separate queries, 2 ChartSpecs | See below |

**`quality` section** — 2 queries, NO join (different grain). Returns 2 separate `ChartSpec` entries in the `charts` array:

```sql
-- chart 1: installs by media source
SELECT media_source, SUM(installs) AS installs
FROM v_latest_appsflyer_installs_daily
WHERE <monthly_filter>
GROUP BY 1 ORDER BY installs DESC

-- chart 2: engagement rate by channel
SELECT channel_group, AVG(engagement_rate) AS engagement_rate
FROM v_latest_ga4_engagement_daily
WHERE <monthly_filter>
GROUP BY 1 ORDER BY engagement_rate DESC
```

Output: `charts: [bar(installs by source), bar(engagement by channel)]`, `tables: []`

**`product` section** — 2 queries, NO join. Returns 2 separate `ChartSpec` entries:

```sql
-- chart 1: event revenue by event name
SELECT event_name, SUM(event_count) AS event_count, SUM(event_revenue) AS event_revenue
FROM v_latest_appsflyer_events_daily
WHERE <monthly_filter>
GROUP BY 1 ORDER BY event_revenue DESC

-- chart 2: daily revenue trend
SELECT dt, SUM(total_revenue) AS total_revenue
FROM v_latest_ga4_acquisition_daily
WHERE <monthly_filter>
GROUP BY 1 ORDER BY dt ASC
```

Output: `charts: [bar(event revenue), line(revenue trend by dt)]`, `tables: []`

### Weekly (existing 9 queries, extended with comment)

`precompute_dashboard.py` groups the 9 `DASHBOARD_QUERIES` into 5 display sections, generates one Bedrock comment per section:

| Section ID | Title | Queries included |
| --- | --- | --- |
| `acquisition` | Acquisition | `sessions`, `trend_sessions` |
| `revenue` | Revenue | `channel_revenue` |
| `installs` | Installs | `installs`, `campaign_installs`, `trend_installs` |
| `engagement` | Engagement | `engagement` |
| `retention` | Retention & Funnel | `retention`, `install_funnel` |

Extended output JSON schema:

```json
{
  "week": { "start": "...", "end": "...", "label": "..." },
  "sections": [
    { "id": "acquisition", "title": "Acquisition", "comment": "...", "charts": [], "tables": [] }
  ]
}
```

**Backward compatibility:** Frontend must treat missing `sections` field or missing `comment` as `""`. Existing pre-computed JSON files without `sections` fall back to the current flat rendering — no re-compute required for old files.

---

## API Routes

### Report Routes

```text
GET /api/reports/daily?date={yyyy-mm-dd}&section={sectionId}
GET /api/reports/monthly?date={yyyy-mm}&section={sectionId}
```

Both use `?date=` (consistent). Monthly value `2026-03` maps verbatim to the S3 path `{yyyy-mm}` segment.

**Auth:** `Authorization: Bearer {idToken}` — caller (`useReportSection`) fetches idToken via `fetchAuthSession()` (same pattern as `useSse.ts`). Route decodes JWT without signature verification (consistent with `sessionAuth.ts`).

**Response (200):**

```typescript
{ result: SectionResult; frozen: boolean }
```

**Error responses:**

| Status | Condition | Body |
| --- | --- | --- |
| 400 | Missing/invalid `date` or `section` param | `{ error: "invalid params" }` |
| 401 | Missing/invalid JWT | `{ error: "unauthorized" }` |
| 408 | Athena query timeout (>30s) | `{ error: "query timeout" }` |
| 500 | Athena or Bedrock failure | `{ error: "internal error" }` |

**Handler steps:**

1. Validate `date` and `section` params → 400 if missing or unrecognized sectionId
2. Decode JWT → extract `sub` → 401 if missing
3. Compute `frozen = is_frozen(period, date)`
4. Check S3 cache (`SESSION_BUCKET`, key `reports/{sub}/{period}/{date}/{sectionId}.json`)
   - HIT → return `{ result: cached, frozen }`
5. If `frozen` → return `{ result: emptySectionResult, frozen: true }` (no Athena/Bedrock)
6. Run Athena queries concurrently (asyncio.gather where multiple queries, 30s per-query timeout) → 408 on timeout
7. Call Bedrock comment helper → `""` on failure (non-blocking, logs warning)
8. Write `SectionResult` to S3
9. Return `{ result, frozen: false }`

### Pin Routes

```text
GET    /api/reports/pins
POST   /api/reports/pins          body: { sectionId, period, title }
DELETE /api/reports/pins/[sectionId]/[period]
```

- DELETE uses `[sectionId]/[period]` composite key
- POST deduplicates on `(sectionId, period)` — replaces if already exists
- POST returns 400 if pin count would exceed 12

---

## Bedrock Comment Helper

- **Model:** `anthropic.claude-haiku-4-5-20251001` (lowest latency, sufficient for 2-3 sentence summary)
- **API:** Bedrock `InvokeModel` (not streaming — comment is short)
- **Prompt template:**

```text
You are a marketing analytics assistant. Summarize the following {period} metrics in 2-3 concise sentences, highlighting the most notable trend or insight.

Data: {json_rows}

Response: (2-3 sentences only, no bullet points)
```

- **Max tokens:** 200
- **Failure behavior:** On any exception, return `""` and log warning. Never block the S3 write or API response.

---

## Frontend Components

### New / Modified Files

```text
frontend/src/
├── app/(app)/dashboard/
│   ├── page.tsx                   # MODIFY: add tab routing for daily/monthly/custom
│   ├── DailyReport.tsx            # NEW: date picker + ReportSection grid (5 sections)
│   ├── MonthlyReport.tsx          # NEW: month picker + ReportSection grid (6 sections)
│   └── CustomDashboard.tsx        # NEW: 3 period groups, each with picker + pinned sections
├── components/dashboard/
│   ├── ReportSection.tsx          # NEW: ChartSpec[]/TableSpec[] render + comment + PinButton
│   │                              # Does NOT reuse DashboardCardView (WeekRange prop incompatibility)
│   └── PinButton.tsx              # NEW: POST/DELETE /api/reports/pins toggle
└── hooks/
    └── useReportSection.ts        # NEW: fetches Bearer token → GET /api/reports/{period}
```

**`useReportSection` auth:** Calls `fetchAuthSession()` to get `idToken`, passes as `Authorization: Bearer`. Same pattern as `useSse.ts`.

**`DashboardCardView` is NOT reused** in `ReportSection` — it accepts `WeekRange` props incompatible with daily/monthly. `ReportSection` renders `ChartSpec[]` and `TableSpec[]` directly using the same underlying chart primitives.

### Existing Modified Files

- `frontend/src/app/(app)/dashboard/page.tsx` — add daily/monthly/custom tabs
- Weekly chart components — add optional `comment?: string` prop (renders below chart; ignored if `""`)
- `backend/scripts/precompute_dashboard.py` — add Bedrock comment per section group

### Custom Dashboard — Weekly Picker

The Custom Dashboard weekly group reuses the existing `WeekSelector` component and fetches `manifest.json` from `/dashboard-cache/manifest.json` (same as the weekly tab). Weekly section data comes from the static cache files, not the API routes.

---

## Custom Dashboard

- User pins sections from Daily / Weekly / Monthly tabs via `PinButton`
- Custom tab groups pinned sections by period (日 | 週 | 月)
- Daily group: date picker → `useReportSection` per pinned section
- Weekly group: `WeekSelector` (existing manifest) → display from static cache
- Monthly group: month picker → `useReportSection` per pinned section
- S3 cache reused where available; fresh query only on cache miss
- Max 12 pins total (enforced on POST)

---

## Task Breakdown

| Task ID | Title |
| --- | --- |
| DR-01a | Athena section query module — daily (traffic, channel, installs, events, kpi) |
| DR-01b | Athena section query module — monthly (revenue, campaigns, funnel, retention, quality, product) |
| DR-02 | Bedrock comment helper (Claude Haiku, InvokeModel, non-blocking) |
| DR-03 | S3 report cache adapter (SESSION_BUCKET, reports/ prefix; extend sessionS3.ts helpers) |
| DR-04 | API routes: GET /api/reports/daily + /api/reports/monthly (with error contract) |
| DR-05 | API routes: GET/POST/DELETE /api/reports/pins (composite key, 12-pin cap) |
| DR-06 | useReportSection hook + ReportSection component (Bearer auth, frozen state) |
| DR-07 | DailyReport + MonthlyReport page components |
| DR-08 | CustomDashboard component + PinButton (weekly uses manifest + static cache) |
| DR-09 | dashboard/page.tsx tab routing update |
| DR-10 | Extend precompute_dashboard.py with Bedrock comment per section group |
| DR-11 | Weekly frontend: add optional comment rendering (backward-compatible, missing=empty) |
