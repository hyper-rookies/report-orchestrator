# Daily / Monthly / Custom Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the dashboard with Daily and Monthly on-demand Athena SQL report tabs (with per-section Bedrock summary comments) and a Custom Dashboard tab where users pin sections and view them by selected period.

**Architecture:** TypeScript Next.js API routes call AWS Athena for SQL queries and Bedrock (Claude Haiku) for 2-3 sentence section comments, cache results in S3 (SESSION_BUCKET, `reports/` prefix). Frontend uses `useReportSection` hook to fetch data, renders via `ReportSection` component, pins sections via `pins.json` in S3. Weekly precompute script is extended with Bedrock comments (Python).

**Tech Stack:** TypeScript/Next.js 14, @aws-sdk/client-athena (new), @aws-sdk/client-bedrock-runtime (new), @aws-sdk/client-s3 (existing), React, TailwindCSS, Lucide icons, AWS Athena, Amazon Bedrock, S3

---

## File Structure

**New files:**

```text
frontend/src/
├── types/report.ts                              # SectionResult, Pin, ChartSpec, TableSpec
├── lib/
│   ├── athenaClient.ts                          # Athena query runner (start + poll + results)
│   ├── bedrockComment.ts                        # Bedrock InvokeModel comment helper
│   ├── reportS3.ts                              # S3 key helpers for reports/ prefix
│   ├── reportStaleness.ts                       # isFrozen() logic
│   ├── reportQueriesDaily.ts                    # Daily section SQL builders + chart converters
│   └── reportQueriesMonthly.ts                  # Monthly section SQL builders + chart converters
├── app/api/reports/
│   ├── daily/route.ts                           # GET /api/reports/daily
│   ├── monthly/route.ts                         # GET /api/reports/monthly
│   └── pins/
│       ├── route.ts                             # GET/POST /api/reports/pins
│       └── [sectionId]/[period]/route.ts        # DELETE /api/reports/pins/[sectionId]/[period]
├── hooks/useReportSection.ts                    # Cache-aware section fetch hook
├── components/dashboard/
│   ├── ReportSection.tsx                        # Chart/table/comment card + PinButton
│   └── PinButton.tsx                            # Pin toggle button
└── app/(app)/dashboard/
    ├── DailyReport.tsx                          # Date picker + 5-section grid
    ├── MonthlyReport.tsx                        # Month picker + 6-section grid
    └── CustomDashboard.tsx                      # Period pickers + pinned sections

backend/services/viz-lambda/tests/ (existing pattern)
backend/scripts/tests/test_precompute_comments.py  # New pytest for DR-10
```

**Modified files:**

```text
frontend/src/app/(app)/dashboard/page.tsx          # Add period tab routing
frontend/src/components/dashboard/                 # Add comment rendering to weekly charts
backend/scripts/precompute_dashboard.py            # Add Bedrock comment generation
```

**New env vars** (add to `.env.local` and document in `.env.example`):

```text
ATHENA_DATABASE=hyper_intern_m1c
ATHENA_WORKGROUP=hyper-intern-m1c-wg
ATHENA_OUTPUT_LOCATION=s3://your-bucket/athena-results/on-demand/
```

(`AWS_REGION` and `SESSION_BUCKET` already exist in frontend env.)

---

## Chunk 1: Types + Athena Client + Daily Queries

### Task 1: Install packages and define shared types

**Files:**
- Create: `frontend/src/types/report.ts`
- Modify: `frontend/package.json` (add AWS SDK packages)

- [ ] **Step 1: Install AWS SDK packages**

```bash
cd frontend
npm install @aws-sdk/client-athena @aws-sdk/client-bedrock-runtime
```

Expected: packages added to `node_modules/`, `package.json` updated.

- [ ] **Step 2: Create `frontend/src/types/report.ts`**

```typescript
// Compatible with ReportBarChart.tsx's ChartSpec interface (series-based, not yAxis).
// chartType is our discriminator; xAxis + series + data are passed directly to chart components.
export interface ChartSpec {
  chartType: "bar" | "line"; // selects rendering component in ReportSection
  title?: string;
  xAxis: string;
  series: Array<{ dataKey: string; label: string }>; // matches ReportBarChart.tsx series format
  data: Record<string, unknown>[];
}

export interface TableSpec {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface SectionResult {
  sectionId: string;
  period: "daily" | "weekly" | "monthly";
  date: string; // "2026-03-11" | "2026-03" | "2026-W11"
  charts: ChartSpec[];
  tables: TableSpec[];
  comment: string; // "" if frozen-miss or Bedrock failed
  generatedAt: string; // ISO timestamp; "" if frozen-miss
}

export interface Pin {
  sectionId: string;
  period: "daily" | "weekly" | "monthly";
  title: string;
}

export interface ReportApiResponse {
  result: SectionResult;
  frozen: boolean;
}

export const EMPTY_SECTION_RESULT = (
  sectionId: string,
  period: SectionResult["period"],
  date: string
): SectionResult => ({
  sectionId,
  period,
  date,
  charts: [],
  tables: [],
  comment: "",
  generatedAt: "",
});

export const MAX_PINS = 12;

export const DAILY_SECTION_IDS = ["traffic", "channel", "installs", "events", "kpi"] as const;
export const MONTHLY_SECTION_IDS = ["revenue", "campaigns", "funnel", "retention", "quality", "product"] as const;

export type DailySectionId = (typeof DAILY_SECTION_IDS)[number];
export type MonthlySectionId = (typeof MONTHLY_SECTION_IDS)[number];
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/report.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(dr): add report types + AWS SDK packages"
```

---

### Task 2: Athena client helper (athenaClient.ts)

**Files:**
- Create: `frontend/src/lib/athenaClient.ts`
- Create: `frontend/src/lib/__tests__/athenaClient.test.ts`

- [ ] **Step 1: Write the failing test for `athenaClient.ts`**

Create `frontend/src/lib/__tests__/athenaClient.test.ts`:

```typescript
// Tests pure helper functions — AWS client is not called in these tests
import { buildAthenaRows } from "../athenaClient";

describe("buildAthenaRows", () => {
  it("converts Athena result set to row dicts", () => {
    const columnInfo = [{ Name: "channel" }, { Name: "sessions" }];
    const rows = [
      { Data: [{ VarCharValue: "channel" }, { VarCharValue: "sessions" }] }, // header row
      { Data: [{ VarCharValue: "Organic" }, { VarCharValue: "1234" }] },
      { Data: [{ VarCharValue: "Paid" }, { VarCharValue: "567" }] },
    ];
    const result = buildAthenaRows(columnInfo, rows);
    expect(result).toEqual([
      { channel: "Organic", sessions: "1234" },
      { channel: "Paid", sessions: "567" },
    ]);
  });

  it("handles missing VarCharValue as empty string", () => {
    const columnInfo = [{ Name: "col" }];
    const rows = [
      { Data: [{ VarCharValue: "col" }] },
      { Data: [{}] },
    ];
    expect(buildAthenaRows(columnInfo, rows)).toEqual([{ col: "" }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend
npx jest src/lib/__tests__/athenaClient.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module '../athenaClient'"

- [ ] **Step 3: Create `frontend/src/lib/athenaClient.ts`**

```typescript
import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
  type ColumnInfo,
  type Row,
} from "@aws-sdk/client-athena";

function getClient(): AthenaClient {
  return new AthenaClient({ region: process.env.AWS_REGION ?? "ap-northeast-2" });
}

// Exported for unit tests
export function buildAthenaRows(
  columnInfo: Pick<ColumnInfo, "Name">[],
  rows: { Data?: { VarCharValue?: string }[] }[]
): Record<string, string>[] {
  const cols = columnInfo.map((c) => c.Name ?? "");
  return rows.slice(1).map((row) =>
    Object.fromEntries(
      cols.map((col, i) => [col, row.Data?.[i]?.VarCharValue ?? ""])
    )
  );
}

export async function runAthenaQuery(
  sql: string,
  timeoutMs = 30_000
): Promise<Record<string, string>[]> {
  const client = getClient();
  const database = process.env.ATHENA_DATABASE;
  const workgroup = process.env.ATHENA_WORKGROUP;
  const outputLocation = process.env.ATHENA_OUTPUT_LOCATION;

  const startResp = await client.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      QueryExecutionContext: database ? { Database: database } : undefined,
      WorkGroup: workgroup,
      ResultConfiguration: outputLocation ? { OutputLocation: outputLocation } : undefined,
    })
  );

  const execId = startResp.QueryExecutionId!;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    if (Date.now() > deadline) throw new Error("ATHENA_TIMEOUT");

    const statusResp = await client.send(
      new GetQueryExecutionCommand({ QueryExecutionId: execId })
    );
    const state = statusResp.QueryExecution?.Status?.State;

    if (state === "SUCCEEDED") break;
    if (state === "FAILED" || state === "CANCELLED") {
      const reason = statusResp.QueryExecution?.Status?.StateChangeReason ?? "no reason";
      throw new Error(`Athena ${state}: ${reason}`);
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  const resultsResp = await client.send(
    new GetQueryResultsCommand({ QueryExecutionId: execId })
  );
  const cols = resultsResp.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
  const rows = resultsResp.ResultSet?.Rows ?? [];
  return buildAthenaRows(cols, rows as Row[]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
npx jest src/lib/__tests__/athenaClient.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/athenaClient.ts frontend/src/lib/__tests__/athenaClient.test.ts
git commit -m "feat(dr): add Athena client helper with row builder"
```

---

### Task 3: Staleness helper (reportStaleness.ts) — DR prerequisite

**Files:**
- Create: `frontend/src/lib/reportStaleness.ts`
- Create: `frontend/src/lib/__tests__/reportStaleness.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/lib/__tests__/reportStaleness.test.ts
import { isFrozen } from "../reportStaleness";

describe("isFrozen", () => {
  it("daily: returns false when today < date + 7", () => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    const dateStr = date.toISOString().slice(0, 10);
    expect(isFrozen("daily", dateStr)).toBe(false);
  });

  it("daily: returns true when today >= date + 7", () => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    const dateStr = date.toISOString().slice(0, 10);
    expect(isFrozen("daily", dateStr)).toBe(true);
  });

  it("monthly: returns false for current month", () => {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(isFrozen("monthly", monthStr)).toBe(false);
  });

  it("monthly: returns true for month ending > 7 days ago", () => {
    // January 2020 ended on 2020-01-31; today is well past that
    expect(isFrozen("monthly", "2020-01")).toBe(true);
  });

  it("weekly: always returns false", () => {
    expect(isFrozen("weekly", "2020-01-01")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend
npx jest src/lib/__tests__/reportStaleness.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Create `frontend/src/lib/reportStaleness.ts`**

```typescript
export function isFrozen(
  period: "daily" | "weekly" | "monthly",
  date: string
): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (period === "daily") {
    const d = new Date(date + "T00:00:00");
    const threshold = new Date(d);
    threshold.setDate(threshold.getDate() + 7);
    return today >= threshold;
  }

  if (period === "monthly") {
    const [year, month] = date.split("-").map(Number);
    // last day of the month: day 0 of next month
    const monthEnd = new Date(year, month, 0);
    const threshold = new Date(monthEnd);
    threshold.setDate(threshold.getDate() + 7);
    return today >= threshold;
  }

  return false;
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend
npx jest src/lib/__tests__/reportStaleness.test.ts --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/reportStaleness.ts frontend/src/lib/__tests__/reportStaleness.test.ts
git commit -m "feat(dr): add staleness helper with date+7 rule"
```

---

### Task 4: Daily section queries (DR-01a)

**Files:**
- Create: `frontend/src/lib/reportQueriesDaily.ts`
- Create: `frontend/src/lib/__tests__/reportQueriesDaily.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/lib/__tests__/reportQueriesDaily.test.ts
import {
  buildDailySql,
  convertDailyRows,
  DAILY_SECTION_TITLES,
} from "../reportQueriesDaily";
import type { SectionResult } from "../../types/report";

describe("buildDailySql", () => {
  it("traffic: generates SQL with daily filter", () => {
    const sql = buildDailySql("traffic", "2026-03-11");
    expect(sql).toContain("v_latest_ga4_acquisition_daily");
    expect(sql).toContain("dt = date '2026-03-11'");
    expect(sql).toContain("channel_group");
  });

  it("channel: uses LEFT JOIN", () => {
    const sql = buildDailySql("channel", "2026-03-11");
    expect(sql.toLowerCase()).toContain("left join");
    expect(sql).toContain("v_latest_ga4_engagement_daily");
  });

  it("kpi: returns array of 4 SQL strings", () => {
    const sqls = buildDailySql("kpi", "2026-03-11");
    expect(Array.isArray(sqls)).toBe(true);
    expect((sqls as string[]).length).toBe(4);
  });

  it("throws on unknown sectionId", () => {
    expect(() => buildDailySql("unknown" as never, "2026-03-11")).toThrow();
  });
});

describe("convertDailyRows", () => {
  it("traffic: returns 1 chart + 1 table", () => {
    const rows = [{ channel_group: "Organic", sessions: "100", conversions: "10", total_revenue: "5000" }];
    const result = convertDailyRows("traffic", [rows]) as Pick<SectionResult, "charts" | "tables">;
    expect(result.charts).toHaveLength(1);
    expect(result.charts[0].chartType).toBe("bar");
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].columns).toContain("channel_group");
  });

  it("kpi: merges 4 query results into 1 table row", () => {
    const inputs = [
      [{ total_sessions: "1000", total_conversions: "50", total_revenue: "9999" }],
      [{ total_installs: "300" }],
      [{ top_channel: "Organic" }],
      [{ top_media_source: "Facebook" }],
    ];
    const result = convertDailyRows("kpi", inputs) as Pick<SectionResult, "charts" | "tables">;
    expect(result.tables[0].rows[0]).toMatchObject({
      total_sessions: "1000",
      total_installs: "300",
      top_channel: "Organic",
    });
    expect(result.charts[0].chartType).toBe("bar");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd frontend
npx jest src/lib/__tests__/reportQueriesDaily.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Create `frontend/src/lib/reportQueriesDaily.ts`**

```typescript
import type { ChartSpec, DailySectionId, TableSpec } from "@/types/report";

const DB = () => process.env.ATHENA_DATABASE ?? "hyper_intern_m1c";
const LIMIT = "LIMIT 500";

function dailyFilter(date: string) {
  return `dt = date '${date}'`;
}

export const DAILY_SECTION_TITLES: Record<DailySectionId, string> = {
  traffic: "Traffic Overview",
  channel: "Channel Performance",
  installs: "Install Monitoring",
  events: "Event Monitoring",
  kpi: "Daily KPI Snapshot",
};

// Returns string for single-query sections, string[] for kpi (4 queries)
export function buildDailySql(
  sectionId: DailySectionId | string,
  date: string
): string | string[] {
  const db = DB();
  const f = dailyFilter(date);

  switch (sectionId as DailySectionId) {
    case "traffic":
      return `SELECT channel_group, SUM(sessions) AS sessions, SUM(conversions) AS conversions, SUM(total_revenue) AS total_revenue FROM ${db}.v_latest_ga4_acquisition_daily WHERE ${f} GROUP BY 1 ORDER BY sessions DESC ${LIMIT}`;

    case "channel":
      // Note: `f` already expands to `dt = date '...'` — no table alias prefix here
      return `SELECT a.channel_group, SUM(a.sessions) AS sessions, AVG(e.engagement_rate) AS engagement_rate FROM ${db}.v_latest_ga4_acquisition_daily a LEFT JOIN ${db}.v_latest_ga4_engagement_daily e USING (channel_group, dt) WHERE ${f} GROUP BY 1 ORDER BY sessions DESC ${LIMIT}`;

    case "installs":
      return `SELECT media_source, SUM(installs) AS installs FROM ${db}.v_latest_appsflyer_installs_daily WHERE ${f} GROUP BY 1 ORDER BY installs DESC ${LIMIT}`;

    case "events":
      return `SELECT event_name, SUM(event_count) AS event_count, SUM(event_revenue) AS event_revenue FROM ${db}.v_latest_appsflyer_events_daily WHERE ${f} GROUP BY 1 ORDER BY event_count DESC ${LIMIT}`;

    case "kpi":
      return [
        `SELECT SUM(sessions) AS total_sessions, SUM(conversions) AS total_conversions, SUM(total_revenue) AS total_revenue FROM ${db}.v_latest_ga4_acquisition_daily WHERE ${f}`,
        `SELECT SUM(installs) AS total_installs FROM ${db}.v_latest_appsflyer_installs_daily WHERE ${f}`,
        `SELECT channel_group AS top_channel FROM ${db}.v_latest_ga4_acquisition_daily WHERE ${f} ORDER BY sessions DESC LIMIT 1`,
        `SELECT media_source AS top_media_source FROM ${db}.v_latest_appsflyer_installs_daily WHERE ${f} ORDER BY installs DESC LIMIT 1`,
      ];

    default:
      throw new Error(`Unknown daily sectionId: ${sectionId}`);
  }
}

function toNumber(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// queryResults: array of row arrays, one per query (kpi has 4, others have 1)
export function convertDailyRows(
  sectionId: DailySectionId | string,
  queryResults: Record<string, string>[][]
): { charts: ChartSpec[]; tables: TableSpec[] } {
  const rows = queryResults[0] ?? [];

  switch (sectionId as DailySectionId) {
    case "traffic": {
      const columns = ["channel_group", "sessions", "conversions", "total_revenue"];
      return {
        charts: [{ chartType: "bar", xAxis: "channel_group", series: [{ dataKey: "sessions", label: "Sessions" }], data: rows }],
        tables: [{ columns, rows }],
      };
    }

    case "channel": {
      const columns = ["channel_group", "sessions", "engagement_rate"];
      return {
        charts: [{
          chartType: "bar",
          xAxis: "channel_group",
          series: [
            { dataKey: "sessions", label: "Sessions" },
            { dataKey: "engagement_rate", label: "Engagement Rate" },
          ],
          data: rows,
        }],
        tables: [{ columns, rows }],
      };
    }

    case "installs": {
      return {
        charts: [{ chartType: "bar", xAxis: "media_source", series: [{ dataKey: "installs", label: "Installs" }], data: rows }],
        tables: [{ columns: ["media_source", "installs"], rows }],
      };
    }

    case "events": {
      return {
        charts: [{ chartType: "bar", xAxis: "event_name", series: [{ dataKey: "event_count", label: "Event Count" }], data: rows }],
        tables: [{ columns: ["event_name", "event_count", "event_revenue"], rows }],
      };
    }

    case "kpi": {
      // Merge 4 result sets into one row
      const merged: Record<string, string> = {
        ...queryResults[0]?.[0],
        ...queryResults[1]?.[0],
        ...queryResults[2]?.[0],
        ...queryResults[3]?.[0],
      };
      const kpiRow = merged;
      const numericKpis = ["total_sessions", "total_conversions", "total_revenue", "total_installs"];
      // Explicit column order — Object.keys() order is non-deterministic for spread merges
      const KPI_COLUMNS = ["total_sessions", "total_conversions", "total_revenue", "total_installs", "top_channel", "top_media_source"];
      return {
        charts: [{
          chartType: "bar",
          xAxis: "metric",
          series: [{ dataKey: "value", label: "Value" }],
          data: numericKpis.map((k) => ({ metric: k, value: toNumber(kpiRow[k] ?? "0") })),
        }],
        tables: [{
          columns: KPI_COLUMNS,
          rows: [kpiRow],
        }],
      };
    }

    default:
      throw new Error(`Unknown daily sectionId: ${sectionId}`);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend
npx jest src/lib/__tests__/reportQueriesDaily.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/reportQueriesDaily.ts frontend/src/lib/__tests__/reportQueriesDaily.test.ts
git commit -m "feat(dr-01a): add daily section SQL builders and row converters"
```

---

## Chunk 2: Monthly Queries + Bedrock + S3 Cache

### Task 5: Monthly section queries (DR-01b)

**Files:**
- Create: `frontend/src/lib/reportQueriesMonthly.ts`
- Create: `frontend/src/lib/__tests__/reportQueriesMonthly.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/lib/__tests__/reportQueriesMonthly.test.ts
import { buildMonthlySql, convertMonthlyRows, MONTHLY_SECTION_TITLES } from "../reportQueriesMonthly";

describe("buildMonthlySql", () => {
  it("revenue: uses partition-pruning filter", () => {
    const sql = buildMonthlySql("revenue", "2026-03");
    expect(sql).toContain("dt >= date '2026-03-01'");
    expect(sql).toContain("interval '1' month");
    expect(sql).toContain("v_latest_ga4_acquisition_daily");
    expect(sql).toContain("total_revenue");
  });

  it("quality: returns array of 2 SQL strings", () => {
    const sqls = buildMonthlySql("quality", "2026-03");
    expect(Array.isArray(sqls)).toBe(true);
    expect((sqls as string[]).length).toBe(2);
  });

  it("product: returns array of 2 SQL strings", () => {
    const sqls = buildMonthlySql("product", "2026-03");
    expect(Array.isArray(sqls)).toBe(true);
    expect((sqls as string[]).length).toBe(2);
  });

  it("throws on unknown sectionId", () => {
    expect(() => buildMonthlySql("unknown" as never, "2026-03")).toThrow();
  });
});

describe("convertMonthlyRows", () => {
  it("revenue: returns 1 bar chart + 1 table", () => {
    const rows = [{ channel_group: "Organic", total_revenue: "5000" }];
    const result = convertMonthlyRows("revenue", [rows]);
    expect(result.charts[0].chartType).toBe("bar");
    expect(result.tables[0].columns).toContain("channel_group");
  });

  it("quality: returns 2 charts, 0 tables", () => {
    const result = convertMonthlyRows("quality", [
      [{ media_source: "Facebook", installs: "100" }],
      [{ channel_group: "Organic", engagement_rate: "0.5" }],
    ]);
    expect(result.charts).toHaveLength(2);
    expect(result.tables).toHaveLength(0);
  });

  it("product: returns 2 charts, 0 tables", () => {
    const result = convertMonthlyRows("product", [
      [{ event_name: "purchase", event_count: "50", event_revenue: "9000" }],
      [{ dt: "2026-03-01", total_revenue: "3000" }],
    ]);
    expect(result.charts).toHaveLength(2);
    expect(result.charts[1].chartType).toBe("line");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd frontend
npx jest src/lib/__tests__/reportQueriesMonthly.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Create `frontend/src/lib/reportQueriesMonthly.ts`**

```typescript
import type { ChartSpec, MonthlySectionId, TableSpec } from "@/types/report";

const DB = () => process.env.ATHENA_DATABASE ?? "hyper_intern_m1c";
const LIMIT = "LIMIT 500";

function monthlyFilter(month: string) {
  // Partition-pruning safe — avoids DATE_FORMAT full scan
  return `dt >= date '${month}-01' AND dt < date '${month}-01' + interval '1' month`;
}

export const MONTHLY_SECTION_TITLES: Record<MonthlySectionId, string> = {
  revenue: "Channel Revenue Contribution",
  campaigns: "Campaign Performance",
  funnel: "Funnel Analysis",
  retention: "Retention Analysis",
  quality: "User Quality Analysis",
  product: "Product Impact Analysis",
};

export function buildMonthlySql(
  sectionId: MonthlySectionId | string,
  month: string
): string | string[] {
  const db = DB();
  const f = monthlyFilter(month);

  switch (sectionId as MonthlySectionId) {
    case "revenue":
      return `SELECT channel_group, SUM(total_revenue) AS total_revenue FROM ${db}.v_latest_ga4_acquisition_daily WHERE ${f} GROUP BY 1 ORDER BY total_revenue DESC ${LIMIT}`;

    case "campaigns":
      return `SELECT campaign, SUM(installs) AS installs FROM ${db}.v_latest_appsflyer_installs_daily WHERE ${f} GROUP BY 1 ORDER BY installs DESC ${LIMIT}`;

    case "funnel":
      return `SELECT event_name, SUM(event_count) AS event_count FROM ${db}.v_latest_appsflyer_events_daily WHERE ${f} GROUP BY 1 ORDER BY event_count DESC ${LIMIT}`;

    case "retention":
      return `SELECT cohort_day, SUM(retained_users) AS retained_users, SUM(cohort_size) AS cohort_size FROM ${db}.v_latest_appsflyer_cohort_daily WHERE ${f} GROUP BY 1 ORDER BY cohort_day ASC ${LIMIT}`;

    case "quality":
      return [
        `SELECT media_source, SUM(installs) AS installs FROM ${db}.v_latest_appsflyer_installs_daily WHERE ${f} GROUP BY 1 ORDER BY installs DESC ${LIMIT}`,
        `SELECT channel_group, AVG(engagement_rate) AS engagement_rate FROM ${db}.v_latest_ga4_engagement_daily WHERE ${f} GROUP BY 1 ORDER BY engagement_rate DESC ${LIMIT}`,
      ];

    case "product":
      return [
        `SELECT event_name, SUM(event_count) AS event_count, SUM(event_revenue) AS event_revenue FROM ${db}.v_latest_appsflyer_events_daily WHERE ${f} GROUP BY 1 ORDER BY event_revenue DESC ${LIMIT}`,
        `SELECT dt, SUM(total_revenue) AS total_revenue FROM ${db}.v_latest_ga4_acquisition_daily WHERE ${f} GROUP BY 1 ORDER BY dt ASC ${LIMIT}`,
      ];

    default:
      throw new Error(`Unknown monthly sectionId: ${sectionId}`);
  }
}

export function convertMonthlyRows(
  sectionId: MonthlySectionId | string,
  queryResults: Record<string, string>[][]
): { charts: ChartSpec[]; tables: TableSpec[] } {
  const rows = queryResults[0] ?? [];

  switch (sectionId as MonthlySectionId) {
    case "revenue":
      return {
        charts: [{ chartType: "bar", xAxis: "channel_group", series: [{ dataKey: "total_revenue", label: "Revenue" }], data: rows }],
        tables: [{ columns: ["channel_group", "total_revenue"], rows }],
      };

    case "campaigns":
      return {
        charts: [{ chartType: "bar", xAxis: "campaign", series: [{ dataKey: "installs", label: "Installs" }], data: rows }],
        tables: [{ columns: ["campaign", "installs"], rows }],
      };

    case "funnel":
      return {
        charts: [{ chartType: "bar", xAxis: "event_name", series: [{ dataKey: "event_count", label: "Event Count" }], data: rows }],
        tables: [{ columns: ["event_name", "event_count"], rows }],
      };

    case "retention":
      return {
        charts: [{
          chartType: "line",
          xAxis: "cohort_day",
          series: [
            { dataKey: "retained_users", label: "Retained Users" },
            { dataKey: "cohort_size", label: "Cohort Size" },
          ],
          data: rows,
        }],
        tables: [{ columns: ["cohort_day", "retained_users", "cohort_size"], rows }],
      };

    case "quality": {
      const installRows = queryResults[0] ?? [];
      const engagementRows = queryResults[1] ?? [];
      return {
        charts: [
          { chartType: "bar", xAxis: "media_source", series: [{ dataKey: "installs", label: "Installs" }], data: installRows },
          { chartType: "bar", xAxis: "channel_group", series: [{ dataKey: "engagement_rate", label: "Engagement Rate" }], data: engagementRows },
        ],
        tables: [],
      };
    }

    case "product": {
      const eventRows = queryResults[0] ?? [];
      const trendRows = queryResults[1] ?? [];
      return {
        charts: [
          { chartType: "bar", xAxis: "event_name", series: [{ dataKey: "event_revenue", label: "Revenue" }], data: eventRows },
          { chartType: "line", xAxis: "dt", series: [{ dataKey: "total_revenue", label: "Revenue" }], data: trendRows },
        ],
        tables: [],
      };
    }

    default:
      throw new Error(`Unknown monthly sectionId: ${sectionId}`);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend
npx jest src/lib/__tests__/reportQueriesMonthly.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/reportQueriesMonthly.ts frontend/src/lib/__tests__/reportQueriesMonthly.test.ts
git commit -m "feat(dr-01b): add monthly section SQL builders and row converters"
```

---

### Task 6: Bedrock comment helper (DR-02)

**Files:**
- Create: `frontend/src/lib/bedrockComment.ts`
- Create: `frontend/src/lib/__tests__/bedrockComment.test.ts`

- [ ] **Step 1: Write the failing test (AWS client mocked — tests the error→"" contract)**

Create `frontend/src/lib/__tests__/bedrockComment.test.ts`:

```typescript
// Tests the non-throwing contract of generateComment using jest.mock to simulate failures.
jest.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockRejectedValue(new Error("network error")),
  })),
  InvokeModelCommand: jest.fn(),
}));

import { generateComment } from "../bedrockComment";

describe("generateComment", () => {
  it("returns empty string when Bedrock client throws", async () => {
    const result = await generateComment("daily", [{ channel: "Organic", sessions: "100" }]);
    expect(result).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend
npx jest src/lib/__tests__/bedrockComment.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module '../bedrockComment'"

- [ ] **Step 3: Create `frontend/src/lib/bedrockComment.ts`**

```typescript
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const MODEL_ID = "anthropic.claude-haiku-4-5-20251001";

interface BedrockMessage {
  content: { text: string }[];
}

export async function generateComment(
  period: string,
  rows: Record<string, unknown>[]
): Promise<string> {
  try {
    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? "ap-northeast-2",
    });

    const prompt =
      `You are a marketing analytics assistant. Summarize the following ${period} metrics ` +
      `in 2-3 concise sentences, highlighting the most notable trend or insight.\n\n` +
      `Data: ${JSON.stringify(rows.slice(0, 20))}\n\n` + // limit to 20 rows for token safety
      `Response: (2-3 sentences only, no bullet points)`;

    const resp = await client.send(
      new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 200,
          messages: [{ role: "user", content: prompt }],
        }),
      })
    );

    const body = JSON.parse(
      new TextDecoder().decode(resp.body)
    ) as BedrockMessage;
    return body.content?.[0]?.text?.trim() ?? "";
  } catch (err) {
    console.warn("[bedrockComment] failed, returning empty:", err);
    return "";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend
npx jest src/lib/__tests__/bedrockComment.test.ts --no-coverage
```

Expected: PASS (1 test — mock throws → returns "")

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/bedrockComment.ts frontend/src/lib/__tests__/bedrockComment.test.ts
git commit -m "feat(dr-02): add Bedrock comment helper (non-blocking, Claude Haiku)"
```

---

### Task 7: S3 cache adapter (DR-03)

**Files:**
- Create: `frontend/src/lib/reportS3.ts`
- Create: `frontend/src/lib/__tests__/reportS3.test.ts`

- [ ] **Step 1: Write the failing tests (pure key logic only)**

```typescript
// frontend/src/lib/__tests__/reportS3.test.ts
import { reportSectionKey, reportPinsKey } from "../reportS3";

describe("reportSectionKey", () => {
  it("builds daily key correctly", () => {
    expect(reportSectionKey("user123", "daily", "2026-03-11", "traffic"))
      .toBe("reports/user123/daily/2026-03-11/traffic.json");
  });

  it("builds monthly key correctly", () => {
    expect(reportSectionKey("user123", "monthly", "2026-03", "funnel"))
      .toBe("reports/user123/monthly/2026-03/funnel.json");
  });
});

describe("reportPinsKey", () => {
  it("builds pins key correctly", () => {
    expect(reportPinsKey("user123"))
      .toBe("reports/user123/pins.json");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd frontend
npx jest src/lib/__tests__/reportS3.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Create `frontend/src/lib/reportS3.ts`**

Re-uses the existing `s3GetJson` and `s3PutJson` from `sessionS3.ts`.

```typescript
import type { Pin, SectionResult } from "@/types/report";
import { s3GetJson, s3PutJson } from "./sessionS3"; // s3Delete not needed — pins use overwrite, not delete

// ── Key builders ──────────────────────────────────────────────────────────────

export function reportSectionKey(
  sub: string,
  period: string,
  date: string,
  sectionId: string
): string {
  return `reports/${sub}/${period}/${date}/${sectionId}.json`;
}

export function reportPinsKey(sub: string): string {
  return `reports/${sub}/pins.json`;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

export async function getCachedSection(
  sub: string,
  period: string,
  date: string,
  sectionId: string
): Promise<SectionResult | null> {
  return s3GetJson<SectionResult>(reportSectionKey(sub, period, date, sectionId));
}

export async function putCachedSection(
  sub: string,
  period: string,
  date: string,
  sectionId: string,
  result: SectionResult
): Promise<void> {
  await s3PutJson(reportSectionKey(sub, period, date, sectionId), result);
}

// ── Pins helpers ──────────────────────────────────────────────────────────────

export async function getPins(sub: string): Promise<Pin[]> {
  return (await s3GetJson<Pin[]>(reportPinsKey(sub))) ?? [];
}

export async function savePins(sub: string, pins: Pin[]): Promise<void> {
  await s3PutJson(reportPinsKey(sub), pins);
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend
npx jest src/lib/__tests__/reportS3.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/reportS3.ts frontend/src/lib/__tests__/reportS3.test.ts
git commit -m "feat(dr-03): add S3 report cache adapter and pin helpers"
```

---

## Chunk 3: API Routes

### Task 8: GET /api/reports/daily route (DR-04 part 1)

**Files:**
- Create: `frontend/src/app/api/reports/daily/route.ts`

- [ ] **Step 1: Create `frontend/src/app/api/reports/daily/route.ts`**

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { getUserSub } from "@/lib/sessionAuth";
import { isFrozen } from "@/lib/reportStaleness";
import { getCachedSection, putCachedSection } from "@/lib/reportS3";
import { runAthenaQuery } from "@/lib/athenaClient";
import { generateComment } from "@/lib/bedrockComment";
import {
  buildDailySql,
  convertDailyRows,
  DAILY_SECTION_TITLES,
} from "@/lib/reportQueriesDaily";
import {
  DAILY_SECTION_IDS,
  EMPTY_SECTION_RESULT,
  type DailySectionId,
  type ReportApiResponse,
} from "@/types/report";

// Extend timeout for Athena queries (up to 60s)
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const date = searchParams.get("date");
  const section = searchParams.get("section") as DailySectionId | null;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid params: date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!section || !(DAILY_SECTION_IDS as readonly string[]).includes(section)) {
    return NextResponse.json(
      { error: `invalid params: section must be one of ${DAILY_SECTION_IDS.join(", ")}` },
      { status: 400 }
    );
  }

  const frozen = isFrozen("daily", date);

  // S3 cache check
  const cached = await getCachedSection(sub, "daily", date, section);
  if (cached) {
    return NextResponse.json({ result: cached, frozen } satisfies ReportApiResponse);
  }

  // Frozen + no cache = return empty
  if (frozen) {
    return NextResponse.json({
      result: EMPTY_SECTION_RESULT(section, "daily", date),
      frozen: true,
    } satisfies ReportApiResponse);
  }

  // Run Athena queries
  try {
    const sqls = buildDailySql(section, date);
    let queryResults: Record<string, string>[][];

    if (Array.isArray(sqls)) {
      // kpi: 4 concurrent queries
      queryResults = await Promise.all(sqls.map((sql) => runAthenaQuery(sql)));
    } else {
      queryResults = [await runAthenaQuery(sqls)];
    }

    const { charts, tables } = convertDailyRows(section, queryResults);
    const allRows = queryResults.flat();
    const comment = await generateComment("daily", allRows);

    const result = {
      sectionId: section,
      period: "daily" as const,
      date,
      charts,
      tables,
      comment,
      generatedAt: new Date().toISOString(),
    };

    await putCachedSection(sub, "daily", date, section, result);
    return NextResponse.json({ result, frozen: false } satisfies ReportApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "ATHENA_TIMEOUT") {
      return NextResponse.json({ error: "query timeout" }, { status: 408 });
    }
    console.error("[reports/daily]", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Test manually**

```bash
cd frontend && npm run dev
# In another terminal:
curl -H "Authorization: Bearer test" \
  "http://localhost:3000/api/reports/daily?date=2026-03-11&section=traffic"
```

Expected (without real AWS): 500 or 401 depending on auth setup. Verify the route compiles with no TypeScript errors.

```bash
npx tsc --noEmit
```

Expected: no errors on the new file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/reports/daily/route.ts
git commit -m "feat(dr-04a): add GET /api/reports/daily route"
```

---

### Task 9: GET /api/reports/monthly route (DR-04 part 2)

**Files:**
- Create: `frontend/src/app/api/reports/monthly/route.ts`

- [ ] **Step 1: Create `frontend/src/app/api/reports/monthly/route.ts`**

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { getUserSub } from "@/lib/sessionAuth";
import { isFrozen } from "@/lib/reportStaleness";
import { getCachedSection, putCachedSection } from "@/lib/reportS3";
import { runAthenaQuery } from "@/lib/athenaClient";
import { generateComment } from "@/lib/bedrockComment";
import {
  buildMonthlySql,
  convertMonthlyRows,
} from "@/lib/reportQueriesMonthly";
import {
  MONTHLY_SECTION_IDS,
  EMPTY_SECTION_RESULT,
  type MonthlySectionId,
  type ReportApiResponse,
} from "@/types/report";

export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const date = searchParams.get("date"); // "2026-03" format for monthly
  const section = searchParams.get("section") as MonthlySectionId | null;

  if (!date || !/^\d{4}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "invalid params: date must be YYYY-MM" },
      { status: 400 }
    );
  }
  if (!section || !(MONTHLY_SECTION_IDS as readonly string[]).includes(section)) {
    return NextResponse.json(
      { error: `invalid params: section must be one of ${MONTHLY_SECTION_IDS.join(", ")}` },
      { status: 400 }
    );
  }

  const frozen = isFrozen("monthly", date);

  const cached = await getCachedSection(sub, "monthly", date, section);
  if (cached) {
    return NextResponse.json({ result: cached, frozen } satisfies ReportApiResponse);
  }

  if (frozen) {
    return NextResponse.json({
      result: EMPTY_SECTION_RESULT(section, "monthly", date),
      frozen: true,
    } satisfies ReportApiResponse);
  }

  try {
    const sqls = buildMonthlySql(section, date);
    let queryResults: Record<string, string>[][];

    if (Array.isArray(sqls)) {
      queryResults = await Promise.all(sqls.map((sql) => runAthenaQuery(sql)));
    } else {
      queryResults = [await runAthenaQuery(sqls)];
    }

    const { charts, tables } = convertMonthlyRows(section, queryResults);
    const comment = await generateComment("monthly", queryResults.flat());

    const result = {
      sectionId: section,
      period: "monthly" as const,
      date,
      charts,
      tables,
      comment,
      generatedAt: new Date().toISOString(),
    };

    await putCachedSection(sub, "monthly", date, section, result);
    return NextResponse.json({ result, frozen: false } satisfies ReportApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "ATHENA_TIMEOUT") {
      return NextResponse.json({ error: "query timeout" }, { status: 408 });
    }
    console.error("[reports/monthly]", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/reports/monthly/route.ts
git commit -m "feat(dr-04b): add GET /api/reports/monthly route"
```

---

### Task 10: Pins API routes (DR-05)

**Files:**
- Create: `frontend/src/app/api/reports/pins/route.ts`
- Create: `frontend/src/app/api/reports/pins/[sectionId]/[period]/route.ts`

- [ ] **Step 1: Create `frontend/src/app/api/reports/pins/route.ts`**

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { getUserSub } from "@/lib/sessionAuth";
import { getPins, savePins } from "@/lib/reportS3";
import { type Pin, MAX_PINS } from "@/types/report";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pins = await getPins(sub);
  return NextResponse.json(pins);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { sectionId, period, title } = body as Partial<Pin>;
  if (
    typeof sectionId !== "string" ||
    !["daily", "weekly", "monthly"].includes(period ?? "") ||
    typeof title !== "string"
  ) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }

  const pins = await getPins(sub);

  // Check cap (excluding the existing pin with same key if it exists)
  const existing = pins.filter(
    (p) => !(p.sectionId === sectionId && p.period === period)
  );
  if (existing.length >= MAX_PINS) {
    return NextResponse.json({ error: `pin limit reached (max ${MAX_PINS})` }, { status: 400 });
  }

  // Upsert: remove existing with same composite key, then append
  const updated: Pin[] = [...existing, { sectionId, period: period!, title }];
  await savePins(sub, updated);
  return NextResponse.json({ sectionId, period, title });
}
```

- [ ] **Step 2: Create `frontend/src/app/api/reports/pins/[sectionId]/[period]/route.ts`**

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { getUserSub } from "@/lib/sessionAuth";
import { getPins, savePins } from "@/lib/reportS3";

interface Params {
  params: { sectionId: string; period: string };
}

export async function DELETE(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { sectionId, period } = params;
  if (!["daily", "weekly", "monthly"].includes(period)) {
    return NextResponse.json({ error: "invalid period" }, { status: 400 });
  }

  const pins = await getPins(sub);
  const updated = pins.filter(
    (p) => !(p.sectionId === sectionId && p.period === period)
  );
  await savePins(sub, updated);
  return NextResponse.json({ deleted: true });
}
```

- [ ] **Step 3: TypeScript check + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/src/app/api/reports/pins/
git commit -m "feat(dr-05): add GET/POST /api/reports/pins and DELETE by sectionId/period"
```

---

## Chunk 4: Frontend Core

### Task 11: useReportSection hook (DR-06 part 1)

**Files:**
- Create: `frontend/src/hooks/useReportSection.ts`

- [ ] **Step 1: Create `frontend/src/hooks/useReportSection.ts`**

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import type { ReportApiResponse, SectionResult } from "@/types/report";
import { EMPTY_SECTION_RESULT } from "@/types/report";

const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

async function getIdToken(): Promise<string | null> {
  if (USE_MOCK_AUTH) return null;
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

interface UseReportSectionState {
  result: SectionResult | null;
  frozen: boolean;
  loading: boolean;
  error: string | null;
}

export function useReportSection(
  period: "daily" | "monthly",
  date: string | null,
  sectionId: string | null
): UseReportSectionState {
  const [state, setState] = useState<UseReportSectionState>({
    result: null,
    frozen: false,
    loading: false,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const fetch_ = useCallback(
    async (period_: string, date_: string, sectionId_: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ result: null, frozen: false, loading: true, error: null });

      const idToken = await getIdToken();
      const headers: Record<string, string> = {};
      if (idToken) headers.Authorization = `Bearer ${idToken}`;

      try {
        const res = await fetch(
          `/api/reports/${period_}?date=${date_}&section=${sectionId_}`,
          { headers, signal: controller.signal }
        );

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        const data = (await res.json()) as ReportApiResponse;
        setState({ result: data.result, frozen: data.frozen, loading: false, error: null });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: (err as Error).message,
        }));
      }
    },
    []
  );

  useEffect(() => {
    if (!date || !sectionId) {
      setState({ result: null, frozen: false, loading: false, error: null });
      return;
    }
    void fetch_(period, date, sectionId);
    return () => abortRef.current?.abort();
  }, [period, date, sectionId, fetch_]);

  return state;
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useReportSection.ts
git commit -m "feat(dr-06a): add useReportSection hook with Bearer auth + abort"
```

---

### Task 12: PinButton component (DR-06 part 2)

**Files:**
- Create: `frontend/src/components/dashboard/PinButton.tsx`

- [ ] **Step 1: Create `frontend/src/components/dashboard/PinButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { fetchAuthSession } from "aws-amplify/auth";
import { Button } from "@/components/ui/button";
import type { Pin } from "@/types/report";

const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

async function getIdToken(): Promise<string | null> {
  if (USE_MOCK_AUTH) return null;
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

interface PinButtonProps {
  sectionId: string;
  period: "daily" | "weekly" | "monthly";
  title: string;
  initialPinned?: boolean;
}

export default function PinButton({
  sectionId,
  period,
  title,
  initialPinned = false,
}: PinButtonProps) {
  const [pinned, setPinned] = useState(initialPinned);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    const idToken = await getIdToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (idToken) headers.Authorization = `Bearer ${idToken}`;

    try {
      if (pinned) {
        await fetch(`/api/reports/pins/${sectionId}/${period}`, {
          method: "DELETE",
          headers,
        });
        setPinned(false);
      } else {
        const res = await fetch("/api/reports/pins", {
          method: "POST",
          headers,
          body: JSON.stringify({ sectionId, period, title } satisfies Pin),
        });
        if (res.ok) setPinned(true);
      }
    } catch {
      // Silent fail — pin toggle is non-critical
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={toggle}
      disabled={loading}
      title={pinned ? "커스텀 대시보드에서 제거" : "커스텀 대시보드에 핀"}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : pinned ? (
        <BookmarkCheck className="h-3 w-3 text-primary" />
      ) : (
        <Bookmark className="h-3 w-3" />
      )}
    </Button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/dashboard/PinButton.tsx
git commit -m "feat(dr-06b): add PinButton component with POST/DELETE toggle"
```

---

### Task 12a: ReportLineChart component (new — required by ReportSection)

**Files:**

- Create: `frontend/src/components/report/ReportLineChart.tsx`

`ReportBarChart.tsx` already exists (uses `series`-based ChartSpec). We need a matching `ReportLineChart.tsx` for line charts. `TrendLineChart.tsx` has fixed props and cannot be reused.

- [ ] **Step 1: Create `frontend/src/components/report/ReportLineChart.tsx`**

Model it on `TrendLineChart.tsx` but accept our generic `ChartSpec`:

```tsx
"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
// chartTheme.ts lives in components/dashboard/ — import with relative path from components/report/
import {
  CHART_AXIS_LINE_STYLE,
  CHART_GRID_STROKE,
  CHART_LEGEND_STYLE,
  CHART_TEXT_COLOR,
  CHART_TICK_LINE_STYLE,
  CHART_TICK_STYLE,
  CHART_TOOLTIP_STYLE,
} from "../dashboard/chartTheme";
import type { ChartSpec } from "@/types/report";

// Generic series colors — cycle through these for multiple series
const SERIES_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed"];

interface Props {
  spec: ChartSpec;
}

export default function ReportLineChart({ spec }: Props) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={spec.data} margin={{ top: 6, right: 12, left: 0, bottom: 6 }}>
        <CartesianGrid strokeDasharray="4 4" stroke={CHART_GRID_STROKE} />
        <XAxis
          dataKey={spec.xAxis}
          tick={CHART_TICK_STYLE}
          tickLine={CHART_TICK_LINE_STYLE}
          axisLine={CHART_AXIS_LINE_STYLE}
          tickMargin={8}
        />
        <YAxis
          tick={CHART_TICK_STYLE}
          tickLine={CHART_TICK_LINE_STYLE}
          axisLine={CHART_AXIS_LINE_STYLE}
          tickMargin={8}
        />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend
          wrapperStyle={CHART_LEGEND_STYLE}
          formatter={(value) => <span style={{ color: CHART_TEXT_COLOR }}>{value}</span>}
        />
        {spec.series.map((s, i) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.label}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2.5}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors on the new file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/report/ReportLineChart.tsx
git commit -m "feat(dr): add generic ReportLineChart component for series-based ChartSpec"
```

---

### Task 13: ReportSection component (DR-06 part 3)

**Files:**
- Create: `frontend/src/components/dashboard/ReportSection.tsx`

This component renders a single section result (charts + tables + comment + pin button). It does NOT use `DashboardCardView` (incompatible WeekRange prop).

- [ ] **Step 1: Create `frontend/src/components/dashboard/ReportSection.tsx`**

```tsx
"use client";

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import PinButton from "./PinButton";
import type { SectionResult } from "@/types/report";

// Reuse existing chart primitives. ReportBarChart already exists; ReportLineChart created in Task 12a.
import ReportBarChart from "@/components/report/ReportBarChart";
import ReportLineChart from "@/components/report/ReportLineChart";
// DataTable auto-generates columns from Object.keys(rows[0]) — accepts rows directly, no ExcelColumn[] needed
import DataTable from "@/components/report/DataTable";

interface ReportSectionProps {
  title: string;
  result: SectionResult | null;
  frozen?: boolean;
  loading?: boolean;
  showPin?: boolean;
}

export default function ReportSection({
  title,
  result,
  frozen = false,
  loading = false,
  showPin = true,
}: ReportSectionProps) {
  const [view, setView] = useState<"chart" | "table">("chart");

  const charts = result?.charts ?? [];
  const tables = result?.tables ?? [];
  const comment = result?.comment ?? "";
  const hasData = charts.length > 0 || tables.length > 0;

  return (
    <Card className="nhn-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {title}
          {frozen && (
            <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">
              데이터 확정
            </span>
          )}
        </CardTitle>
        <CardAction className="flex items-center gap-2">
          {hasData && (
            <div className="inline-flex items-center rounded-md border border-input/80 bg-background p-0.5 shadow-xs">
              <Button
                type="button"
                variant={view === "chart" ? "secondary" : "ghost"}
                size="xs"
                className="rounded-sm"
                onClick={() => setView("chart")}
                disabled={loading || charts.length === 0}
              >
                <BarChart3 className="h-3 w-3" />
                Chart
              </Button>
              <Button
                type="button"
                variant={view === "table" ? "secondary" : "ghost"}
                size="xs"
                className="rounded-sm"
                onClick={() => setView("table")}
                disabled={loading || tables.length === 0}
              >
                <Table2 className="h-3 w-3" />
                Table
              </Button>
            </div>
          )}
          {showPin && result && (
            <PinButton
              sectionId={result.sectionId}
              period={result.period}
              title={title}
            />
          )}
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          <div className="h-[240px] animate-pulse rounded-lg bg-muted" />
        ) : !hasData ? (
          <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
        ) : view === "chart" ? (
          <div className="space-y-4">
            {charts.map((chart, i) =>
              chart.chartType === "line" ? (
                <ReportLineChart key={i} spec={chart} />
              ) : (
                <ReportBarChart key={i} spec={chart} />
              )
            )}
          </div>
        ) : tables[0] ? (
          // DataTable accepts rows directly; auto-generates columns from Object.keys(rows[0])
          <DataTable rows={tables[0].rows} />
        ) : null}

        {comment && (
          <p className="border-t pt-2 text-xs text-muted-foreground">{comment}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

**Note:** `ReportBarChart.tsx` exists at `frontend/src/components/report/ReportBarChart.tsx` (confirmed). `ReportLineChart.tsx` was created in Task 12a. Both accept `series`-based ChartSpec.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Fix any import path errors based on actual component locations.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/ReportSection.tsx
git commit -m "feat(dr-06c): add ReportSection card with chart/table/comment/pin"
```

---

### Task 14: DailyReport + MonthlyReport pages (DR-07)

**Files:**
- Create: `frontend/src/app/(app)/dashboard/DailyReport.tsx`
- Create: `frontend/src/app/(app)/dashboard/MonthlyReport.tsx`

- [ ] **Step 1: Create `frontend/src/app/(app)/dashboard/DailyReport.tsx`**

```tsx
"use client";

import { useState } from "react";
import ReportSection from "@/components/dashboard/ReportSection";
import { useReportSection } from "@/hooks/useReportSection";
import { DAILY_SECTION_TITLES } from "@/lib/reportQueriesDaily";
import { DAILY_SECTION_IDS } from "@/types/report"; // DAILY_SECTION_IDS is defined in types/report, not reportQueriesDaily
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Today's date in YYYY-MM-DD
function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyReport() {
  const [date, setDate] = useState(todayString);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          type="date"
          value={date}
          max={todayString()}
          onChange={(e) => setDate(e.target.value)}
          className="w-48"
        />
        <span className="text-sm text-muted-foreground">일간 리포트</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {DAILY_SECTION_IDS.map((sectionId) => (
          <DailySectionCard key={sectionId} date={date} sectionId={sectionId} />
        ))}
      </div>
    </div>
  );
}

function DailySectionCard({
  date,
  sectionId,
}: {
  date: string;
  sectionId: (typeof DAILY_SECTION_IDS)[number];
}) {
  const { result, frozen, loading, error } = useReportSection("daily", date, sectionId);

  return (
    <ReportSection
      title={DAILY_SECTION_TITLES[sectionId]}
      result={result}
      frozen={frozen}
      loading={loading}
    />
  );
}
```

- [ ] **Step 2: Create `frontend/src/app/(app)/dashboard/MonthlyReport.tsx`**

```tsx
"use client";

import { useState } from "react";
import ReportSection from "@/components/dashboard/ReportSection";
import { useReportSection } from "@/hooks/useReportSection";
import { MONTHLY_SECTION_TITLES } from "@/lib/reportQueriesMonthly";
import { MONTHLY_SECTION_IDS } from "@/types/report"; // MONTHLY_SECTION_IDS is defined in types/report, not reportQueriesMonthly
import { Input } from "@/components/ui/input";

function currentMonthString(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

export default function MonthlyReport() {
  const [month, setMonth] = useState(currentMonthString);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          type="month"
          value={month}
          max={currentMonthString()}
          onChange={(e) => setMonth(e.target.value)}
          className="w-48"
        />
        <span className="text-sm text-muted-foreground">월간 리포트</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {MONTHLY_SECTION_IDS.map((sectionId) => (
          <MonthlySectionCard key={sectionId} month={month} sectionId={sectionId} />
        ))}
      </div>
    </div>
  );
}

function MonthlySectionCard({
  month,
  sectionId,
}: {
  month: string;
  sectionId: (typeof MONTHLY_SECTION_IDS)[number];
}) {
  const { result, frozen, loading } = useReportSection("monthly", month, sectionId);

  return (
    <ReportSection
      title={MONTHLY_SECTION_TITLES[sectionId]}
      result={result}
      frozen={frozen}
      loading={loading}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/(app)/dashboard/DailyReport.tsx frontend/src/app/(app)/dashboard/MonthlyReport.tsx
git commit -m "feat(dr-07): add DailyReport and MonthlyReport page components"
```

---

### Task 15: CustomDashboard component (DR-08)

**Files:**
- Create: `frontend/src/app/(app)/dashboard/CustomDashboard.tsx`

- [ ] **Step 1: Create `frontend/src/app/(app)/dashboard/CustomDashboard.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import ReportSection from "@/components/dashboard/ReportSection";
import { useReportSection } from "@/hooks/useReportSection";
import { DAILY_SECTION_TITLES } from "@/lib/reportQueriesDaily";
import { MONTHLY_SECTION_TITLES } from "@/lib/reportQueriesMonthly";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Pin } from "@/types/report";

const USE_MOCK_AUTH = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

async function fetchPins(): Promise<Pin[]> {
  try {
    const session = USE_MOCK_AUTH ? null : await fetchAuthSession().catch(() => null);
    const idToken = session?.tokens?.idToken?.toString();
    const headers: Record<string, string> = {};
    if (idToken) headers.Authorization = `Bearer ${idToken}`;
    const res = await fetch("/api/reports/pins", { headers });
    if (!res.ok) return [];
    return (await res.json()) as Pin[];
  } catch {
    return [];
  }
}

function todayString() { return new Date().toISOString().slice(0, 10); }
function currentMonthString() { return new Date().toISOString().slice(0, 7); }

export default function CustomDashboard() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [dailyDate, setDailyDate] = useState(todayString);
  const [monthlyMonth, setMonthlyMonth] = useState(currentMonthString);
  const [weeklyIndex, setWeeklyIndex] = useState(0);
  const [weeks, setWeeks] = useState<{ start: string; end: string; label: string }[]>([]);

  useEffect(() => {
    void fetchPins().then(setPins);
    // Load weekly manifest for week selector
    fetch("/dashboard-cache/manifest.json")
      .then((r) => r.json())
      .then((data: unknown) => {
        const w = data as { start: string; end: string; label: string }[];
        setWeeks(w);
        setWeeklyIndex(Math.max(0, w.length - 2));
      })
      .catch(() => {});
  }, []);

  const dailyPins = pins.filter((p) => p.period === "daily");
  const weeklyPins = pins.filter((p) => p.period === "weekly");
  const monthlyPins = pins.filter((p) => p.period === "monthly");

  if (pins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">핀된 섹션이 없습니다.</p>
        <p className="text-xs mt-1">일간 / 주간 / 월간 리포트에서 섹션을 핀해보세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Daily pinned sections */}
      {dailyPins.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-3">
            <h3 className="text-sm font-semibold">일간</h3>
            <Input
              type="date"
              value={dailyDate}
              max={todayString()}
              onChange={(e) => setDailyDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {dailyPins.map((pin) => (
              <PinnedDailySection key={pin.sectionId} pin={pin} date={dailyDate} />
            ))}
          </div>
        </section>
      )}

      {/* Weekly pinned sections — from static cache JSON */}
      {weeklyPins.length > 0 && weeks.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-3">
            <h3 className="text-sm font-semibold">주간</h3>
            <select
              value={weeklyIndex}
              onChange={(e) => setWeeklyIndex(Number(e.target.value))}
              className="rounded border border-input px-2 py-1 text-sm"
            >
              {weeks.map((w, i) => (
                <option key={w.start} value={i}>{w.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {weeklyPins.map((pin) => (
              <PinnedWeeklySection
                key={pin.sectionId}
                pin={pin}
                week={weeks[weeklyIndex]}
              />
            ))}
          </div>
        </section>
      )}

      {/* Monthly pinned sections */}
      {monthlyPins.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-3">
            <h3 className="text-sm font-semibold">월간</h3>
            <Input
              type="month"
              value={monthlyMonth}
              max={currentMonthString()}
              onChange={(e) => setMonthlyMonth(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {monthlyPins.map((pin) => (
              <PinnedMonthlySection key={pin.sectionId} pin={pin} month={monthlyMonth} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PinnedDailySection({ pin, date }: { pin: Pin; date: string }) {
  const { result, frozen, loading } = useReportSection("daily", date, pin.sectionId);
  const title = DAILY_SECTION_TITLES[pin.sectionId as keyof typeof DAILY_SECTION_TITLES] ?? pin.title;
  return <ReportSection title={title} result={result} frozen={frozen} loading={loading} />;
}

function PinnedMonthlySection({ pin, month }: { pin: Pin; month: string }) {
  const { result, frozen, loading } = useReportSection("monthly", month, pin.sectionId);
  const title = MONTHLY_SECTION_TITLES[pin.sectionId as keyof typeof MONTHLY_SECTION_TITLES] ?? pin.title;
  return <ReportSection title={title} result={result} frozen={frozen} loading={loading} />;
}

// Weekly uses static cache — loads the week JSON, extracts section comment from `sections` array
function PinnedWeeklySection({
  pin,
  week,
}: {
  pin: Pin;
  week: { start: string; end: string; label: string } | undefined;
}) {
  const [comment, setComment] = useState<string | null>(null);

  useEffect(() => {
    if (!week?.start) return;
    setComment(null);
    fetch(`/dashboard-cache/week=${week.start}_${week.end}.json`)
      .then((r) => r.json())
      .then((data: unknown) => {
        const d = data as { sections?: { id: string; comment: string }[] };
        const section = d.sections?.find((s) => s.id === pin.sectionId);
        setComment(section?.comment ?? "");
      })
      .catch(() => setComment(""));
  }, [pin.sectionId, week?.start, week?.end]);

  return (
    <Card className="nhn-panel">
      <CardHeader>
        <CardTitle className="text-sm font-medium">{pin.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {comment === null ? (
          <div className="h-12 animate-pulse rounded bg-muted" />
        ) : (
          <p className="text-xs text-muted-foreground">
            {comment || "주간 대시보드에서 상세 차트를 확인하세요."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: TypeScript check + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/src/app/(app)/dashboard/CustomDashboard.tsx
git commit -m "feat(dr-08): add CustomDashboard with period pickers + pinned sections"
```

---

## Chunk 5: Dashboard Routing + Weekly Extension

### Task 16: dashboard/page.tsx tab routing (DR-09)

**Files:**

- Modify: `frontend/src/app/(app)/dashboard/page.tsx`

The current `page.tsx` (`frontend/src/app/(app)/dashboard/page.tsx`) is 264 lines and renders only the weekly dashboard. It uses `useEffect` + `useState` for `weeks`/`selectedWeekIndex`, `useDashboardCache`, and renders a grid of `DashboardCardView` components. The full file was confirmed at repository read time.

- [ ] **Step 1: Add new imports at the top of `frontend/src/app/(app)/dashboard/page.tsx`**

After the existing `"use client";` line, add:

```typescript
import { useSearchParams, useRouter } from "next/navigation";
import DailyReport from "./DailyReport";
import MonthlyReport from "./MonthlyReport";
import CustomDashboard from "./CustomDashboard";
```

Keep all existing imports unchanged.

- [ ] **Step 2: Extract weekly content + add period tabs**

Replace the `export default function DashboardPage()` body as follows. The key changes are:

1. Read `?period` from URL (default `"weekly"`)
2. Add a tab bar at the top
3. Wrap all existing weekly JSX in a `WeeklyContent` sub-component (defined at the bottom of the file)
4. Route non-weekly periods to their components

Replace the function signature and return statement only — keep all existing state and derived values:

```typescript
export default function DashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const period = searchParams.get("period") ?? "weekly";

  // Existing state — unchanged
  const [weeks, setWeeks] = useState<WeekRange[]>([]);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);

  useEffect(() => {
    fetch("/dashboard-cache/manifest.json")
      .then((response) => response.json() as Promise<WeekRange[]>)
      .then((data) => {
        setWeeks(data);
        setSelectedWeekIndex(Math.max(0, data.length - 2));
      });
  }, []);

  const TABS = [
    { id: "weekly", label: "주간" },
    { id: "daily", label: "일간" },
    { id: "monthly", label: "월간" },
    { id: "custom", label: "커스텀" },
  ] as const;

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-6 py-8">
      {/* Period tab bar */}
      <div className="flex gap-1 rounded-lg border border-input/60 bg-muted/30 p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => router.push(`/dashboard?period=${tab.id}`)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              period === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {period === "weekly" && (
        <WeeklyContent
          weeks={weeks}
          selectedWeekIndex={selectedWeekIndex}
          setSelectedWeekIndex={setSelectedWeekIndex}
        />
      )}
      {period === "daily" && <DailyReport />}
      {period === "monthly" && <MonthlyReport />}
      {period === "custom" && <CustomDashboard />}
    </div>
  );
}
```

- [ ] **Step 3: Add `WeeklyContent` sub-component at the bottom of `page.tsx`**

Move all the existing JSX from inside `DashboardPage` (the `<div id="dashboard-content">` block, `kpis` array, `renderCardAction`, formatting helpers) into a new `WeeklyContent` function at the bottom of the file:

```typescript
interface WeeklyContentProps {
  weeks: WeekRange[];
  selectedWeekIndex: number;
  setSelectedWeekIndex: (i: number) => void;
}

function WeeklyContent({ weeks, selectedWeekIndex, setSelectedWeekIndex }: WeeklyContentProps) {
  const selectedRange = weeks[selectedWeekIndex] ?? { start: "", end: "", label: "" };
  const dashboardData = useDashboardCache(selectedRange);
  const {
    totalSessions,
    totalInstalls,
    avgEngagementRate,
    kpiComparison,
    channelShare,
    conversionByChannel,
    channelRevenue,
    campaignInstalls,
    installFunnel,
    retention,
    trend,
    loading,
    error,
  } = dashboardData;
  const cardExports = buildDashboardCardExports(dashboardData);

  const renderCardAction = (config: DashboardCardExportConfig) => (
    <CardActionMenu
      title={config.title}
      selectedRange={selectedRange}
      unit={config.unit}
      columns={config.columns}
      rows={config.rows}
      disabled={loading || !selectedRange.start}
    />
  );

  const kpis: Array<{ kpi: DashboardKpi; actionSlot: ReactNode }> = [
    {
      kpi: {
        label: cardExports.totalSessions.title,
        value: totalSessions !== null ? formatInt(totalSessions) : "Data unavailable",
        currentValue: kpiComparison.totalSessions.currentValue,
        previousValue: kpiComparison.totalSessions.previousValue,
        deltaPercent: kpiComparison.totalSessions.deltaPercent,
      },
      actionSlot: renderCardAction(cardExports.totalSessions),
    },
    {
      kpi: {
        label: cardExports.totalInstalls.title,
        value: totalInstalls !== null ? formatInt(totalInstalls) : "Data unavailable",
        currentValue: kpiComparison.totalInstalls.currentValue,
        previousValue: kpiComparison.totalInstalls.previousValue,
        deltaPercent: kpiComparison.totalInstalls.deltaPercent,
      },
      actionSlot: renderCardAction(cardExports.totalInstalls),
    },
    {
      kpi: {
        label: cardExports.avgEngagementRate.title,
        value: avgEngagementRate !== null ? formatRate(avgEngagementRate) : "Data unavailable",
        currentValue: kpiComparison.avgEngagementRate.currentValue,
        previousValue: kpiComparison.avgEngagementRate.previousValue,
        deltaPercent: kpiComparison.avgEngagementRate.deltaPercent,
      },
      actionSlot: renderCardAction(cardExports.avgEngagementRate),
    },
  ];

  // All the existing JSX from the original DashboardPage return
  return (
    <div id="dashboard-content" className="mx-auto w-full max-w-6xl space-y-6">
      {/* ... paste all the existing DashboardPage JSX here verbatim, starting from:
          <div className="nhn-panel space-y-2 px-6 py-5"> ... </div>
          through the final </div> closing tag at the end of the grid sections */}
    </div>
  );
}
```

**Important:** Copy-paste the full existing JSX from `DashboardPage` into `WeeklyContent` verbatim — do not rewrite it. Move `useDashboardCache`, `buildDashboardCardExports`, `renderCardAction`, `kpis`, and the entire return JSX into `WeeklyContent`. The `formatInt` and `formatRate` helpers stay at file scope.

- [ ] **Step 4: TypeScript check + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/src/app/(app)/dashboard/page.tsx
git commit -m "feat(dr-09): add daily/monthly/custom tabs to dashboard page"
```

---

### Task 17: Extend precompute_dashboard.py with Bedrock comments (DR-10)

**Files:**
- Modify: `backend/scripts/precompute_dashboard.py`
- Create: `backend/scripts/tests/test_precompute_comments.py`

- [ ] **Step 1: Write the failing pytest**

```python
# backend/scripts/tests/test_precompute_comments.py
import json
import pytest
from unittest.mock import MagicMock, patch

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from precompute_dashboard import (
    group_queries_into_sections,
    get_bedrock_comment,
    WEEKLY_SECTION_GROUPS,
)


def test_group_queries_into_sections_returns_5_sections():
    # Build mock query data with all 9 keys
    query_data = {
        "sessions": [{"channel_group": "Organic", "sessions": "100", "conversions": "5"}],
        "trend_sessions": [{"dt": "2024-11-01", "sessions": "50"}],
        "channel_revenue": [{"channel_group": "Organic", "total_revenue": "9999"}],
        "installs": [{"media_source": "Facebook", "installs": "30"}],
        "campaign_installs": [{"campaign": "summer", "installs": "10"}],
        "trend_installs": [{"dt": "2024-11-01", "installs": "15"}],
        "engagement": [{"channel_group": "Organic", "engagement_rate": "0.7"}],
        "retention": [{"cohort_day": "1", "retained_users": "80", "cohort_size": "100"}],
        "install_funnel": [{"event_name": "purchase", "event_count": "5"}],
    }

    sections = group_queries_into_sections(query_data)
    assert len(sections) == 5
    ids = {s["id"] for s in sections}
    assert ids == {"acquisition", "revenue", "installs", "engagement", "retention"}


def test_get_bedrock_comment_returns_empty_on_exception():
    with patch("precompute_dashboard.boto3") as mock_boto3:
        mock_client = MagicMock()
        mock_client.invoke_model.side_effect = Exception("network error")
        mock_boto3.client.return_value = mock_client

        result = get_bedrock_comment("weekly", [{"sessions": "100"}])
        assert result == ""


def test_get_bedrock_comment_parses_response():
    mock_response_body = json.dumps({
        "content": [{"text": "Organic led with 100 sessions this week."}]
    }).encode()

    with patch("precompute_dashboard.boto3") as mock_boto3:
        mock_client = MagicMock()
        mock_body = MagicMock()
        mock_body.read.return_value = mock_response_body
        mock_client.invoke_model.return_value = {"body": mock_body}
        mock_boto3.client.return_value = mock_client

        result = get_bedrock_comment("weekly", [{"sessions": "100"}])
        assert "Organic" in result
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend/scripts
python -m pytest tests/test_precompute_comments.py -v
```

Expected: FAIL (ImportError — functions not yet defined)

- [ ] **Step 2b: Verify `compute_week()` result structure before editing**

The existing `compute_week()` (lines 73–93 of `precompute_dashboard.py`, confirmed) returns:

```python
result = {
    "week": week,           # DashboardWeek TypedDict
    "generatedAt": "...",   # ISO timestamp string
    # 9 query keys from DASHBOARD_QUERIES:
    "sessions": [...],
    "installs": [...],
    "engagement": [...],
    "trend_sessions": [...],
    "trend_installs": [...],
    "channel_revenue": [...],
    "campaign_installs": [...],
    "install_funnel": [...],
    "retention": [...],
}
```

`group_queries_into_sections(result)` only accesses keys listed in `WEEKLY_SECTION_GROUPS["..."]["query_keys"]`, safely ignoring `"week"` and `"generatedAt"`. No structural changes to `compute_week()` are needed — only append `result["sections"] = ...` before `return result`.

- [ ] **Step 3: Extend `backend/scripts/precompute_dashboard.py`**

Add the following to the existing `precompute_dashboard.py` (do NOT replace existing code, only add):

```python
# ── Bedrock comment constants ──────────────────────────────────────────────────

WEEKLY_SECTION_GROUPS: dict[str, dict] = {
    "acquisition": {
        "title": "Acquisition",
        "query_keys": ["sessions", "trend_sessions"],
    },
    "revenue": {
        "title": "Revenue",
        "query_keys": ["channel_revenue"],
    },
    "installs": {
        "title": "Installs",
        "query_keys": ["installs", "campaign_installs", "trend_installs"],
    },
    "engagement": {
        "title": "Engagement",
        "query_keys": ["engagement"],
    },
    "retention": {
        "title": "Retention & Funnel",
        "query_keys": ["retention", "install_funnel"],
    },
}

MODEL_ID = "anthropic.claude-haiku-4-5-20251001"


def get_bedrock_comment(period: str, rows: list[dict]) -> str:
    """Generate a 2-3 sentence summary comment via Bedrock. Returns "" on any error."""
    try:
        import json as _json
        bedrock = boto3.client(
            "bedrock-runtime",
            region_name=os.environ.get("AWS_REGION", "ap-northeast-2"),
        )
        prompt = (
            f"You are a marketing analytics assistant. Summarize the following {period} metrics "
            f"in 2-3 concise sentences, highlighting the most notable trend or insight.\n\n"
            f"Data: {_json.dumps(rows[:20])}\n\n"
            f"Response: (2-3 sentences only, no bullet points)"
        )
        resp = bedrock.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=_json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 200,
                "messages": [{"role": "user", "content": prompt}],
            }).encode(),
        )
        body = _json.loads(resp["body"].read())
        return body.get("content", [{}])[0].get("text", "").strip()
    except Exception as exc:
        print(f"  [bedrock comment] warning: {exc}", flush=True)
        return ""


def group_queries_into_sections(
    query_data: dict[str, Any],
) -> list[dict[str, Any]]:
    """Convert flat query_data dict into section list with Bedrock comments."""
    sections = []
    for section_id, group in WEEKLY_SECTION_GROUPS.items():
        combined_rows: list[dict] = []
        for key in group["query_keys"]:
            combined_rows.extend(query_data.get(key, []))
        comment = get_bedrock_comment("weekly", combined_rows)
        sections.append({
            "id": section_id,
            "title": group["title"],
            "comment": comment,
            # Pass through raw query data for each key
            "data": {k: query_data.get(k, []) for k in group["query_keys"]},
        })
    return sections
```

Then update `compute_week()` to add sections to the result dict (after existing query loop):

```python
# Add at the end of compute_week(), before return:
result["sections"] = group_queries_into_sections(result)
```

And update `save_week_json()` — it already writes the whole dict, no change needed.

- [ ] **Step 4: Run the tests**

```bash
cd backend/scripts
python -m pytest tests/test_precompute_comments.py -v
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/precompute_dashboard.py backend/scripts/tests/test_precompute_comments.py
git commit -m "feat(dr-10): extend precompute_dashboard with Bedrock section comments"
```

---

### Task 18: Weekly frontend comment rendering (DR-11)

**Files:**

- Modify: `frontend/src/hooks/useDashboardCache.ts`
- Modify: `frontend/src/components/dashboard/DashboardCardView.tsx`
- Modify: `frontend/src/app/(app)/dashboard/page.tsx` (WeeklyContent)

**Section → Card mapping** (from `WEEKLY_SECTION_GROUPS` in Task 17):

| section id    | query_keys                                   | Renders in card(s)                        |
| ------------- | -------------------------------------------- | ----------------------------------------- |
| `acquisition` | sessions, trend_sessions                     | `channelShare` (ChannelPieChart), `trend` |
| `revenue`     | channel_revenue                              | `channelRevenue`                          |
| `installs`    | installs, campaign_installs, trend_installs  | `campaignInstalls`                        |
| `engagement`  | engagement                                   | `conversionByChannel`                     |
| `retention`   | retention, install_funnel                    | `retention`, `installFunnel`              |

- [ ] **Step 1: Read `useDashboardCache.ts` to find the raw JSON type**

```bash
cat frontend/src/hooks/useDashboardCache.ts | head -60
```

Identify the interface/type that describes the raw cache JSON shape (typically has fields like `sessions`, `installs`, etc.).

- [ ] **Step 2: Add `sections` to the raw cache JSON type in `useDashboardCache.ts`**

In the raw cache JSON type (whichever interface wraps the top-level parsed JSON), add:

```typescript
sections?: {
  id: string;
  title: string;
  comment: string;
  data: Record<string, unknown[]>;
}[];
```

Then expose a derived `sectionComments` map in the hook's return value:

```typescript
// Inside the hook, derive a lookup map from sections array:
const sectionComments: Record<string, string> = {};
if (rawData?.sections) {
  for (const s of rawData.sections) {
    sectionComments[s.id] = s.comment;
  }
}
// Add to the hook's return object:
return {
  // ... existing fields
  sectionComments, // Record<string, string> — keyed by section id
};
```

- [ ] **Step 3: Add optional `comment` prop to `DashboardCardView.tsx`**

In `frontend/src/components/dashboard/DashboardCardView.tsx`, find the props interface and add:

```typescript
comment?: string; // optional — displayed below chart/table if Bedrock comment is present
```

In the `CardContent` JSX, after the existing chart content area, add:

```typescript
{comment && (
  <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">{comment}</p>
)}
```

- [ ] **Step 4: Pass comments from `sectionComments` in `WeeklyContent`**

In `frontend/src/app/(app)/dashboard/page.tsx`, destructure `sectionComments` from `useDashboardCache`:

```typescript
const { ..., sectionComments, loading, error } = dashboardData;
```

Then pass `comment` to each `DashboardCardView` using the section mapping:

```tsx
// channelShare + trend → "acquisition" section
<DashboardCardView ... comment={sectionComments["acquisition"]} />

// channelRevenue → "revenue" section
<DashboardCardView ... comment={sectionComments["revenue"]} />

// campaignInstalls → "installs" section
<DashboardCardView ... comment={sectionComments["installs"]} />

// conversionByChannel → "engagement" section
<DashboardCardView ... comment={sectionComments["engagement"]} />

// retention + installFunnel → "retention" section (pass same comment to both)
<DashboardCardView ... comment={sectionComments["retention"]} />
```

- [ ] **Step 5: TypeScript check + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/src/hooks/useDashboardCache.ts frontend/src/components/dashboard/DashboardCardView.tsx frontend/src/app/(app)/dashboard/page.tsx
git commit -m "feat(dr-11): add Bedrock comment rendering to weekly dashboard sections"
```

---

## Final verification

- [ ] **Run all frontend tests**

```bash
cd frontend && npx jest --no-coverage
```

Expected: all passing (athenaClient, reportStaleness, reportQueriesDaily, reportQueriesMonthly, reportS3)

- [ ] **Run Python tests**

```bash
cd backend/scripts && python -m pytest tests/ -v
```

Expected: all passing including test_precompute_comments.py

- [ ] **TypeScript compile check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Manual smoke test (requires AWS credentials)**

1. Start dev server: `cd frontend && npm run dev`
2. Navigate to `/dashboard?period=daily`
3. Select a date with data
4. Verify sections load with charts + comment
5. Click pin on one section
6. Navigate to `/dashboard?period=custom`
7. Verify pinned section appears with date picker

- [ ] **Commit final status.json update**

Update `docs/tasks/status.json` to mark DR-01a through DR-11 as done (or update with the DR task IDs as appropriate to your status.json schema).

```bash
git add docs/tasks/status.json
git commit -m "chore: mark DR tasks complete in status.json"
```
