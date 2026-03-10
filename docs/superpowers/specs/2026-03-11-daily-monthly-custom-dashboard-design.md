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
  → GET /api/reports/{period}?date=...&section=...
  → Decode JWT → extract sub
  → Check S3 cache
      HIT  → return cached SectionResult (with frozen flag computed from date)
      MISS → check frozen condition first
           → if frozen: return { charts:[], tables:[], comment:"", frozen:true }
           → Athena SQL → aggregate data
           → Bedrock: "Summarize these metrics in 2-3 sentences: {data}"
           → Save to S3 (frozen:false at write time)
           → Return result
```

**Weekly (extended precompute):**

```text
precompute_dashboard.py (runs on schedule / manually)
  → SQL queries per WEEKS entry (existing)
  → Group 9 queries into 5 display sections (see Weekly Sections below)
  → Bedrock comment per section (new)
  → Write to frontend/public/dashboard-cache/week={start}_{end}.json
    schema extended: { ...existing, sections: [{ id, title, comment, charts, tables }] }
```

**Custom Dashboard:**

```text
Load pins.json → Pin[] (sectionId, period)
Per period: show picker → on date change:
  → for each pinned sectionId of that period:
      call /api/reports/{period}?date=...&section=...
      → same S3 cache reuse as above
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
  charts: ChartSpec[];
  tables: TableSpec[];
  comment: string;        // LLM-generated 2-3 sentence summary; "" if frozen and not yet generated
  generatedAt: string;    // ISO timestamp of when this was written to S3
}
// Note: `frozen` is NOT stored in S3. It is computed at read time by the API
// based on staleness rules (see Staleness Rules section).
```

### Pin

```typescript
interface Pin {
  sectionId: string;           // e.g. "traffic", "funnel"
  period: "daily" | "weekly" | "monthly";
  title: string;               // display label, e.g. "Traffic Overview"
}
// Uniqueness key: (sectionId, period) composite — no duplicate (sectionId+period) pairs allowed.
```

---

## S3 Storage Layout

All report data uses `SESSION_BUCKET` (existing env var `NEXT_PUBLIC_SESSION_BUCKET` / `SESSION_BUCKET`), same bucket as sessions and bookmarks, different prefix.

```text
reports/{sub}/daily/{date}/{sectionId}.json       # SectionResult (daily)
reports/{sub}/monthly/{yyyy-mm}/{sectionId}.json  # SectionResult (monthly)
reports/{sub}/pins.json                           # Pin[]
```

Weekly results stay in `frontend/public/dashboard-cache/week={start}_{end}.json` (disk, served as Next.js static assets), extended with `comment` field per section group.

---

## Staleness Rules

`frozen` is computed by the API at read time, not stored:

```python
def is_frozen(period: str, date_str: str) -> bool:
    today = date.today()
    if period == "daily":
        d = date.fromisoformat(date_str)           # "2026-03-11"
        return today >= d + timedelta(days=7)
    if period == "monthly":
        # monthEnd = last day of the month
        year, month = map(int, date_str.split("-"))
        month_end = date(year, month, calendar.monthrange(year, month)[1])
        return today >= month_end + timedelta(days=7)
    return False  # weekly: always return cached; no regeneration path
```

| Period | Stale if | Effect |
|--------|----------|--------|
| Daily | `today >= date + 7 days` | MISS → return empty result (no Athena/Bedrock); HIT → return cache + `frozen:true` in response |
| Monthly | `today >= monthEnd + 7 days` | Same |
| Weekly | N/A (precomputed, no on-demand path) | N/A |

The API response includes `frozen: boolean` (computed, not from S3) so the frontend can show the stale indicator.

---

## Sections

### Daily (5 sections)

Filter for all daily queries: `WHERE dt = date '{date}'` (partition-pruning safe)

| sectionId | Title | Queries | Output columns |
|-----------|-------|---------|----------------|
| `traffic` | Traffic Overview | `v_latest_ga4_acquisition_daily` | `channel_group, sessions, conversions, total_revenue` grouped by channel |
| `channel` | Channel Performance | `v_latest_ga4_acquisition_daily` + `v_latest_ga4_engagement_daily` | `channel_group, sessions, engagement_rate` (join on channel_group) |
| `installs` | Install Monitoring | `v_latest_appsflyer_installs_daily` | `media_source, installs` |
| `events` | Event Monitoring | `v_latest_appsflyer_events_daily` | `event_name, event_count, event_revenue` |
| `kpi` | Daily KPI Snapshot | All 4 views (separate queries, combined in response) | `{ total_sessions, total_conversions, total_revenue, total_installs, top_channel, top_media_source }` — one row each from SUM aggregations |

`kpi` runs 4 separate Athena queries and merges results into a single-row summary table:

```sql
-- query 1: ga4 totals
SELECT SUM(sessions) AS total_sessions, SUM(conversions) AS total_conversions,
       SUM(total_revenue) AS total_revenue
FROM v_latest_ga4_acquisition_daily WHERE dt = date '{date}'

-- query 2: appsflyer totals
SELECT SUM(installs) AS total_installs FROM v_latest_appsflyer_installs_daily
WHERE dt = date '{date}'

-- query 3: top channel by sessions
SELECT channel_group AS top_channel FROM v_latest_ga4_acquisition_daily
WHERE dt = date '{date}' ORDER BY sessions DESC LIMIT 1

-- query 4: top media source by installs
SELECT media_source AS top_media_source FROM v_latest_appsflyer_installs_daily
WHERE dt = date '{date}' ORDER BY installs DESC LIMIT 1
```

Result merged into one `TableSpec` row + one `ChartSpec` (bar chart of the 3 numeric KPIs).

### Monthly (6 sections)

Filter for all monthly queries: `WHERE dt >= date '{yyyy-mm}-01' AND dt < date '{yyyy-mm}-01' + interval '1' month` (partition-pruning safe — avoids `DATE_FORMAT` full scan)

| sectionId | Title | Query | Output columns |
|-----------|-------|-------|----------------|
| `revenue` | Channel Revenue Contribution | `v_latest_ga4_acquisition_daily` | `channel_group, SUM(total_revenue)` |
| `campaigns` | Campaign Performance | `v_latest_appsflyer_installs_daily` | `campaign, SUM(installs)` |
| `funnel` | Funnel Analysis | `v_latest_appsflyer_events_daily` | `event_name, SUM(event_count)` ordered by event_count DESC |
| `retention` | Retention Analysis | `v_latest_appsflyer_cohort_daily` | `cohort_day, SUM(retained_users), SUM(cohort_size)` |
| `quality` | User Quality Analysis | `v_latest_appsflyer_installs_daily` + `v_latest_ga4_engagement_daily` | `media_source, installs, avg(engagement_rate)` (separate queries, same response) |
| `product` | Product Impact Analysis | `v_latest_appsflyer_events_daily` + `v_latest_ga4_acquisition_daily` | `event_name, event_count, event_revenue` + `total_revenue` trend by dt |

### Weekly (existing 9 queries, extended with comment)

`precompute_dashboard.py` groups the 9 existing `DASHBOARD_QUERIES` into 5 display sections and generates one Bedrock comment per section:

| Section | Queries included |
|---------|-----------------|
| Acquisition | `sessions`, `trend_sessions` |
| Revenue | `channel_revenue` |
| Installs | `installs`, `campaign_installs`, `trend_installs` |
| Engagement | `engagement` |
| Retention & Funnel | `retention`, `install_funnel` |

Output JSON schema extended:

```json
{
  "week": { "start": "...", "end": "...", "label": "..." },
  "sections": [
    { "id": "acquisition", "title": "Acquisition", "comment": "...", "charts": [...], "tables": [...] }
  ]
}
```

---

## API Routes

### Report Routes

```text
GET /api/reports/daily?date={yyyy-mm-dd}&section={sectionId}
GET /api/reports/monthly?date={yyyy-mm}&section={sectionId}
```

Both routes use `?date=` parameter (consistent naming). Monthly format is `yyyy-mm` (e.g. `2026-03`).

Response shape:

```typescript
{
  result: SectionResult;
  frozen: boolean;   // computed from staleness rules, not stored in S3
}
```

Handler steps (same for both):

1. Decode JWT → extract `sub` (existing auth pattern: decode without signature verification, consistent with `sessionAuth.ts`)
2. Compute `frozen` from staleness rules
3. Check S3 cache (`SESSION_BUCKET`, key `reports/{sub}/{period}/{date}/{sectionId}.json`)
   - HIT → return `{ result: cached, frozen }`
4. If `frozen` → return `{ result: { ...empty, comment:"" }, frozen: true }` (no Athena/Bedrock)
5. Run Athena queries for `sectionId`
6. Call Bedrock comment helper with aggregated rows
7. Write `SectionResult` to S3
8. Return `{ result, frozen: false }`

### Pin Routes

```text
GET    /api/reports/pins
POST   /api/reports/pins          body: { sectionId, period, title }
DELETE /api/reports/pins/[sectionId]/[period]
```

DELETE uses `[sectionId]/[period]` to uniquely identify a pin (composite key). POST deduplicates on `(sectionId, period)` — silently replaces if already exists.

---

## Frontend Components

### New / Modified Files

```text
frontend/src/
├── app/(app)/dashboard/
│   ├── page.tsx                   # MODIFY: add period tab routing (?period=)
│   ├── DailyReport.tsx            # NEW: date picker + ReportSection grid
│   ├── MonthlyReport.tsx          # NEW: month picker + ReportSection grid
│   └── CustomDashboard.tsx        # NEW: 3 period pickers + pinned ReportSection grids
├── components/dashboard/
│   ├── ReportSection.tsx          # NEW: ChartSpec/TableSpec render + comment text + PinButton
│   │                              # Does NOT reuse DashboardCardView (different prop contract)
│   └── PinButton.tsx              # NEW: pin toggle (POST/DELETE /api/reports/pins)
└── hooks/
    └── useReportSection.ts        # NEW: fetch /api/reports/{period}?date=&section=, SWR-style
```

`DashboardCardView` is NOT reused in `ReportSection` — it accepts `WeekRange` props incompatible with daily/monthly context. `ReportSection` renders `ChartSpec[]` and `TableSpec[]` directly using the same underlying chart components.

### Existing Modified Files

- `frontend/src/app/(app)/dashboard/page.tsx` — add tab for daily/monthly/custom
- `frontend/src/components/dashboard/` (weekly chart components) — add `comment` prop rendering
- `backend/scripts/precompute_dashboard.py` — add Bedrock comment generation per section group

---

## Custom Dashboard

- User pins sections from Daily / Weekly / Monthly tabs via `PinButton`
- Custom tab groups pinned sections by period: 日 sections | 週 sections | 月 sections
- Each group has its own date picker (日: date, 週: week selector, 月: month)
- Selecting a date triggers `useReportSection` for each pinned section in that group
- S3 cache is reused where available; a fresh Athena query runs only on cache miss
- No permanent snapshots — the custom dashboard always reflects the selected period's live (or cached) data

---

## Task Breakdown

| Task ID | Title |
|---------|-------|
| DR-01a | Athena section query module — daily sections (traffic, channel, installs, events, kpi) |
| DR-01b | Athena section query module — monthly sections (revenue, campaigns, funnel, retention, quality, product) |
| DR-02 | Bedrock comment helper |
| DR-03 | S3 report cache adapter (SESSION_BUCKET, reports/ prefix) |
| DR-04 | API routes: GET /api/reports/daily + /api/reports/monthly |
| DR-05 | API routes: GET/POST/DELETE /api/reports/pins |
| DR-06 | useReportSection hook + ReportSection component |
| DR-07 | DailyReport + MonthlyReport page components |
| DR-08 | CustomDashboard component + PinButton |
| DR-09 | dashboard/page.tsx tab routing update |
| DR-10 | Extend precompute_dashboard.py with Bedrock comment per section group |
| DR-11 | Weekly frontend: add comment field rendering to existing weekly components |
