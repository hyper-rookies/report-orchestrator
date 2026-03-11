import { randomUUID } from "crypto";
import { BedrockAgentClient, IBedrockAgentClient } from "./bedrock-agent-client";
import { verifyIdToken } from "./auth";
import { formatSseEvent, generateReportId, utcNow } from "./sse-formatter";

const AGENT_ID = process.env.BEDROCK_AGENT_ID ?? "";
const AGENT_ALIAS_ID = process.env.BEDROCK_AGENT_ALIAS_ID ?? "TSTALIASID";
const MAX_QUESTION_LENGTH = 2000;

let _clientOverride: IBedrockAgentClient | null = null;

export function setBedrockClient(client: IBedrockAgentClient): void {
  _clientOverride = client;
}

function getClient(): IBedrockAgentClient {
  return _clientOverride ?? new BedrockAgentClient();
}

/**
 * Core logic as testable async generator.
 * Invariants:
 *   - meta ALWAYS first (outside try/catch)
 *   - final ALWAYS last on success path
 *   - error replaces final on failure path; meta still first
 */
export async function* buildSseEvents(
  question: string,
  reportId: string,
  client: IBedrockAgentClient,
  autoApproveActions = false
): AsyncGenerator<string> {
  // meta - always first, unconditional
  yield formatSseEvent("meta", {
    version: "v1",
    reportId,
    timestamp: utcNow(),
    requestSummary: { question },
  });

  try {
    yield formatSseEvent("progress", {
      version: "v1",
      step: "buildSQL",
      message: "Starting Bedrock Agent...",
    });

    let tableEmitted = false;
    let chartEmitted = false;
    let totalRows = 0;
    let agentSummary = "";
    const sessionId = randomUUID();

    // Maps Bedrock agent step names to SSE progress step labels.
    const STEP_LABEL: Record<string, string> = {
      agentThinking: "buildSQL",
      finalResponse: "finalizing",
    };

    for await (const agentEvent of client.stream({
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS_ID,
      sessionId,
      inputText: question,
      autoApproveActions,
    })) {
      if (agentEvent.type === "chunk") {
        agentSummary += agentEvent.text;
        yield formatSseEvent("chunk" as unknown as Parameters<typeof formatSseEvent>[0], {
          version: "v1",
          text: agentEvent.text,
        });
      }

      if (agentEvent.type === "step") {
        const stepLabel = STEP_LABEL[agentEvent.step] ?? "buildChart";
        yield formatSseEvent("progress", {
          version: "v1",
          step: stepLabel,
          message: `Agent: ${agentEvent.step}`,
        });
      }

      if (agentEvent.type === "returnControl") {
        yield formatSseEvent("progress", {
          version: "v1",
          step: "approval",
          message: autoApproveActions
            ? `Auto-approved ${agentEvent.inputCount} action(s).`
            : `Approval required for ${agentEvent.inputCount} action(s).`,
        });

        if (!autoApproveActions) {
          yield formatSseEvent("error", {
            version: "v1",
            code: "APPROVAL_REQUIRED",
            message: "Agent requested approval before executing an action.",
            retryable: false,
          });
          return;
        }
      }

      if (agentEvent.type === "actionGroupOutput") {
        const ag = agentEvent.actionGroup.toLowerCase();
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(agentEvent.output) as Record<string, unknown>;
        } catch {
          yield formatSseEvent("error", {
            version: "v1",
            code: "PARSE_ERROR",
            message: `Action group "${agentEvent.actionGroup}" returned non-JSON output.`,
            retryable: false,
          });
          return;
        }

        // Surface Lambda crash payloads (e.g. {"errorMessage":"...","errorType":"..."}).
        if (
          (ag.includes("query") || ag.includes("analysis")) &&
          "errorMessage" in parsed &&
          "errorType" in parsed
        ) {
          const errorMessage =
            typeof parsed.errorMessage === "string"
              ? parsed.errorMessage
              : `Action group "${agentEvent.actionGroup}" crashed without a message.`;
          const errorType =
            typeof parsed.errorType === "string" ? parsed.errorType : "LambdaCrash";
          yield formatSseEvent("error", {
            version: "v1",
            code: "ACTION_GROUP_CRASH",
            message: `${errorType}: ${errorMessage}`,
            retryable: false,
          });
          return;
        }

        // Surface structured errors from action group Lambdas.
        // SCHEMA_VIOLATION = Bedrock sent invalid params → emit as progress and let
        // Bedrock see the error and retry or respond naturally.
        // All other errors (ATHENA_ERROR, UNKNOWN, DML_REJECTED …) = hard failure →
        // terminate immediately so the user gets a clear infra error.
        if ((ag.includes("query") || ag.includes("analysis")) && parsed.error) {
          const err = parsed.error as Record<string, unknown>;
          const errCode = (err.code as string) ?? "ACTION_GROUP_ERROR";
          const errMessage =
            (err.message as string) ??
            `Action group "${agentEvent.actionGroup}" returned an error.`;

          if (errCode === "SCHEMA_VIOLATION") {
            yield formatSseEvent("progress", {
              version: "v1",
              step: "actionError",
              message: `Query validation error: ${errMessage}`,
            });
            // Do NOT return — Bedrock will receive this error response and can
            // retry with corrected parameters or provide a natural-language explanation.
          } else {
            yield formatSseEvent("error", {
              version: "v1",
              code: errCode,
              message: errMessage,
              retryable: err.retryable ?? false,
            });
            return;
          }
        }

        if (ag.includes("query") && parsed.rows) {
          tableEmitted = true;
          totalRows = (parsed.rowCount as number) ?? (parsed.rows as unknown[]).length;
          yield formatSseEvent("table", {
            version: "v1",
            rows: parsed.rows,
            rowCount: totalRows,
            truncated: parsed.truncated ?? false,
          });
          yield formatSseEvent("progress", {
            version: "v1",
            step: "computeDelta",
            message: "Data fetched. Building chart...",
          });
        }

        if (ag.includes("viz") && parsed.spec) {
          chartEmitted = true;
          yield formatSseEvent("chart", {
            version: "v1",
            spec: parsed.spec,
          });
        }
      }
    }

    // Agent completed without ever emitting query results — report is incomplete.
    if (!tableEmitted) {
      const code = agentSummary ? "UNSUPPORTED_METRIC" : "NO_DATA";
      const message = agentSummary
        ? `Agent responded without querying data: ${agentSummary.slice(0, 200)}`
        : "Agent completed without returning query results.";
      yield formatSseEvent("error", {
        version: "v1",
        code,
        message,
        retryable: false,
      });
      return;
    }

    // final - always last on success
    yield formatSseEvent("final", {
      version: "v1",
      reportId,
      totalRows,
      completedAt: utcNow(),
      ...(agentSummary ? { agentSummary } : {}),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected orchestrator error.";
    yield formatSseEvent("error", {
      version: "v1",
      code: "UNKNOWN",
      message,
      retryable: false,
    });
  }
}

export type ParsedRequestPayload =
  | { ok: true; payload: { question: string; autoApproveActions?: boolean } }
  | { ok: false; statusCode: number; body: string };

export function resolveAutoApproveActions(requestedValue?: boolean): boolean {
  if (typeof requestedValue === "boolean") {
    return requestedValue;
  }
  const raw = process.env.BEDROCK_AUTO_APPROVE_ACTIONS;
  if (raw === undefined) {
    return true;
  }
  return raw === "true";
}

export function parseRequestPayload(event: unknown): ParsedRequestPayload {
  const rawBody = (event as { body?: string })?.body;
  let parsed: unknown;

  if (typeof rawBody === "string") {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return {
        ok: false,
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON body." }),
      };
    }
  } else {
    parsed = event;
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      statusCode: 400,
      body: JSON.stringify({ error: "Request payload must be an object." }),
    };
  }

  const question = (parsed as { question?: unknown }).question;
  const autoApproveActions = (parsed as { autoApproveActions?: unknown }).autoApproveActions;
  if (typeof question !== "string" || question.trim().length === 0) {
    return {
      ok: false,
      statusCode: 400,
      body: JSON.stringify({ error: "question is required." }),
    };
  }
  if (question.trim().length > MAX_QUESTION_LENGTH) {
    return {
      ok: false,
      statusCode: 400,
      body: JSON.stringify({ error: `question must be <= ${MAX_QUESTION_LENGTH} characters.` }),
    };
  }
  if (autoApproveActions !== undefined && typeof autoApproveActions !== "boolean") {
    return {
      ok: false,
      statusCode: 400,
      body: JSON.stringify({ error: "autoApproveActions must be a boolean." }),
    };
  }

  return {
    ok: true,
    payload: {
      question: question.trim(),
      ...(typeof autoApproveActions === "boolean" ? { autoApproveActions } : {}),
    },
  };
}

declare const awslambda: {
  streamifyResponse: (
    fn: (
      event: unknown,
      responseStream: NodeJS.WritableStream,
      context: unknown
    ) => Promise<void>
  ) => unknown;
  HttpResponseStream: {
    from(
      stream: NodeJS.WritableStream,
      metadata: { statusCode: number; headers: Record<string, string> }
    ): NodeJS.WritableStream;
  };
};

const runtimeAwsLambda = globalThis as typeof globalThis & { awslambda?: typeof awslambda };
const streamifyResponse =
  runtimeAwsLambda.awslambda &&
  typeof runtimeAwsLambda.awslambda.streamifyResponse === "function"
    ? runtimeAwsLambda.awslambda.streamifyResponse.bind(runtimeAwsLambda.awslambda)
    : null;

export const handler =
  streamifyResponse?.(
    async (event: unknown, responseStream: NodeJS.WritableStream) => {
      const headers = (event as { headers?: Record<string, string | undefined> })?.headers ?? {};
      const authHeader = headers.authorization ?? headers.Authorization;
      const _caller = await verifyIdToken(authHeader);
      if (!_caller) {
        const errStream = runtimeAwsLambda.awslambda!.HttpResponseStream.from(responseStream, {
          statusCode: 401,
          headers: { "Content-Type": "application/json" },
        });
        errStream.write(JSON.stringify({ error: "Unauthorized" }));
        errStream.end();
        return;
      }

      const parsed = parseRequestPayload(event);
      if (!parsed.ok) {
        const errStream = runtimeAwsLambda.awslambda!.HttpResponseStream.from(responseStream, {
          statusCode: parsed.statusCode,
          headers: { "Content-Type": "application/json" },
        });
        errStream.write(parsed.body);
        errStream.end();
        return;
      }
      const { question, autoApproveActions: requestedAutoApproveActions } = parsed.payload;
      const autoApproveActions = resolveAutoApproveActions(requestedAutoApproveActions);

      const httpStream = runtimeAwsLambda.awslambda!.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });

      const reportId = generateReportId();
      for await (const chunk of buildSseEvents(
        question,
        reportId,
        getClient(),
        autoApproveActions
      )) {
        httpStream.write(chunk);
      }
      httpStream.end();
    }
  ) ?? null;
