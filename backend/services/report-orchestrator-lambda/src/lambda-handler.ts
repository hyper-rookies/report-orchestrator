import { randomUUID } from "crypto";
import { BedrockAgentClient, IBedrockAgentClient } from "./bedrock-agent-client";
import { verifyIdToken } from "./auth";
import { formatSseEvent, generateReportId, utcNow } from "./sse-formatter";

const AGENT_ID = process.env.BEDROCK_AGENT_ID ?? "";
const AGENT_ALIAS_ID = process.env.BEDROCK_AGENT_ALIAS_ID ?? "TSTALIASID";

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

        // Surface structured errors from action group Lambdas
        if ((ag.includes("query") || ag.includes("analysis")) && parsed.error) {
          const err = parsed.error as Record<string, unknown>;
          yield formatSseEvent("error", {
            version: "v1",
            code: (err.code as string) ?? "ACTION_GROUP_ERROR",
            message:
              (err.message as string) ??
              `Action group "${agentEvent.actionGroup}" returned an error.`,
            retryable: err.retryable ?? false,
          });
          return;
        }

        if (ag.includes("query") && parsed.rows && !tableEmitted) {
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

        if (ag.includes("viz") && parsed.spec && !chartEmitted) {
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

      const body = (event as { body?: string })?.body;
      const parsed = body
        ? (JSON.parse(body) as { question?: string; autoApproveActions?: boolean })
        : (event as { question?: string; autoApproveActions?: boolean });
      const question: string = parsed?.question ?? "";
      const autoApproveActions = parsed?.autoApproveActions === true;

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
