import {
  IActionLambdaInvoker,
  SignedActionLambdaInvoker,
  type ActionInvocationResult,
} from "./action-lambda-invoker";
import { type HttpEventLike, type JsonResponse } from "./session-api";
import { getSharedSchemaConfig } from "./shared-config";

const DEFAULT_DATABASE = process.env.ATHENA_DATABASE ?? "hyper_intern_m1c";
const DEFAULT_TIMEOUT_SECONDS = 45;
const DEFAULT_MAX_ROWS = 500;
const MAX_MAX_ROWS = 10000;

type EvalLatestDatesPayload = {
  operation: "latestDates";
};

type EvalExecuteQueryPayload = {
  operation: "executeQuery";
  sql: string;
  maxRows?: number;
  timeoutSeconds?: number;
  caseId?: string;
};

type EvalRequestPayload = EvalLatestDatesPayload | EvalExecuteQueryPayload;

type ParsedEvalPayload =
  | { ok: true; payload: EvalRequestPayload }
  | { ok: false; statusCode: number; body: { error: { code: string; message: string; retryable: false } } };

type QueryLambdaSuccess = {
  version?: string;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
  queryExecutionId: string;
};

function errorResponse(statusCode: number, code: string, message: string): JsonResponse {
  return {
    statusCode,
    body: {
      error: {
        code,
        message,
        retryable: false,
      },
    },
  };
}

function getRequestBody(event: HttpEventLike): string {
  if (!event.body) {
    return "";
  }
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, "base64").toString("utf-8");
  }
  return event.body;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function parseEvalRequestPayload(event: HttpEventLike): ParsedEvalPayload {
  let parsed: unknown;
  const rawBody = getRequestBody(event);
  if (rawBody.trim().length === 0) {
    return {
      ok: false,
      statusCode: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be a JSON object.", retryable: false } },
    };
  }

  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return {
      ok: false,
      statusCode: 400,
      body: { error: { code: "BAD_REQUEST", message: "Malformed JSON body.", retryable: false } },
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      statusCode: 400,
      body: { error: { code: "BAD_REQUEST", message: "Request body must be a JSON object.", retryable: false } },
    };
  }

  const operation = parsed.operation;
  if (operation === "latestDates") {
    return { ok: true, payload: { operation } };
  }

  if (operation === "executeQuery") {
    const sql = parsed.sql;
    if (typeof sql !== "string" || sql.trim().length === 0) {
      return {
        ok: false,
        statusCode: 400,
        body: { error: { code: "BAD_REQUEST", message: "sql is required for executeQuery.", retryable: false } },
      };
    }

    const maxRows = parsed.maxRows;
    if (maxRows !== undefined && (!isPositiveInteger(maxRows) || maxRows > MAX_MAX_ROWS)) {
      return {
        ok: false,
        statusCode: 400,
        body: {
          error: {
            code: "BAD_REQUEST",
            message: `maxRows must be an integer between 1 and ${MAX_MAX_ROWS}.`,
            retryable: false,
          },
        },
      };
    }

    const timeoutSeconds = parsed.timeoutSeconds;
    if (timeoutSeconds !== undefined && !isPositiveInteger(timeoutSeconds)) {
      return {
        ok: false,
        statusCode: 400,
        body: {
          error: {
            code: "BAD_REQUEST",
            message: "timeoutSeconds must be a positive integer.",
            retryable: false,
          },
        },
      };
    }

    const caseId = parsed.caseId;
    if (caseId !== undefined && typeof caseId !== "string") {
      return {
        ok: false,
        statusCode: 400,
        body: { error: { code: "BAD_REQUEST", message: "caseId must be a string.", retryable: false } },
      };
    }

    return {
      ok: true,
      payload: {
        operation,
        sql: sql.trim(),
        ...(typeof maxRows === "number" ? { maxRows } : {}),
        ...(typeof timeoutSeconds === "number" ? { timeoutSeconds } : {}),
        ...(typeof caseId === "string" ? { caseId } : {}),
      },
    };
  }

  return {
    ok: false,
    statusCode: 400,
    body: {
      error: {
        code: "BAD_REQUEST",
        message: 'operation must be either "latestDates" or "executeQuery".',
        retryable: false,
      },
    },
  };
}

function buildQueryParameters(
  sql: string,
  maxRows: number,
  timeoutSeconds: number
): Array<{ name: string; type: string; value: string }> {
  return [
    { name: "sql", type: "string", value: sql },
    { name: "maxRows", type: "integer", value: String(maxRows) },
    { name: "timeoutSeconds", type: "integer", value: String(timeoutSeconds) },
  ];
}

function buildLatestDateSql(view: string, metric: string, database = DEFAULT_DATABASE): string {
  return [
    `SELECT dt, MAX(${metric}) AS ${metric}`,
    `FROM ${database}.${view}`,
    "WHERE dt BETWEEN '1900-01-01' AND '2100-12-31'",
    "GROUP BY 1",
    "ORDER BY dt DESC",
    "LIMIT 1",
  ].join("\n");
}

function statusForQueryError(code: string): number {
  if (code === "SCHEMA_VIOLATION" || code === "INVALID_OPERATION" || code === "DML_REJECTED") {
    return 400;
  }
  return 500;
}

function parseQuerySuccess(result: Record<string, unknown>): QueryLambdaSuccess | null {
  const rows = result.rows;
  const rowCount = result.rowCount;
  const truncated = result.truncated;
  const queryExecutionId = result.queryExecutionId;
  if (
    Array.isArray(rows) &&
    typeof rowCount === "number" &&
    typeof truncated === "boolean" &&
    typeof queryExecutionId === "string"
  ) {
    return {
      version: typeof result.version === "string" ? result.version : undefined,
      rows: rows as Array<Record<string, unknown>>,
      rowCount,
      truncated,
      queryExecutionId,
    };
  }
  return null;
}

async function invokeExecuteQuery(
  actionInvoker: IActionLambdaInvoker,
  sql: string,
  options: {
    maxRows?: number;
    timeoutSeconds?: number;
  } = {}
): Promise<JsonResponse | QueryLambdaSuccess> {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  let invocationResult: ActionInvocationResult;
  try {
    invocationResult = await actionInvoker.invoke({
      actionGroup: "query",
      functionName: "executeAthenaQuery",
      parameters: buildQueryParameters(sql, maxRows, timeoutSeconds),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected eval API error while invoking query-lambda.";
    return errorResponse(500, "ACTION_GROUP_CRASH", message);
  }

  const result = invocationResult.result;
  if (isPlainObject(result.error)) {
    const code = typeof result.error.code === "string" ? result.error.code : "UNKNOWN";
    const message =
      typeof result.error.message === "string"
        ? result.error.message
        : 'query-lambda returned an error without a "message" field.';
    return errorResponse(statusForQueryError(code), code, message);
  }

  const parsed = parseQuerySuccess(result);
  if (!parsed) {
    return errorResponse(500, "PARSE_ERROR", "query-lambda returned an unexpected response shape.");
  }
  return parsed;
}

async function handleLatestDates(actionInvoker: IActionLambdaInvoker): Promise<JsonResponse> {
  const shared = getSharedSchemaConfig();
  const latestDates: Record<string, string> = {};

  for (const view of shared.allowedViews) {
    const schema = shared.views[view];
    const metric = schema?.metrics?.[0];
    if (typeof metric !== "string" || metric.length === 0) {
      return errorResponse(500, "CONFIG_ERROR", `No representative metric is configured for ${view}.`);
    }

    const queryResult = await invokeExecuteQuery(
      actionInvoker,
      buildLatestDateSql(view, metric),
      { maxRows: 1, timeoutSeconds: 15 }
    );
    if ("statusCode" in queryResult) {
      return queryResult;
    }

    const latestRow = queryResult.rows[0];
    const latestDt = latestRow?.dt;
    if (typeof latestDt !== "string" || latestDt.length === 0) {
      return errorResponse(500, "PARSE_ERROR", `Failed to resolve latest dt for ${view}.`);
    }
    latestDates[view] = latestDt;
  }

  return {
    statusCode: 200,
    body: {
      version: "v1",
      operation: "latestDates",
      latestDates,
    },
  };
}

async function handleExecuteQuery(
  payload: EvalExecuteQueryPayload,
  actionInvoker: IActionLambdaInvoker
): Promise<JsonResponse> {
  const queryResult = await invokeExecuteQuery(actionInvoker, payload.sql, {
    maxRows: payload.maxRows ?? DEFAULT_MAX_ROWS,
    timeoutSeconds: payload.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
  });
  if ("statusCode" in queryResult) {
    return queryResult;
  }

  return {
    statusCode: 200,
    body: {
      version: "v1",
      operation: "executeQuery",
      rows: queryResult.rows,
      rowCount: queryResult.rowCount,
      truncated: queryResult.truncated,
      queryId: queryResult.queryExecutionId,
      ...(typeof payload.caseId === "string" ? { caseId: payload.caseId } : {}),
    },
  };
}

export function isEvalApiEnabled(): boolean {
  return process.env.DISABLE_AUTH === "true";
}

export function isEvalReferencePath(path: string): boolean {
  return path === "/eval/reference";
}

export async function handleEvalRoute(
  method: string,
  event: HttpEventLike,
  actionInvoker: IActionLambdaInvoker = new SignedActionLambdaInvoker()
): Promise<JsonResponse> {
  if (!isEvalApiEnabled()) {
    return { statusCode: 404, body: { error: "Not found" } };
  }

  if (method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const parsed = parseEvalRequestPayload(event);
  if (!parsed.ok) {
    return { statusCode: parsed.statusCode, body: parsed.body };
  }

  if (parsed.payload.operation === "latestDates") {
    return handleLatestDates(actionInvoker);
  }

  return handleExecuteQuery(parsed.payload, actionInvoker);
}
