import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Sha256 } from "@aws-crypto/sha256-js";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";

export type ActionParameter = {
  name?: string;
  type?: string;
  value?: string;
};

export type ActionInvocation = {
  actionGroup: string;
  functionName: string;
  parameters?: ActionParameter[];
  userPrompt?: string;
};

export type ActionInvocationResult = {
  actionGroup: string;
  functionName: string;
  result: Record<string, unknown>;
};

export interface IActionLambdaInvoker {
  invoke(invocation: ActionInvocation): Promise<ActionInvocationResult>;
}

const DEFAULT_ACTION_GROUP_FUNCTIONS: Record<string, string> = {
  query: "hyper-intern-m1c-query-lambda",
  analysis: "hyper-intern-m1c-analysis-lambda",
  viz: "hyper-intern-m1c-viz-lambda",
};

export class SignedActionLambdaInvoker implements IActionLambdaInvoker {
  private readonly region: string;
  private readonly signer: SignatureV4;
  private readonly httpHandler: NodeHttpHandler;

  constructor(region = process.env.AWS_REGION ?? "ap-northeast-2") {
    this.region = region;
    this.signer = new SignatureV4({
      service: "lambda",
      region,
      credentials: defaultProvider(),
      sha256: Sha256,
    });
    this.httpHandler = new NodeHttpHandler();
  }

  async invoke(invocation: ActionInvocation): Promise<ActionInvocationResult> {
    const targetFunction = resolveActionLambdaName(invocation.actionGroup);
    const parameters = prepareActionParameters(invocation);
    const payload = JSON.stringify({
      messageVersion: "1.0",
      actionGroup: invocation.actionGroup,
      function: invocation.functionName,
      parameters,
    });

    const unsignedRequest = new HttpRequest({
      protocol: "https:",
      hostname: `lambda.${this.region}.amazonaws.com`,
      method: "POST",
      path: `/2015-03-31/functions/${encodeURIComponent(targetFunction)}/invocations`,
      headers: {
        "content-type": "application/json",
        host: `lambda.${this.region}.amazonaws.com`,
      },
      body: payload,
    });

    const signedRequest = (await this.signer.sign(unsignedRequest)) as HttpRequest;
    const { response } = await this.httpHandler.handle(signedRequest);
    const rawBody = await streamToString(response.body);

    if (response.statusCode !== 200) {
      throw new Error(
        `Action Lambda invoke failed for ${invocation.actionGroup}.${invocation.functionName}: ` +
          `HTTP ${response.statusCode} ${rawBody}`.trim()
      );
    }

    const payloadObj = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    const functionError = response.headers["x-amz-function-error"];
    if (functionError) {
      throw new Error(
        `Action Lambda ${invocation.actionGroup}.${invocation.functionName} returned ${functionError}: ${rawBody}`
      );
    }

    const result = normalizeLambdaResponse(payloadObj);
    return {
      actionGroup: invocation.actionGroup,
      functionName: invocation.functionName,
      result,
    };
  }
}

const EXPLICIT_CHART_PATTERNS: Array<{ chartType: string; pattern: RegExp }> = [
  { chartType: "stackedBar", pattern: /\bstacked\s*bar\b/i },
  { chartType: "stackedBar", pattern: /\bstacked\s*column\b/i },
  { chartType: "stackedBar", pattern: /누적\s*(막대|바|차트|그래프)/i },
  { chartType: "pie", pattern: /\bpie\s*chart\b/i },
  { chartType: "pie", pattern: /\bpie\b/i },
  { chartType: "pie", pattern: /파이\s*차트/i },
  { chartType: "pie", pattern: /도넛\s*차트/i },
  { chartType: "pie", pattern: /원형\s*차트/i },
  { chartType: "line", pattern: /\bline\s*chart\b/i },
  { chartType: "line", pattern: /\bline\b/i },
  { chartType: "line", pattern: /라인\s*차트/i },
  { chartType: "line", pattern: /꺾은선/i },
  { chartType: "table", pattern: /\btable\b/i },
  { chartType: "table", pattern: /테이블/i },
  { chartType: "table", pattern: /표로/i },
  { chartType: "table", pattern: /원본\s*데이터/i },
  { chartType: "bar", pattern: /\bbar\s*chart\b/i },
  { chartType: "bar", pattern: /\bbar\b/i },
  { chartType: "bar", pattern: /바\s*차트/i },
  { chartType: "bar", pattern: /막대\s*(차트|그래프)/i },
];

type VizPromptHints = {
  explicitChartType?: "bar" | "line" | "table" | "pie" | "stackedBar";
  questionIntent:
    | "ranking"
    | "comparison"
    | "composition"
    | "time_series"
    | "raw_detail"
    | "single_kpi"
    | "funnel"
    | "retention"
    | "generic";
  isTimeSeries: boolean;
  compositionMode: boolean;
  comparisonMode: boolean;
  deltaIncluded: boolean;
};

export function prepareActionParameters(invocation: ActionInvocation): ActionParameter[] {
  const parameters = cloneParameters(invocation.parameters);

  if (
    invocation.actionGroup.toLowerCase() !== "viz" ||
    invocation.functionName !== "buildChartSpec"
  ) {
    return parameters;
  }

  const hints = inferVizPromptHints(invocation.userPrompt);
  if (hints.explicitChartType) {
    upsertParameter(parameters, "chartType", "string", hints.explicitChartType);
    return parameters;
  }

  upsertParameter(parameters, "chartType", "string", "auto");
  upsertParameter(parameters, "questionIntent", "string", hints.questionIntent);
  upsertParameter(parameters, "isTimeSeries", "boolean", String(hints.isTimeSeries));
  upsertParameter(parameters, "compositionMode", "boolean", String(hints.compositionMode));
  upsertParameter(parameters, "comparisonMode", "boolean", String(hints.comparisonMode));
  upsertParameter(parameters, "deltaIncluded", "boolean", String(hints.deltaIncluded));

  return parameters;
}

function cloneParameters(parameters?: ActionParameter[]): ActionParameter[] {
  return Array.isArray(parameters) ? parameters.map((parameter) => ({ ...parameter })) : [];
}

function upsertParameter(
  parameters: ActionParameter[],
  name: string,
  type: string,
  value: string
): void {
  const existing = parameters.find((parameter) => parameter.name === name);
  if (existing) {
    existing.type = type;
    existing.value = value;
    return;
  }

  parameters.push({ name, type, value });
}

export function inferVizPromptHints(userPrompt?: string): VizPromptHints {
  const text = userPrompt?.trim() ?? "";
  const explicitChartType = detectExplicitChartType(text);

  const isTimeSeries =
    /\btrend\b/i.test(text) ||
    /\bover\s*time\b/i.test(text) ||
    /\bdaily\b/i.test(text) ||
    /\bweekly\b/i.test(text) ||
    /\bmonthly\b/i.test(text) ||
    /추이|시간\s*흐름|일별|주별|월별/.test(text);
  const compositionMode =
    /\bshare\b/i.test(text) ||
    /\bbreakdown\b/i.test(text) ||
    /\bmix\b/i.test(text) ||
    /\bportion\b/i.test(text) ||
    /비중|구성|브레이크다운|점유율/.test(text);
  const comparisonMode =
    /\bcompare\b/i.test(text) ||
    /\bversus\b/i.test(text) ||
    /\bvs\b/i.test(text) ||
    /비교|대비|전주\s*대비|전월\s*대비/.test(text);
  const deltaIncluded =
    /\bchange\b/i.test(text) ||
    /\bdelta\b/i.test(text) ||
    /\bwow\b/i.test(text) ||
    /\bweek\s*over\s*week\b/i.test(text) ||
    /증가|감소|증감|변화|차이|전주\s*대비|전월\s*대비/.test(text);

  const questionIntent = detectQuestionIntent(text, {
    isTimeSeries,
    compositionMode,
    comparisonMode,
  });

  return {
    explicitChartType,
    questionIntent,
    isTimeSeries,
    compositionMode,
    comparisonMode,
    deltaIncluded,
  };
}

function detectExplicitChartType(
  text: string
): VizPromptHints["explicitChartType"] {
  for (const entry of EXPLICIT_CHART_PATTERNS) {
    if (entry.pattern.test(text)) {
      return entry.chartType as VizPromptHints["explicitChartType"];
    }
  }
  return undefined;
}

function detectQuestionIntent(
  text: string,
  flags: Pick<VizPromptHints, "isTimeSeries" | "compositionMode" | "comparisonMode">
): VizPromptHints["questionIntent"] {
  if (/\braw\s*rows\b/i.test(text) || /\bshow\s+the\s+data\b/i.test(text) || /원본|로우|테이블|데이터\s*보여/.test(text)) {
    return "raw_detail";
  }
  if (/\bfunnel\b/i.test(text) || /퍼널|단계\s*전환율/.test(text)) {
    return "funnel";
  }
  if (/\bretention\b/i.test(text) || /리텐션|잔존율/.test(text)) {
    return "retention";
  }
  if (flags.isTimeSeries) {
    return "time_series";
  }
  if (
    /\btop\b/i.test(text) ||
    /\brank\b/i.test(text) ||
    /\bhighest\b/i.test(text) ||
    /\blowest\b/i.test(text) ||
    /상위|순위|가장\s*높|가장\s*낮/.test(text)
  ) {
    return "ranking";
  }
  if (flags.comparisonMode) {
    return "comparison";
  }
  if (flags.compositionMode) {
    return "composition";
  }
  if (
    /\btotal\b/i.test(text) ||
    /\boverall\b/i.test(text) ||
    /\bone\s+number\b/i.test(text) ||
    /총합|전체|하나의\s*숫자|한\s*줄\s*요약/.test(text)
  ) {
    return "single_kpi";
  }

  return "generic";
}

function resolveActionLambdaName(actionGroup: string): string {
  const normalized = actionGroup.toLowerCase();
  const envKey = `${normalized.toUpperCase()}_ACTION_LAMBDA_NAME`;
  return process.env[envKey] ?? DEFAULT_ACTION_GROUP_FUNCTIONS[normalized] ?? actionGroup;
}

function normalizeLambdaResponse(payloadObj: Record<string, unknown>): Record<string, unknown> {
  if (typeof payloadObj.body === "string") {
    return JSON.parse(payloadObj.body) as Record<string, unknown>;
  }
  if (payloadObj.response && typeof payloadObj.response === "object") {
    const response = payloadObj.response as Record<string, unknown>;
    const functionResponse = response.functionResponse as Record<string, unknown> | undefined;
    const responseBody = functionResponse?.responseBody as Record<string, unknown> | undefined;
    const text = responseBody?.TEXT as { body?: string } | undefined;
    if (typeof text?.body === "string") {
      return JSON.parse(text.body) as Record<string, unknown>;
    }
  }
  return payloadObj;
}

async function streamToString(stream: unknown): Promise<string> {
  if (!stream) return "";
  if (typeof stream === "string") return stream;
  if (stream instanceof Uint8Array) return Buffer.from(stream).toString("utf-8");

  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}
