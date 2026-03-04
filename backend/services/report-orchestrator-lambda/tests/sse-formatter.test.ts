import { formatSseEvent, generateReportId, utcNow } from "../src/sse-formatter";

describe("formatSseEvent", () => {
  test("produces correct SSE wire format", () => {
    const result = formatSseEvent("meta", { version: "v1", reportId: "rpt-test" });
    expect(result).toBe('event: meta\ndata: {"version":"v1","reportId":"rpt-test"}\n\n');
  });

  test("ends with double newline", () => {
    expect(formatSseEvent("progress", { step: "buildSQL" }).endsWith("\n\n")).toBe(true);
  });

  test("data line is valid JSON", () => {
    const result = formatSseEvent("progress", { version: "v1", step: "buildSQL", message: "test" });
    const dataLine = result.split("\n")[1];
    expect(() => JSON.parse(dataLine.replace("data: ", ""))).not.toThrow();
  });

  test("event line has correct prefix", () => {
    expect(formatSseEvent("final", { version: "v1" }).startsWith("event: final\n")).toBe(true);
  });
});

describe("utcNow", () => {
  test("returns UTC ISO8601 with Z suffix", () => {
    expect(utcNow()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("two calls produce non-decreasing timestamps", () => {
    expect(new Date(utcNow()).getTime()).toBeGreaterThanOrEqual(new Date(utcNow()).getTime() - 10);
  });
});

describe("generateReportId", () => {
  test("matches rpt-YYYYMMDD-xxxxxx pattern", () => {
    expect(generateReportId()).toMatch(/^rpt-\d{8}-[a-f0-9]{6}$/);
  });

  test("two calls produce different IDs", () => {
    expect(generateReportId()).not.toBe(generateReportId());
  });
});
