import {
  inferVizPromptHints,
  prepareActionParameters,
  type ActionParameter,
} from "../src/action-lambda-invoker";

function getParameterValue(parameters: ActionParameter[], name: string): string | undefined {
  return parameters.find((parameter) => parameter.name === name)?.value;
}

test("prepareActionParameters preserves non-viz invocations", () => {
  const original = [{ name: "sql", type: "string", value: "SELECT 1" }];

  const result = prepareActionParameters({
    actionGroup: "query",
    functionName: "buildSQL",
    parameters: original,
    userPrompt: "show sessions by source",
  });

  expect(result).toEqual(original);
});

test("prepareActionParameters forces explicit pie chart requests for viz", () => {
  const result = prepareActionParameters({
    actionGroup: "viz",
    functionName: "buildChartSpec",
    parameters: [
      { name: "chartType", type: "string", value: "bar" },
      { name: "xAxis", type: "string", value: "channel" },
      { name: "yAxis", type: "array", value: '["sessions"]' },
    ],
    userPrompt: "show source share as a pie chart",
  });

  expect(getParameterValue(result, "chartType")).toBe("pie");
  expect(getParameterValue(result, "xAxis")).toBe("channel");
});

test("prepareActionParameters injects auto hints for share-style questions", () => {
  const result = prepareActionParameters({
    actionGroup: "viz",
    functionName: "buildChartSpec",
    parameters: [
      { name: "chartType", type: "string", value: "bar" },
      { name: "xAxis", type: "string", value: "channel" },
      { name: "yAxis", type: "array", value: '["sessions"]' },
    ],
    userPrompt: "show source share",
  });

  expect(getParameterValue(result, "chartType")).toBe("auto");
  expect(getParameterValue(result, "questionIntent")).toBe("composition");
  expect(getParameterValue(result, "compositionMode")).toBe("true");
  expect(getParameterValue(result, "shareMode")).toBe("true");
});

test("prepareActionParameters keeps generic composition separate from share mode", () => {
  const result = prepareActionParameters({
    actionGroup: "viz",
    functionName: "buildChartSpec",
    parameters: [
      { name: "chartType", type: "string", value: "bar" },
      { name: "xAxis", type: "string", value: "source" },
      { name: "yAxis", type: "array", value: '["sessions","installs"]' },
    ],
    userPrompt: "show source composition",
  });

  expect(getParameterValue(result, "chartType")).toBe("auto");
  expect(getParameterValue(result, "compositionMode")).toBe("true");
  expect(getParameterValue(result, "shareMode")).toBe("false");
});

test("inferVizPromptHints detects explicit chart requests and auto hints", () => {
  expect(inferVizPromptHints("show this as a pie chart").explicitChartType).toBe("pie");
  expect(inferVizPromptHints("show the weekly trend")).toMatchObject({
    questionIntent: "time_series",
    isTimeSeries: true,
  });
  expect(inferVizPromptHints("show the raw table data")).toMatchObject({
    explicitChartType: "table",
    questionIntent: "raw_detail",
  });
});
