import { type IActionLambdaInvoker } from "../src/action-lambda-invoker";
import { handleEvalRoute } from "../src/eval-api";

const ORIGINAL_DISABLE_AUTH = process.env.DISABLE_AUTH;

afterEach(() => {
  if (ORIGINAL_DISABLE_AUTH === undefined) {
    delete process.env.DISABLE_AUTH;
  } else {
    process.env.DISABLE_AUTH = ORIGINAL_DISABLE_AUTH;
  }
});

function jsonBody(value: unknown): { body: string } {
  return { body: JSON.stringify(value) };
}

test("latestDates returns one latest dt per curated view", async () => {
  process.env.DISABLE_AUTH = "true";
  const latestDates: Record<string, string> = {
    v_latest_ga4_acquisition_daily: "2024-11-30",
    v_latest_ga4_engagement_daily: "2024-11-30",
    v_latest_appsflyer_installs_daily: "2024-11-30",
    v_latest_appsflyer_events_daily: "2024-11-30",
    v_latest_appsflyer_cohort_daily: "2024-11-30",
  };
  const invoker: IActionLambdaInvoker = {
    invoke: jest.fn(async (invocation) => {
      const sql = invocation.parameters?.find((parameter) => parameter.name === "sql")?.value ?? "";
      const match = sql.match(/FROM\s+hyper_intern_m1c\.([A-Za-z0-9_]+)/);
      const view = match?.[1] ?? "unknown";
      return {
        actionGroup: invocation.actionGroup,
        functionName: invocation.functionName,
        result: {
          version: "v1",
          rows: [{ dt: latestDates[view] }],
          rowCount: 1,
          truncated: false,
          queryExecutionId: `qid-${view}`,
        },
      };
    }),
  };

  const response = await handleEvalRoute("POST", jsonBody({ operation: "latestDates" }), invoker);

  expect(response.statusCode).toBe(200);
  expect(response.body).toEqual({
    version: "v1",
    operation: "latestDates",
    latestDates,
  });
});

test("executeQuery returns rows rowCount and queryId", async () => {
  process.env.DISABLE_AUTH = "true";
  const invoker: IActionLambdaInvoker = {
    invoke: jest.fn(async (invocation) => ({
      actionGroup: invocation.actionGroup,
      functionName: invocation.functionName,
      result: {
        version: "v1",
        rows: [{ source: "google", sessions: 123 }],
        rowCount: 1,
        truncated: false,
        queryExecutionId: "query-123",
      },
    })),
  };

  const response = await handleEvalRoute(
    "POST",
    jsonBody({
      operation: "executeQuery",
      sql: "SELECT source, SUM(sessions) AS sessions FROM hyper_intern_m1c.v_latest_ga4_acquisition_daily WHERE dt BETWEEN '2024-11-01' AND '2024-11-30' GROUP BY 1 ORDER BY sessions DESC LIMIT 20",
      caseId: "GA4A-01",
    }),
    invoker
  );

  expect(response.statusCode).toBe(200);
  expect(response.body).toEqual({
    version: "v1",
    operation: "executeQuery",
    rows: [{ source: "google", sessions: 123 }],
    rowCount: 1,
    truncated: false,
    queryId: "query-123",
    caseId: "GA4A-01",
  });
});

test("eval route rejects malformed JSON", async () => {
  process.env.DISABLE_AUTH = "true";

  const response = await handleEvalRoute("POST", { body: "{" });

  expect(response.statusCode).toBe(400);
  expect(response.body).toEqual({
    error: {
      code: "BAD_REQUEST",
      message: "Malformed JSON body.",
      retryable: false,
    },
  });
});

test("eval route rejects unsupported operations", async () => {
  process.env.DISABLE_AUTH = "true";

  const response = await handleEvalRoute("POST", jsonBody({ operation: "unknown" }));

  expect(response.statusCode).toBe(400);
  expect(response.body).toEqual({
    error: {
      code: "BAD_REQUEST",
      message: 'operation must be either "latestDates" or "executeQuery".',
      retryable: false,
    },
  });
});

test("eval route rejects non-post methods", async () => {
  process.env.DISABLE_AUTH = "true";

  const response = await handleEvalRoute("GET", jsonBody({ operation: "latestDates" }));

  expect(response.statusCode).toBe(405);
  expect(response.body).toEqual({
    error: {
      code: "METHOD_NOT_ALLOWED",
      message: "Method not allowed",
      retryable: false,
    },
  });
});

test("eval route is hidden when auth is enabled", async () => {
  process.env.DISABLE_AUTH = "false";

  const response = await handleEvalRoute("POST", jsonBody({ operation: "latestDates" }));

  expect(response.statusCode).toBe(404);
  expect(response.body).toEqual({ error: "Not found" });
});

test("query lambda structured errors are forwarded", async () => {
  process.env.DISABLE_AUTH = "true";
  const invoker: IActionLambdaInvoker = {
    invoke: jest.fn(async (invocation) => ({
      actionGroup: invocation.actionGroup,
      functionName: invocation.functionName,
      result: {
        version: "v1",
        error: {
          code: "SCHEMA_VIOLATION",
          message: "executeAthenaQuery only accepts buildSQL-compatible read-only SELECT queries.",
          retryable: false,
        },
      },
    })),
  };

  const response = await handleEvalRoute(
    "POST",
    jsonBody({ operation: "executeQuery", sql: "SELECT MAX(dt) FROM hyper_intern_m1c.v_latest_ga4_acquisition_daily" }),
    invoker
  );

  expect(response.statusCode).toBe(400);
  expect(response.body).toEqual({
    error: {
      code: "SCHEMA_VIOLATION",
      message: "executeAthenaQuery only accepts buildSQL-compatible read-only SELECT queries.",
      retryable: false,
    },
  });
});
