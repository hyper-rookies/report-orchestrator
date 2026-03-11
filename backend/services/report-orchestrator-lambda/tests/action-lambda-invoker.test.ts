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
    userPrompt: "파이차트로 보여줘",
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
    userPrompt: "채널 비중을 파이차트로 보여줘",
  });

  expect(getParameterValue(result, "chartType")).toBe("pie");
  expect(getParameterValue(result, "xAxis")).toBe("channel");
});

test("prepareActionParameters switches viz calls into auto mode with prompt-derived hints", () => {
  const result = prepareActionParameters({
    actionGroup: "viz",
    functionName: "buildChartSpec",
    parameters: [
      { name: "chartType", type: "string", value: "bar" },
      { name: "xAxis", type: "string", value: "channel" },
      { name: "yAxis", type: "array", value: '["sessions"]' },
    ],
    userPrompt: "채널별 비중 비교를 보여줘",
  });

  expect(getParameterValue(result, "chartType")).toBe("auto");
  expect(getParameterValue(result, "questionIntent")).toBe("comparison");
  expect(getParameterValue(result, "compositionMode")).toBe("true");
  expect(getParameterValue(result, "comparisonMode")).toBe("true");
});

test("inferVizPromptHints detects explicit chart requests and auto hints", () => {
  expect(inferVizPromptHints("pie chart로 보여줘").explicitChartType).toBe("pie");
  expect(inferVizPromptHints("월별 추이를 보여줘")).toMatchObject({
    questionIntent: "time_series",
    isTimeSeries: true,
  });
  expect(inferVizPromptHints("원본 데이터 테이블로 보여줘")).toMatchObject({
    explicitChartType: "table",
    questionIntent: "raw_detail",
  });
});
