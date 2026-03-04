import { randomUUID } from "crypto";
import { BedrockAgentClient, IBedrockAgentClient } from "./bedrock-agent-client";
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
  client: IBedrockAgentClient
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
    const sessionId = randomUUID();

    for await (const agentEvent of client.stream({
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS_ID,
      sessionId,
      inputText: question,
    })) {
      if (agentEvent.type === "step") {
        const stepLabel = agentEvent.step === "agentThinking" ? "buildSQL" : "buildChart";
        yield formatSseEvent("progress", {
          version: "v1",
          step: stepLabel,
          message: `Agent: ${agentEvent.step}`,
        });
      }

      if (agentEvent.type === "actionGroupOutput") {
        const ag = agentEvent.actionGroup.toLowerCase();
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(agentEvent.output) as Record<string, unknown>;
        } catch {
          continue;
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

    // final - always last on success
    yield formatSseEvent("final", {
      version: "v1",
      reportId,
      totalRows,
      completedAt: utcNow(),
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
      const body = (event as { body?: string })?.body;
      const parsed = body
        ? (JSON.parse(body) as { question?: string })
        : (event as { question?: string });
      const question: string = parsed?.question ?? "";

      const httpStream = runtimeAwsLambda.awslambda!.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });

      const reportId = generateReportId();
      for await (const chunk of buildSseEvents(question, reportId, getClient())) {
        httpStream.write(chunk);
      }
      httpStream.end();
    }
  ) ?? null;
