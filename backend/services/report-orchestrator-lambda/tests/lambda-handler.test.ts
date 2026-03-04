import { buildSseEvents } from "../src/lambda-handler";
import { AgentEvent, IBedrockAgentClient } from "../src/bedrock-agent-client";

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

// query result + finalResponse step (no viz — chart not required for success)
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

// ── Bug fixes ────────────────────────────────────────────────────────────────

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

test("stream with no table data emits NO_DATA error and no final", async () => {
  const frames = await collect("q", [{ type: "chunk", text: "sorry, no data" }]);
  const types = frames.map((f) => f.type);
  expect(types[types.length - 1]).toBe("error");
  expect(types).not.toContain("final");
  expect(frames.find((f) => f.type === "error")?.data.code).toBe("NO_DATA");
});

test("chunk text is accumulated in final.agentSummary", async () => {
  const frames = await collect("q", FULL_MOCK_EVENTS);
  const final = frames.find((f) => f.type === "final");
  expect(final?.data.agentSummary).toBe("Here are your results.");
});
