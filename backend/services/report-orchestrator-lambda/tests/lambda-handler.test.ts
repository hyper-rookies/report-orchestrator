import {
  buildSseEvents,
  parseRequestPayload,
  resolveAutoApproveActions,
} from "../src/lambda-handler";
import { AgentEvent, IBedrockAgentClient } from "../src/bedrock-agent-client";
import type { IActionLambdaInvoker } from "../src/action-lambda-invoker";
import { setDeterministicFallbackInvoker, tryDeterministicFulfillment } from "../src/deterministic-fallback";
import { preprocessQuestion } from "../src/question-preprocessor";

async function collect(
  question: string,
  agentEvents: AgentEvent[]
): Promise<Array<{ type: string; data: Record<string, unknown> }>> {
  const mockClient: IBedrockAgentClient = {
    async *stream() {
      for (const ev of agentEvents) {
        yield ev;
      }
    },
  };
  const frames: Array<{ type: string; data: Record<string, unknown> }> = [];
  for await (const raw of buildSseEvents(question, "rpt-test-000000", mockClient)) {
    const lines = raw.trimEnd().split("\n");
    const type = lines[0].replace("event: ", "");
    const data = JSON.parse(lines[1].replace("data: ", "")) as Record<string, unknown>;
    frames.push({ type, data });
  }
  return frames;
}

afterEach(() => {
  setDeterministicFallbackInvoker(null);
});


const FULL_MOCK_EVENTS: AgentEvent[] = [
  { type: "step", step: "agentThinking" },
  {
    type: "actionGroupOutput",
    actionGroup: "query",
    output: JSON.stringify({
      rows: [{ channel_group: "organic", sessions: 12450 }],
      rowCount: 1,
      truncated: false,
    }),
  },
  {
    type: "actionGroupOutput",
    actionGroup: "viz",
    output: JSON.stringify({
      spec: { type: "bar", title: "Test", xAxis: "channel_group", series: [], data: [] },
    }),
  },
  { type: "chunk", text: "Here are your results." },
];

// query result + finalResponse step (no viz ??chart not required for success)
const MOCK_WITH_FINAL_RESPONSE: AgentEvent[] = [
  { type: "step", step: "agentThinking" },
  {
    type: "actionGroupOutput",
    actionGroup: "query",
    output: JSON.stringify({ rows: [{ a: 1 }], rowCount: 1, truncated: false }),
  },
  { type: "step", step: "finalResponse" },
];

test("meta is always the first event", async () => {
  const frames = await collect("test question", FULL_MOCK_EVENTS);
  expect(frames[0].type).toBe("meta");
});

test("final is always the last event", async () => {
  const frames = await collect("test question", FULL_MOCK_EVENTS);
  expect(frames[frames.length - 1].type).toBe("final");
});

test("progress events are emitted during agent execution", async () => {
  const frames = await collect("test question", FULL_MOCK_EVENTS);
  expect(frames.filter((f) => f.type === "progress").length).toBeGreaterThanOrEqual(1);
});

test("table event emitted when query actionGroup returns rows", async () => {
  const frames = await collect("test question", FULL_MOCK_EVENTS);
  const tableFrame = frames.find((f) => f.type === "table");
  expect(tableFrame).toBeDefined();
  expect(tableFrame?.data).toMatchObject({ version: "v1", rowCount: 1, truncated: false });
});

test("chart event emitted when viz actionGroup returns spec", async () => {
  const frames = await collect("test question", FULL_MOCK_EVENTS);
  const chartFrame = frames.find((f) => f.type === "chart");
  expect(chartFrame).toBeDefined();
  expect((chartFrame?.data.spec as { type: string }).type).toBe("bar");
});

test("on error: error event emitted, final NOT emitted, meta still first", async () => {
  const errorClient: IBedrockAgentClient = {
    async *stream() {
      throw new Error("QUERY_TIMEOUT: Athena exceeded 30s");
    },
  };
  const frames: Array<{ type: string; data: Record<string, unknown> }> = [];
  for await (const raw of buildSseEvents("test", "rpt-err-000000", errorClient)) {
    const lines = raw.trimEnd().split("\n");
    frames.push({
      type: lines[0].replace("event: ", ""),
      data: JSON.parse(lines[1].replace("data: ", "")) as Record<string, unknown>,
    });
  }
  const types = frames.map((f) => f.type);
  expect(types[0]).toBe("meta");
  expect(types[types.length - 1]).toBe("error");
  expect(types).not.toContain("final");
});

test("meta timestamp is UTC ISO8601", async () => {
  const frames = await collect("test question", []);
  const meta = frames.find((f) => f.type === "meta");
  expect(meta?.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test("final completedAt is UTC ISO8601", async () => {
  const frames = await collect("test question", FULL_MOCK_EVENTS);
  const final = frames.find((f) => f.type === "final");
  expect(final?.data.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

// ???? Bug fixes ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

test("finalResponse step emits progress with step 'finalizing'", async () => {
  const frames = await collect("q", MOCK_WITH_FINAL_RESPONSE);
  const finalizing = frames.find(
    (f) => f.type === "progress" && f.data.step === "finalizing"
  );
  expect(finalizing).toBeDefined();
});

test("finalResponse step does NOT map to buildChart", async () => {
  const frames = await collect("q", MOCK_WITH_FINAL_RESPONSE);
  const wrongLabel = frames.find(
    (f) => f.type === "progress" && f.data.step === "buildChart" && f.data.message === "Agent: finalResponse"
  );
  expect(wrongLabel).toBeUndefined();
});

test("invalid JSON from action group emits PARSE_ERROR and no final", async () => {
  const frames = await collect("q", [
    { type: "actionGroupOutput", actionGroup: "query", output: "not-valid-json" },
  ]);
  const types = frames.map((f) => f.type);
  expect(types[0]).toBe("meta");
  expect(types[types.length - 1]).toBe("error");
  expect(types).not.toContain("final");
  expect(frames.find((f) => f.type === "error")?.data.code).toBe("PARSE_ERROR");
});

test("query action group structured error is surfaced as SSE error and stream stops", async () => {
  const frames = await collect("q", [
    {
      type: "actionGroupOutput",
      actionGroup: "query",
      output: JSON.stringify({
        version: "v1",
        error: {
          code: "ATHENA_FAILED",
          message: "Access denied to Athena output bucket.",
          retryable: false,
          actionGroup: "query",
        },
      }),
    },
  ]);
  const types = frames.map((f) => f.type);
  const error = frames.find((f) => f.type === "error");
  expect(types[0]).toBe("meta");
  expect(types[types.length - 1]).toBe("error");
  expect(types).not.toContain("final");
  expect(error?.data.code).toBe("ATHENA_FAILED");
});

test("analysis action group structured error forwards code and message", async () => {
  const frames = await collect("q", [
    {
      type: "actionGroupOutput",
      actionGroup: "analysis",
      output: JSON.stringify({
        version: "v1",
        error: {
          code: "DELTA_INVALID_INPUT",
          message: "baseline and comparison dimensions mismatch",
          retryable: false,
          actionGroup: "analysis",
        },
      }),
    },
  ]);
  const error = frames.find((f) => f.type === "error");
  expect(error?.data.code).toBe("DELTA_INVALID_INPUT");
  expect(error?.data.message).toBe("baseline and comparison dimensions mismatch");
});

test("query action group lambda crash payload is surfaced as ACTION_GROUP_CRASH", async () => {
  const frames = await collect("q", [
    {
      type: "actionGroupOutput",
      actionGroup: "query",
      output: JSON.stringify({
        errorMessage: "Task timed out after 30.03 seconds",
        errorType: "Sandbox.TimedOut",
      }),
    },
  ]);
  const types = frames.map((f) => f.type);
  const error = frames.find((f) => f.type === "error");
  expect(types[0]).toBe("meta");
  expect(types[types.length - 1]).toBe("error");
  expect(types).not.toContain("final");
  expect(error?.data.code).toBe("ACTION_GROUP_CRASH");
  expect(error?.data.message).toBe("Sandbox.TimedOut: Task timed out after 30.03 seconds");
});

test("analysis action group lambda crash payload is surfaced as ACTION_GROUP_CRASH", async () => {
  const frames = await collect("q", [
    {
      type: "actionGroupOutput",
      actionGroup: "analysis",
      output: JSON.stringify({
        errorMessage: "Expecting property name enclosed in double quotes: line 1 column 3 (char 2)",
        errorType: "JSONDecodeError",
      }),
    },
  ]);
  const types = frames.map((f) => f.type);
  const error = frames.find((f) => f.type === "error");
  expect(types[0]).toBe("meta");
  expect(types[types.length - 1]).toBe("error");
  expect(types).not.toContain("final");
  expect(error?.data.code).toBe("ACTION_GROUP_CRASH");
  expect(error?.data.message).toBe(
    "JSONDecodeError: Expecting property name enclosed in double quotes: line 1 column 3 (char 2)"
  );
});

test("stream with no table data and no agent summary emits NO_DATA error and no final", async () => {
  const frames = await collect("q", []);
  const types = frames.map((f) => f.type);
  expect(types[types.length - 1]).toBe("error");
  expect(types).not.toContain("final");
  expect(frames.find((f) => f.type === "error")?.data.code).toBe("NO_DATA");
});

test("stream with no table data but with agent summary emits UNSUPPORTED_METRIC error and no final", async () => {
  const frames = await collect("q", [{ type: "chunk", text: "sorry, unsupported metric request" }]);
  const types = frames.map((f) => f.type);
  const error = frames.find((f) => f.type === "error");
  expect(types[types.length - 1]).toBe("error");
  expect(types).not.toContain("final");
  expect(error?.data.code).toBe("UNSUPPORTED_METRIC");
  expect(error?.data.message).toBe("sorry, unsupported metric request");
});

test("chunk text is accumulated in final.agentSummary", async () => {
  const frames = await collect("q", FULL_MOCK_EVENTS);
  const final = frames.find((f) => f.type === "final");
  expect(final?.data.agentSummary).toBe("Here are your results.");
});

test("chunk events from agent are forwarded as SSE chunk frames", async () => {
  const frames = await collect("test", [{ type: "chunk", text: "Here is the analysis." }]);
  const chunkFrame = frames.find((f) => f.type === "chunk");
  expect(chunkFrame).toBeDefined();
  expect(chunkFrame?.data.text).toBe("Here is the analysis.");
  expect(chunkFrame?.data.version).toBe("v1");
});

test("returnControl without auto-approve emits APPROVAL_REQUIRED", async () => {
  const frames = await collect("q", [
    { type: "returnControl", invocationId: "inv-1", inputCount: 1 },
  ]);
  const error = frames.find((f) => f.type === "error");
  expect(error?.data.code).toBe("APPROVAL_REQUIRED");
  expect(frames.map((f) => f.type)).not.toContain("final");
});

test("returnControl with auto-approve emits approval progress and succeeds", async () => {
  const mockClient: IBedrockAgentClient = {
    async *stream() {
      yield { type: "returnControl", invocationId: "inv-1", inputCount: 1 };
      yield {
        type: "actionGroupOutput",
        actionGroup: "query",
        output: JSON.stringify({ rows: [{ a: 1 }], rowCount: 1, truncated: false }),
      };
    },
  };
  const frames: Array<{ type: string; data: Record<string, unknown> }> = [];
  for await (const raw of buildSseEvents("q", "rpt-auto-000000", mockClient, true)) {
    const lines = raw.trimEnd().split("\n");
    frames.push({
      type: lines[0].replace("event: ", ""),
      data: JSON.parse(lines[1].replace("data: ", "")) as Record<string, unknown>,
    });
  }
  expect(
    frames.find((f) => f.type === "progress" && f.data.step === "approval")?.data.message
  ).toBe("Auto-approved 1 action(s).");
  expect(frames.map((f) => f.type)).toContain("final");
});

test("SCHEMA_VIOLATION from query emits progress and does NOT terminate stream", async () => {
  // Simulates: buildSQL called with malformed filters ??SCHEMA_VIOLATION
  // Bedrock receives the error and responds with an explanation (chunk text)
  const frames = await collect("q", [
    {
      type: "actionGroupOutput",
      actionGroup: "query",
      output: JSON.stringify({
        version: "v1",
        error: {
          code: "SCHEMA_VIOLATION",
          message: "Each filter must be an object.",
          retryable: false,
          actionGroup: "query",
        },
      }),
    },
    { type: "chunk", text: "??ш낄援???嶺뚮Ĳ?뉛쭛??????筌?? ????깅떋 ?釉뚰?????????⑤８?????덊렡." },
  ]);

  // 1. SCHEMA_VIOLATION must NOT appear as an SSE error event
  expect(frames.some((f) => f.type === "error" && f.data.code === "SCHEMA_VIOLATION")).toBe(false);

  // 2. A progress event must carry the error detail
  const errorProgress = frames.find(
    (f) => f.type === "progress" && typeof f.data.message === "string" &&
      f.data.message.includes("Each filter must be an object.")
  );
  expect(errorProgress).toBeDefined();

  // 3. Stream ends with UNSUPPORTED_METRIC (no table data, but agent summary present)
  const lastFrame = frames[frames.length - 1];
  expect(lastFrame.type).toBe("error");
  expect(lastFrame.data.code).toBe("UNSUPPORTED_METRIC");
});

test("parseRequestPayload rejects malformed JSON request bodies", () => {
  expect(parseRequestPayload({ body: "{" })).toEqual({
    ok: false,
    statusCode: 400,
    body: JSON.stringify({ error: "Invalid JSON body." }),
  });
});

test("parseRequestPayload rejects empty questions", () => {
  expect(parseRequestPayload({ body: JSON.stringify({ question: "   " }) })).toEqual({
    ok: false,
    statusCode: 400,
    body: JSON.stringify({ error: "question is required." }),
  });
});

test("parseRequestPayload trims valid questions", () => {
  expect(parseRequestPayload({ body: JSON.stringify({ question: "  hello  " }) })).toEqual({
    ok: true,
    payload: { question: "hello" },
  });
});

test("parseRequestPayload accepts optional autoApproveActions", () => {
  expect(
    parseRequestPayload({
      body: JSON.stringify({ question: "hello", autoApproveActions: false }),
    })
  ).toEqual({
    ok: true,
    payload: { question: "hello", autoApproveActions: false },
  });
});

test("parseRequestPayload rejects non-boolean autoApproveActions", () => {
  expect(
    parseRequestPayload({
      body: JSON.stringify({ question: "hello", autoApproveActions: "yes" }),
    })
  ).toEqual({
    ok: false,
    statusCode: 400,
    body: JSON.stringify({ error: "autoApproveActions must be a boolean." }),
  });
});

test("resolveAutoApproveActions defaults to true", () => {
  delete process.env.BEDROCK_AUTO_APPROVE_ACTIONS;
  expect(resolveAutoApproveActions()).toBe(true);
});

test("resolveAutoApproveActions respects client override", () => {
  process.env.BEDROCK_AUTO_APPROVE_ACTIONS = "false";
  expect(resolveAutoApproveActions(true)).toBe(true);
  expect(resolveAutoApproveActions(false)).toBe(false);
  delete process.env.BEDROCK_AUTO_APPROVE_ACTIONS;
});

test("resolveAutoApproveActions reads explicit false env", () => {
  process.env.BEDROCK_AUTO_APPROVE_ACTIONS = "false";
  expect(resolveAutoApproveActions()).toBe(false);
  delete process.env.BEDROCK_AUTO_APPROVE_ACTIONS;
});

test("unsupported questions short-circuit before Bedrock stream", async () => {
  const stream = jest.fn(async function* () {
    yield { type: "chunk", text: "should not run" } as AgentEvent;
  });
  const mockClient: IBedrockAgentClient = { stream };

  const frames: Array<{ type: string; data: Record<string, unknown> }> = [];
  for await (const raw of buildSseEvents("\uC9C0\uB09C\uC8FC OS\uBCC4 \uC124\uCE58 \uBE44\uC911\uC744 \uBCF4\uC5EC\uC918", "rpt-unsupported-000000", mockClient)) {
    const lines = raw.trimEnd().split("\n");
    frames.push({
      type: lines[0].replace("event: ", ""),
      data: JSON.parse(lines[1].replace("data: ", "")) as Record<string, unknown>,
    });
  }

  expect(stream).not.toHaveBeenCalled();
  expect(frames[frames.length - 1]).toMatchObject({
    type: "error",
    data: { code: "UNSUPPORTED_METRIC" },
  });
});

test("schema ask-back chunk is rewritten into dt guidance", async () => {
  const frames = await collect("\uCD5C\uADFC 4\uC8FC\uAC04 \uC804\uCCB4 \uC138\uC158 \uCD94\uC774\uB97C \uBCF4\uC5EC\uC918", [
    {
      type: "chunk",
      text: "\uC8C4\uC1A1\uD569\uB2C8\uB2E4. \uB0A0\uC9DC \uAD00\uB828 \uCEEC\uB7FC \uC774\uB984\uC744 \uC815\uD655\uD788 \uC54C\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC815\uD655\uD55C \uCEEC\uB7FC\uBA85\uC744 \uC54C\uB824\uC8FC\uC138\uC694.",
    },
  ]);

  const lastFrame = frames[frames.length - 1];
  expect(lastFrame.type).toBe("error");
  expect(lastFrame.data.code).toBe("UNSUPPORTED_METRIC");
  expect(lastFrame.data.message).toContain("dt");
});

test("deterministic fallback fulfills install single KPI requests", async () => {
  const invoker: IActionLambdaInvoker = {
    invoke: jest.fn(async (invocation) => {
      if (invocation.actionGroup === "query") {
        return {
          actionGroup: "query",
          functionName: "executeAthenaQuery",
          result: { rows: [{ dt: "2024-11-30", installs: 59 }], rowCount: 1, truncated: false },
        };
      }
      throw new Error("viz should not be called for single KPI fallback");
    }),
  };
  setDeterministicFallbackInvoker(invoker);

  const result = await tryDeterministicFulfillment(
    "\uCD5C\uADFC \uC9D1\uACC4\uC77C Google Ads \uC124\uCE58 \uC218\uB97C \uBCF4\uC5EC\uC918",
    preprocessQuestion("\uCD5C\uADFC \uC9D1\uACC4\uC77C Google Ads \uC124\uCE58 \uC218\uB97C \uBCF4\uC5EC\uC918")
  );

  expect(result?.rowCount).toBe(1);
  expect(result?.chartSpec).toBeUndefined();
});
test("deterministic fallback fulfills acquisition source ranking requests", async () => {
  const invoker: IActionLambdaInvoker = {
    invoke: jest.fn(async (invocation) => {
      if (invocation.actionGroup === "query") {
        return {
          actionGroup: "query",
          functionName: "executeAthenaQuery",
          result: {
            rows: [
              { source: "google", total_users: 58391 },
              { source: "facebook", total_users: 17363 },
            ],
            rowCount: 2,
            truncated: false,
          },
        };
      }
      return {
        actionGroup: "viz",
        functionName: "buildChartSpec",
        result: { spec: { type: "bar", xAxis: "source", series: [{ metric: "total_users", label: "Total Users" }], data: [] } },
      };
    }),
  };
  setDeterministicFallbackInvoker(invoker);

  const result = await tryDeterministicFulfillment(
    "2024\uB144 11\uC6D4 \uC720\uC785\uC6D0\uBCC4 \uC0AC\uC6A9\uC790 \uC218 \uC21C\uC704 \uC815\uB9AC\uD574\uC918",
    preprocessQuestion("2024\uB144 11\uC6D4 \uC720\uC785\uC6D0\uBCC4 \uC0AC\uC6A9\uC790 \uC218 \uC21C\uC704 \uC815\uB9AC\uD574\uC918")
  );

  expect(result?.rowCount).toBe(2);
  expect((result?.chartSpec as { type: string }).type).toBe("bar");
});

test("deterministic fallback fulfills acquisition medium share requests", async () => {
  const invoker: IActionLambdaInvoker = {
    invoke: jest.fn(async (invocation) => {
      if (invocation.actionGroup === "query") {
        const sql = invocation.parameters?.find((parameter: { name?: string; value?: string }) => parameter.name === "sql")?.value ?? "";
        if (sql.includes("SELECT dt, MAX(sessions) AS sessions")) {
          return {
            actionGroup: "query",
            functionName: "executeAthenaQuery",
            result: {
              rows: [{ dt: "2024-11-30", sessions: 100161 }],
              rowCount: 1,
              truncated: false,
            },
          };
        }
        return {
          actionGroup: "query",
          functionName: "executeAthenaQuery",
          result: {
            rows: [
              { medium: "cpc", total_revenue: 4503663.87 },
              { medium: "organic", total_revenue: 3743094.95 },
            ],
            rowCount: 2,
            truncated: false,
          },
        };
      }
      return {
        actionGroup: "viz",
        functionName: "buildChartSpec",
        result: { spec: { type: "pie", xAxis: "medium", series: [{ metric: "total_revenue", label: "Total Revenue" }], data: [] } },
      };
    }),
  };
  setDeterministicFallbackInvoker(invoker);

  const result = await tryDeterministicFulfillment(
    "\uC9C0\uB09C\uC8FC \uB9E4\uCCB4\uBCC4 \uB9E4\uCD9C \uAD6C\uC131\uBE44\uB97C \uB3C4\uB11B\uCC28\uD2B8\uB85C \uD55C\uB208\uC5D0 \uBCF4\uACE0 \uC2F6\uC5B4",
    preprocessQuestion("\uC9C0\uB09C\uC8FC \uB9E4\uCCB4\uBCC4 \uB9E4\uCD9C \uAD6C\uC131\uBE44\uB97C \uB3C4\uB11B\uCC28\uD2B8\uB85C \uD55C\uB208\uC5D0 \uBCF4\uACE0 \uC2F6\uC5B4")
  );

  expect(result?.rowCount).toBe(2);
  expect((result?.chartSpec as { type: string }).type).toBe("pie");
});


test("deterministic fallback fulfills purchase event ranking requests", async () => {
  const invoker: IActionLambdaInvoker = {
    invoke: jest.fn(async (invocation) => {
      if (invocation.actionGroup === "query") {
        return {
          actionGroup: "query",
          functionName: "executeAthenaQuery",
          result: {
            rows: [
              { media_source: "Organic", event_count: 129 },
              { media_source: "Google Ads", event_count: 97 },
            ],
            rowCount: 2,
            truncated: false,
          },
        };
      }
      return {
        actionGroup: "viz",
        functionName: "buildChartSpec",
        result: { spec: { type: "bar", xAxis: "media_source", series: [{ metric: "event_count", label: "Event Count" }], data: [] } },
      };
    }),
  };
  setDeterministicFallbackInvoker(invoker);

  const result = await tryDeterministicFulfillment(
    "2024\uB144 11\uC6D4 \uB9E4\uCCB4 \uC18C\uC2A4\uBCC4 purchase \uC774\uBCA4\uD2B8 \uC218\uB97C \uB9C9\uB300\uCC28\uD2B8\uB85C \uBCF4\uC5EC\uC918",
    preprocessQuestion("2024\uB144 11\uC6D4 \uB9E4\uCCB4 \uC18C\uC2A4\uBCC4 purchase \uC774\uBCA4\uD2B8 \uC218\uB97C \uB9C9\uB300\uCC28\uD2B8\uB85C \uBCF4\uC5EC\uC918")
  );

  expect(result?.rowCount).toBe(2);
  expect((result?.chartSpec as { type: string }).type).toBe("bar");
});

test("deterministic fallback suppresses chart generation for empty cohort retention results", async () => {
  const invoker: IActionLambdaInvoker = {
    invoke: jest.fn(async (invocation) => {
      if (invocation.actionGroup === "query") {
        return {
          actionGroup: "query",
          functionName: "executeAthenaQuery",
          result: { rows: [], rowCount: 0, truncated: false },
        };
      }
      throw new Error("viz should not be called for empty cohort no-data fallback");
    }),
  };
  setDeterministicFallbackInvoker(invoker);

  const result = await tryDeterministicFulfillment(
    "2024\uB144 11\uC6D4 \uB9E4\uCCB4 \uC18C\uC2A4\uBCC4 Day 7 retention \uBE44\uC728\uC744 \uBCF4\uC5EC\uC918",
    preprocessQuestion("2024\uB144 11\uC6D4 \uB9E4\uCCB4 \uC18C\uC2A4\uBCC4 Day 7 retention \uBE44\uC728\uC744 \uBCF4\uC5EC\uC918")
  );

  expect(result?.rowCount).toBe(0);
  expect(result?.chartSpec).toBeUndefined();
  const queryCall = (invoker.invoke as jest.Mock).mock.calls.find(([invocation]) => invocation.actionGroup === "query");
  expect(queryCall?.[0].parameters?.find((parameter: { name?: string; value?: string }) => parameter.name === "sql")?.value).toContain("cohort_day = 7");
});

test("deterministic fallback normalizes null-only cohort trend rows into no-data", async () => {
  const invoker: IActionLambdaInvoker = {
    invoke: jest.fn(async (invocation) => {
      if (invocation.actionGroup === "query") {
        return {
          actionGroup: "query",
          functionName: "executeAthenaQuery",
          result: { rows: [{ cohort_day: null, retention_rate: null }], rowCount: 1, truncated: false },
        };
      }
      throw new Error("viz should not be called for null-only cohort trend fallback");
    }),
  };
  setDeterministicFallbackInvoker(invoker);

  const result = await tryDeterministicFulfillment(
    "2024\uB144 11\uC6D4 \uCF54\uD638\uD2B8 \uB370\uC774\uBCC4 retention \uD750\uB984\uC744 \uB77C\uC778\uCC28\uD2B8\uB85C \uBCF4\uC5EC\uC918",
    preprocessQuestion("2024\uB144 11\uC6D4 \uCF54\uD638\uD2B8 \uB370\uC774\uBCC4 retention \uD750\uB984\uC744 \uB77C\uC778\uCC28\uD2B8\uB85C \uBCF4\uC5EC\uC918")
  );

  expect(result?.rowCount).toBe(0);
  expect(result?.rows).toEqual([]);
  expect(result?.chartSpec).toBeUndefined();
});

test("deterministic fallback fulfills purchase event revenue trend requests", async () => {
  const invoker: IActionLambdaInvoker = {
    invoke: jest.fn(async (invocation) => {
      if (invocation.actionGroup === "query") {
        return {
          actionGroup: "query",
          functionName: "executeAthenaQuery",
          result: {
            rows: [
              { dt: "2024-11-29", event_revenue: 2890000 },
              { dt: "2024-11-30", event_revenue: 1785000 },
            ],
            rowCount: 2,
            truncated: false,
          },
        };
      }
      return {
        actionGroup: "viz",
        functionName: "buildChartSpec",
        result: { spec: { type: "line", xAxis: "dt", series: [{ metric: "event_revenue", label: "Event Revenue" }], data: [] } },
      };
    }),
  };
  setDeterministicFallbackInvoker(invoker);

  const result = await tryDeterministicFulfillment(
    "2024\uB144 11\uC6D4 purchase \uC774\uBCA4\uD2B8 \uB9E4\uCD9C \uCD94\uC774\uB97C \uB77C\uC778\uCC28\uD2B8\uB85C \uC54C\uB824\uC918",
    preprocessQuestion("2024\uB144 11\uC6D4 purchase \uC774\uBCA4\uD2B8 \uB9E4\uCD9C \uCD94\uC774\uB97C \uB77C\uC778\uCC28\uD2B8\uB85C \uC54C\uB824\uC918")
  );

  expect(result?.rowCount).toBe(2);
  expect((result?.chartSpec as { type: string }).type).toBe("line");
});
