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
  const frames = await collect("test question", []);
  const final = frames.find((f) => f.type === "final");
  expect(final?.data.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});
