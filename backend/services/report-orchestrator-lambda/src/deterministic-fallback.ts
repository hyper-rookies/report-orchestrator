import {
  IActionLambdaInvoker,
  SignedActionLambdaInvoker,
  type ActionInvocationResult,
} from "./action-lambda-invoker";
import { getSharedSchemaConfig } from "./shared-config";
import type { QuestionPreprocessResult, NormalizedQuestionHint } from "./question-preprocessor";

const DEFAULT_DATABASE = process.env.ATHENA_DATABASE ?? "hyper_intern_m1c";
const DEFAULT_TIMEOUT_SECONDS = 45;
const DEFAULT_MAX_ROWS = 500;

type QuerySuccess = {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
};

type DateRange = {
  startDate: string;
  endDate: string;
};

type DeterministicPlan = {
  sql: string;
  chartType?: "auto" | "bar" | "line" | "table" | "pie" | "stackedBar";
  xAxis?: string;
  yAxis?: string[];
  summary: string;
};

export type DeterministicFulfillmentResult = {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
  chartSpec?: Record<string, unknown>;
  summary: string;
};

let _actionInvokerOverride: IActionLambdaInvoker | null = null;

export function setDeterministicFallbackInvoker(invoker: IActionLambdaInvoker | null): void {
  _actionInvokerOverride = invoker;
}

function getActionInvoker(): IActionLambdaInvoker {
  return _actionInvokerOverride ?? new SignedActionLambdaInvoker();
}

export async function tryDeterministicFulfillment(
  question: string,
  analysis: QuestionPreprocessResult
): Promise<DeterministicFulfillmentResult | null> {
  if (!analysis.likelyView || !analysis.normalized) {
    return null;
  }

  const invoker = getActionInvoker();
  const plan = await buildPlan(question, analysis.likelyView, analysis.normalized, invoker);
  if (!plan) {
    return null;
  }

  const queryResult = await executeQuery(invoker, plan.sql);
  if (!queryResult) {
    return null;
  }

  const chartSpec = queryResult.rowCount > 0 && plan.xAxis && plan.yAxis && plan.yAxis.length > 0
    ? await buildChart(invoker, question, queryResult.rows, plan.chartType ?? "auto", plan.xAxis, plan.yAxis)
    : null;

  return {
    rows: queryResult.rows,
    rowCount: queryResult.rowCount,
    truncated: queryResult.truncated,
    chartSpec: chartSpec ?? undefined,
    summary:
      queryResult.rowCount === 0
        ? "\uC694\uCCAD\uD55C \uC870\uAC74\uC5D0 \uB9DE\uB294 \uB370\uC774\uD130\uAC00 \uC5C6\uC5B4 \uBE48 \uACB0\uACFC\uB97C \uBC18\uD658\uD588\uC2B5\uB2C8\uB2E4."
        : plan.summary,
  };
}

async function buildPlan(
  question: string,
  likelyView: string,
  normalized: NormalizedQuestionHint,
  invoker: IActionLambdaInvoker
): Promise<DeterministicPlan | null> {
  const dateRange = await resolveDateRange(question, likelyView, invoker);
  if (!dateRange) {
    return null;
  }

  if (likelyView === "v_latest_ga4_acquisition_daily") {
    const metric = pickFirst(normalized.metrics, ["sessions", "total_users", "conversions", "total_revenue"]);
    const dimension = pickFirst(normalized.dimensions, ["source", "medium", "channel_group"]);
    if (metric && dimension) {
      return {
        sql: buildGroupedMetricSql({
          view: likelyView,
          dimension,
          metricSql: `SUM(${metric})`,
          metricAlias: metric,
          dateRange,
          filters: [],
        }),
        chartType: normalizeChartType(normalized.chartPreference),
        xAxis: dimension,
        yAxis: [metric],
        summary: "Queried GA4 acquisition metrics directly for the requested grouping.",
      };
    }
  }

  if (
    likelyView === "v_latest_appsflyer_installs_daily" &&
    normalized.singleKpi &&
    normalized.metrics.includes("installs")
  ) {
    const mediaSource = getFilterValue(normalized.filters, "media_source");
    if (!mediaSource) {
      return null;
    }
    return {
      sql: buildSingleMetricSql({
        view: likelyView,
        metricSql: "SUM(installs)",
        metricAlias: "installs",
        dateRange,
        filters: [{ key: "media_source", value: mediaSource }],
        limit: 1,
      }),
      summary: "\uC694\uCCAD\uD55C media_source \uC870\uAC74\uC73C\uB85C \uC124\uCE58 \uC218\uB97C \uC9C1\uC811 \uC870\uD68C\uD588\uC2B5\uB2C8\uB2E4.",
    };
  }

  if (likelyView === "v_latest_appsflyer_events_daily") {
    const metric = pickFirst(normalized.metrics, ["event_revenue", "event_count"]);
    const eventName = getFilterValue(normalized.filters, "event_name");
    if (!metric || !eventName) {
      return null;
    }
    if (looksLikeTimeSeriesQuestion(question) && normalized.dimensions.length === 0) {
      return {
        sql: buildTrendMetricSql({
          view: likelyView,
          dimension: "dt",
          metricSql: `SUM(${metric})`,
          metricAlias: metric,
          dateRange,
          filters: [{ key: "event_name", value: eventName }],
        }),
        chartType: normalizeChartType(normalized.chartPreference),
        xAxis: "dt",
        yAxis: [metric],
        summary: "Queried the requested event metric trend with the event_name filter preserved.",
      };
    }

    const dimension = pickFirst(normalized.dimensions, ["media_source", "campaign", "event_name"]);
    if (!dimension) {
      return null;
    }
    return {
      sql: buildGroupedMetricSql({
        view: likelyView,
        dimension,
        metricSql: `SUM(${metric})`,
        metricAlias: metric,
        dateRange,
        filters: [{ key: "event_name", value: eventName }],
      }),
      chartType: normalizeChartType(normalized.chartPreference),
      xAxis: dimension,
      yAxis: [metric],
      summary: "Queried the requested event metric with the event_name filter preserved.",
    };
  }

  if (likelyView === "v_latest_appsflyer_cohort_daily" && normalized.metrics.includes("retention_rate")) {
    const cohortDay = getFilterValue(normalized.filters, "cohort_day");

    if (normalized.singleKpi) {
      const mediaSource = getFilterValue(normalized.filters, "media_source");
      if (!cohortDay || !mediaSource) {
        return null;
      }
      return {
        sql: buildSingleMetricSql({
          view: likelyView,
          metricSql: "ROUND(SUM(retained_users) * 1.0 / NULLIF(SUM(cohort_size), 0), 4)",
          metricAlias: "retention_rate",
          dateRange,
          filters: [
            { key: "cohort_day", value: cohortDay },
            { key: "media_source", value: mediaSource },
          ],
          limit: 1,
        }),
        summary: "Queried retention rate directly for the requested cohort day and media source.",
      };
    }

    const dimension = pickFirst(normalized.dimensions, ["media_source", "campaign", "cohort_date", "cohort_day"]);
    if (!dimension) {
      return null;
    }

    if (!cohortDay && dimension === "cohort_day") {
      return {
        sql: buildTrendMetricSql({
          view: likelyView,
          dimension,
          metricSql: "ROUND(SUM(retained_users) * 1.0 / NULLIF(SUM(cohort_size), 0), 4)",
          metricAlias: "retention_rate",
          dateRange,
          filters: [],
        }),
        chartType: normalizeChartType(normalized.chartPreference),
        xAxis: dimension,
        yAxis: ["retention_rate"],
        summary: "Queried cohort retention trend directly for the requested range.",
      };
    }

    if (!cohortDay) {
      return null;
    }

    return {
      sql: buildGroupedMetricSql({
        view: likelyView,
        dimension,
        metricSql: "ROUND(SUM(retained_users) * 1.0 / NULLIF(SUM(cohort_size), 0), 4)",
        metricAlias: "retention_rate",
        dateRange,
        filters: [{ key: "cohort_day", value: cohortDay }],
      }),
      chartType: normalizeChartType(normalized.chartPreference),
      xAxis: dimension,
      yAxis: ["retention_rate"],
      summary: "Queried retention rate directly for the requested cohort day grouping.",
    };
  }

  return null;
}

async function resolveDateRange(
  question: string,
  likelyView: string,
  invoker: IActionLambdaInvoker
): Promise<DateRange | null> {
  const explicitMonth = question.match(/(20\d{2})\s*(?:\uB144|[-./])\s*(\d{1,2})\s*\uC6D4?/i);
  if (explicitMonth) {
    const year = Number(explicitMonth[1]);
    const month = Number(explicitMonth[2]);
    return buildMonthRange(year, month);
  }

  const latestDate = await fetchLatestDate(likelyView, invoker);
  if (!latestDate) {
    return null;
  }

  if (/\uCD5C\uC2E0\s*(\uB0A0\uC9DC|\uC9D1\uACC4\uC77C)|\uCD5C\uADFC\s*\uC9D1\uACC4\uC77C/i.test(question)) {
    return { startDate: latestDate, endDate: latestDate };
  }
  if (/\uC9C0\uB09C\uC8FC/i.test(question)) {
    return { startDate: shiftDate(latestDate, -6), endDate: latestDate };
  }
  if (/\uCD5C\uADFC\s*4\uC8FC/i.test(question) || /last\s*4\s*weeks?/i.test(question)) {
    return { startDate: shiftDate(latestDate, -27), endDate: latestDate };
  }
  if (/\uC9C0\uB09C\uB2EC/i.test(question) || /last\s*month/i.test(question)) {
    const latest = new Date(`${latestDate}T00:00:00Z`);
    return buildMonthRange(latest.getUTCFullYear(), latest.getUTCMonth() + 1);
  }

  return null;
}

async function fetchLatestDate(view: string, invoker: IActionLambdaInvoker): Promise<string | null> {
  const shared = getSharedSchemaConfig();
  const schema = shared.views[view];
  if (!schema || schema.metrics.length === 0) {
    return null;
  }

  const sql = [
    `SELECT dt, MAX(${schema.metrics[0]}) AS ${schema.metrics[0]}`,
    `FROM ${DEFAULT_DATABASE}.${view}`,
    "WHERE dt BETWEEN '1900-01-01' AND '2100-12-31'",
    "GROUP BY 1",
    "ORDER BY dt DESC",
    "LIMIT 1",
  ].join("\n");

  const result = await executeQuery(invoker, sql, 1);
  if (!result || result.rows.length === 0) {
    return null;
  }

  const dt = result.rows[0]?.dt;
  return typeof dt === "string" ? dt : null;
}

async function executeQuery(
  invoker: IActionLambdaInvoker,
  sql: string,
  maxRows = DEFAULT_MAX_ROWS
): Promise<QuerySuccess | null> {
  let invocationResult: ActionInvocationResult;
  try {
    invocationResult = await invoker.invoke({
      actionGroup: "query",
      functionName: "executeAthenaQuery",
      parameters: [
        { name: "sql", type: "string", value: sql },
        { name: "maxRows", type: "integer", value: String(maxRows) },
        { name: "timeoutSeconds", type: "integer", value: String(DEFAULT_TIMEOUT_SECONDS) },
      ],
    });
  } catch {
    return null;
  }

  const result = invocationResult.result;
  if (!result || typeof result !== "object" || "error" in result) {
    return null;
  }

  const rows = result.rows;
  const rowCount = result.rowCount;
  const truncated = result.truncated;
  if (!Array.isArray(rows) || typeof rowCount !== "number" || typeof truncated !== "boolean") {
    return null;
  }

  return normalizeQuerySuccess({
    rows: rows as Array<Record<string, unknown>>,
    rowCount,
    truncated,
  });
}

function normalizeQuerySuccess(result: QuerySuccess): QuerySuccess {
  const rows = normalizeEmptyAggregateRows(result.rows);
  return {
    rows,
    rowCount: rows.length,
    truncated: result.truncated,
  };
}

function normalizeEmptyAggregateRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  if (rows.length > 0 && rows.every((row) => Object.values(row).every((value) => value == null))) {
    return [];
  }
  return rows;
}

async function buildChart(
  invoker: IActionLambdaInvoker,
  question: string,
  rows: Array<Record<string, unknown>>,
  chartType: "auto" | "bar" | "line" | "table" | "pie" | "stackedBar",
  xAxis: string,
  yAxis: string[]
): Promise<Record<string, unknown> | null> {
  let invocationResult: ActionInvocationResult;
  try {
    invocationResult = await invoker.invoke({
      actionGroup: "viz",
      functionName: "buildChartSpec",
      userPrompt: question,
      parameters: [
        { name: "rows", type: "array", value: JSON.stringify(rows) },
        { name: "chartType", type: "string", value: chartType },
        { name: "xAxis", type: "string", value: xAxis },
        { name: "yAxis", type: "array", value: JSON.stringify(yAxis) },
      ],
    });
  } catch {
    return null;
  }

  const result = invocationResult.result;
  if (!result || typeof result !== "object" || "error" in result) {
    return null;
  }

  return typeof result.spec === "object" && result.spec ? (result.spec as Record<string, unknown>) : null;
}

function buildSingleMetricSql(options: {
  view: string;
  metricSql: string;
  metricAlias: string;
  dateRange: DateRange;
  filters: Array<{ key: string; value: string | number }>;
  limit: number;
}): string {
  return [
    `SELECT dt, ${options.metricSql} AS ${options.metricAlias}`,
    `FROM ${DEFAULT_DATABASE}.${options.view}`,
    `WHERE dt BETWEEN '${options.dateRange.startDate}' AND '${options.dateRange.endDate}'`,
    `  AND dt = '${options.dateRange.endDate}'`,
    ...options.filters.map((filter) => `  AND ${filter.key} = ${formatSqlLiteral(filter.value)}`),
    "GROUP BY 1",
    "ORDER BY dt DESC",
    `LIMIT ${options.limit}`,
  ].join("\n");
}

function buildTrendMetricSql(options: {
  view: string;
  dimension: string;
  metricSql: string;
  metricAlias: string;
  dateRange: DateRange;
  filters: Array<{ key: string; value: string | number }>;
}): string {
  return [
    `SELECT ${options.dimension}, ${options.metricSql} AS ${options.metricAlias}`,
    `FROM ${DEFAULT_DATABASE}.${options.view}`,
    `WHERE dt BETWEEN '${options.dateRange.startDate}' AND '${options.dateRange.endDate}'`,
    ...options.filters.map((filter) => `  AND ${filter.key} = ${formatSqlLiteral(filter.value)}`),
    "GROUP BY 1",
    `ORDER BY ${options.dimension} ASC`,
    "LIMIT 500",
  ].join("\n");
}

function looksLikeTimeSeriesQuestion(question: string): boolean {
  return /(추이|흐름|일간|주간|월간|trend|over\s*time|daily|weekly|monthly)/i.test(question);
}

function buildGroupedMetricSql(options: {
  view: string;
  dimension: string;
  metricSql: string;
  metricAlias: string;
  dateRange: DateRange;
  filters: Array<{ key: string; value: string | number }>;
}): string {
  return [
    `SELECT ${options.dimension}, ${options.metricSql} AS ${options.metricAlias}`,
    `FROM ${DEFAULT_DATABASE}.${options.view}`,
    `WHERE dt BETWEEN '${options.dateRange.startDate}' AND '${options.dateRange.endDate}'`,
    ...options.filters.map((filter) => `  AND ${filter.key} = ${formatSqlLiteral(filter.value)}`),
    "GROUP BY 1",
    `ORDER BY ${options.metricAlias} DESC`,
    "LIMIT 20",
  ].join("\n");
}

function getFilterValue(
  filters: Array<{ key: string; value: string | number }>,
  key: string
): string | number | null {
  return filters.find((filter) => filter.key === key)?.value ?? null;
}

function pickFirst(values: string[], allowed: string[]): string | null {
  for (const allowedValue of allowed) {
    if (values.includes(allowedValue)) {
      return allowedValue;
    }
  }
  return null;
}

function normalizeChartType(value: string | null): "auto" | "bar" | "line" | "table" | "pie" | "stackedBar" {
  if (value === "bar" || value === "line" || value === "table" || value === "pie" || value === "stackedBar") {
    return value;
  }
  return "auto";
}

function buildMonthRange(year: number, month: number): DateRange {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  return {
    startDate: formatDate(first),
    endDate: formatDate(last),
  };
}

function shiftDate(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSqlLiteral(value: string | number): string {
  if (typeof value === "number") {
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}