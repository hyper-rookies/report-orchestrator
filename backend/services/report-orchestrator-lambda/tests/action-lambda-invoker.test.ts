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

test("inferVizPromptHints handles Korean explicit pie requests", () => {
  expect(
    inferVizPromptHints("\uC9C0\uB09C\uC8FC \uC18C\uC2A4\uBCC4 \uC138\uC158 \uBE44\uC911\uC744 \uD30C\uC774\uCC28\uD2B8\uB85C \uBCF4\uC5EC\uC918")
  ).toMatchObject({
    explicitChartType: "pie",
    questionIntent: "composition",
    compositionMode: true,
    shareMode: true,
  });
});

test("inferVizPromptHints separates Korean composition from share mode", () => {
  expect(
    inferVizPromptHints("\uC9C0\uB09C\uC8FC \uC18C\uC2A4\uBCC4 \uC138\uC158 \uAD6C\uC131\uC744 \uBCF4\uC5EC\uC918")
  ).toMatchObject({
    questionIntent: "composition",
    compositionMode: true,
    shareMode: false,
  });
});

test("inferVizPromptHints detects Korean single KPI questions", () => {
  expect(
    inferVizPromptHints("\uCD5C\uC2E0 \uC9D1\uACC4\uC77C Google Ads \uC124\uCE58 \uC218 \uC54C\uB824\uC918")
  ).toMatchObject({
    questionIntent: "single_kpi",
    compositionMode: false,
    shareMode: false,
    isTimeSeries: false,
  });
});
