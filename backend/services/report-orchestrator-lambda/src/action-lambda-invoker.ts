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
  shareMode: boolean;
  comparisonMode: boolean;
  deltaIncluded: boolean;
};

const EXPLICIT_CHART_PATTERNS: Array<{
  chartType: VizPromptHints["explicitChartType"];
  pattern: RegExp;
}> = [
  { chartType: "stackedBar", pattern: /\bstacked\s*bar\b/i },
  { chartType: "stackedBar", pattern: /\bstacked\s*column\b/i },
  { chartType: "stackedBar", pattern: /\uB204\uC801\s*(\uB9C9\uB300|\uBC14|\uCC28\uD2B8|\uADF8\uB798\uD504)/i },
  { chartType: "pie", pattern: /\bpie\s*chart\b/i },
  { chartType: "pie", pattern: /\bdonut\s*chart\b/i },
  { chartType: "pie", pattern: /\bpie\b/i },
  { chartType: "pie", pattern: /\uD30C\uC774\s*\uCC28\uD2B8/i },
  { chartType: "pie", pattern: /\uB3C4\uB11B\s*\uCC28\uD2B8/i },
  { chartType: "pie", pattern: /\uC6D0\uD615\s*\uCC28\uD2B8/i },
  { chartType: "line", pattern: /\bline\s*chart\b/i },
  { chartType: "line", pattern: /\bline\b/i },
  { chartType: "line", pattern: /\uB77C\uC778\s*\uCC28\uD2B8/i },
  { chartType: "line", pattern: /\uAEBE\uC740\uC120/i },
  { chartType: "table", pattern: /\btable\b/i },
  { chartType: "table", pattern: /\uD14C\uC774\uBE14/i },
  { chartType: "table", pattern: /\uD45C\uB85C/i },
  { chartType: "table", pattern: /\uC6D0\uBCF8\s*\uB370\uC774\uD130/i },
  { chartType: "bar", pattern: /\bbar\s*chart\b/i },
  { chartType: "bar", pattern: /\bbar\b/i },
  { chartType: "bar", pattern: /\uBC14\s*\uCC28\uD2B8/i },
  { chartType: "bar", pattern: /\uB9C9\uB300\s*(\uCC28\uD2B8|\uADF8\uB798\uD504)/i },
];

const TIME_SERIES_PATTERNS = [
  /\btrend\b/i,
  /\bover\s*time\b/i,
  /\bdaily\b/i,
  /\bweekly\b/i,
  /\bmonthly\b/i,
  /\uCD94\uC774/i,
  /\uD750\uB984/i,
  /\uC77C\uAC04/i,
  /\uC8FC\uAC04/i,
  /\uC6D4\uAC04/i,
];

const SHARE_PATTERNS = [
  /\bshare\b/i,
  /\bportion\b/i,
  /\bratio\b/i,
  /\bpercent(?:age)?\b/i,
  /\uBE44\uC911/i,
  /\uAD6C\uC131\uBE44/i,
  /\uC810\uC720\uC728/i,
  /\uBE44\uC728/i,
  /\uBC31\uBD84\uC728/i,
];

const COMPOSITION_PATTERNS = [
  /\bbreakdown\b/i,
  /\bmix\b/i,
  /\bcomposition\b/i,
  /\uAD6C\uC131/i,
  /\uBE0C\uB808\uC774\uD06C\uB2E4\uC6B4/i,
  /\uBBF9\uC2A4/i,
];
const COMPARISON_PATTERNS = [/\bcompare\b/i, /\bversus\b/i, /\bvs\b/i, /\uBE44\uAD50/i, /\uB300\uBE44/i];

const DELTA_PATTERNS = [
  /\bchange\b/i,
  /\bdelta\b/i,
  /\bwow\b/i,
  /\bweek\s*over\s*week\b/i,
  /\uC99D\uAC00/i,
  /\uAC10\uC18C/i,
  /\uC99D\uAC10/i,
  /\uBCC0\uD654/i,
  /\uCC28\uC774/i,
  /\uC804\uC8FC\s*\uB300\uBE44/i,
  /\uC804\uC6D4\s*\uB300\uBE44/i,
];

const RAW_DETAIL_PATTERNS = [
  /\braw\s*rows\b/i,
  /\braw\s*table\b/i,
  /\bshow\s+the\s+data\b/i,
  /\uC6D0\uBCF8/i,
  /\uB85C\uC6B0/i,
  /\uD14C\uC774\uBE14\s*\uB370\uC774\uD130/i,
];

const FUNNEL_PATTERNS = [/\bfunnel\b/i, /\uD37C\uB110/i, /\uB2E8\uACC4\s*\uC804\uD658/i];
const RETENTION_PATTERNS = [/\bretention\b/i, /\uB9AC\uD150\uC158/i, /\uC794\uC874/i];
const RANKING_PATTERNS = [
  /\btop\b/i,
  /\brank\b/i,
  /\bhighest\b/i,
  /\blowest\b/i,
  /\uC0C1\uC704/i,
  /\uC21C\uC704/i,
  /\uAC00\uC7A5\s*\uB192/i,
  /\uAC00\uC7A5\s*\uB0AE/i,
];
const SINGLE_KPI_PATTERNS = [
  /\btotal\b/i,
  /\boverall\b/i,
  /\bone\s+number\b/i,
  /\uCD1D\uD569/i,
  /\uD569\uACC4/i,
  /\uC804\uCCB4/i,
  /\uD558\uB098\uC758?\s*\uC22B\uC790/i,
  /\uC694\uC57D/i,
  /\uBA87\s*\uAC74/i,
  /\uBA87\s*\uAC1C/i,
  /\uC5BC\uB9C8/i,
  /\uC54C\uB824\uC918/i,
  /\uCD5C\uC2E0\s*(\uB0A0\uC9DC|\uC9D1\uACC4\uC77C)/i,
  /\uCD5C\uADFC\s*\uC9D1\uACC4\uC77C/i,
];

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
  upsertParameter(parameters, "shareMode", "boolean", String(hints.shareMode));
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

  const isTimeSeries = matchesAnyPattern(text, TIME_SERIES_PATTERNS);
  const shareMode = matchesAnyPattern(text, SHARE_PATTERNS);
  const compositionMode = shareMode || matchesAnyPattern(text, COMPOSITION_PATTERNS);
  const comparisonMode = matchesAnyPattern(text, COMPARISON_PATTERNS);
  const deltaIncluded = matchesAnyPattern(text, DELTA_PATTERNS);

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
    shareMode,
    comparisonMode,
    deltaIncluded,
  };
}

function detectExplicitChartType(text: string): VizPromptHints["explicitChartType"] {
  for (const entry of EXPLICIT_CHART_PATTERNS) {
    if (entry.pattern.test(text)) {
      return entry.chartType;
    }
  }
  return undefined;
}

function detectQuestionIntent(
  text: string,
  flags: Pick<VizPromptHints, "isTimeSeries" | "compositionMode" | "comparisonMode">
): VizPromptHints["questionIntent"] {
  if (matchesAnyPattern(text, RAW_DETAIL_PATTERNS)) {
    return "raw_detail";
  }
  if (matchesAnyPattern(text, FUNNEL_PATTERNS)) {
    return "funnel";
  }
  if (matchesAnyPattern(text, RETENTION_PATTERNS)) {
    return "retention";
  }
  if (flags.isTimeSeries) {
    return "time_series";
  }
  if (matchesAnyPattern(text, RANKING_PATTERNS)) {
    return "ranking";
  }
  if (flags.comparisonMode) {
    return "comparison";
  }
  if (flags.compositionMode) {
    return "composition";
  }
  if (matchesAnyPattern(text, SINGLE_KPI_PATTERNS)) {
    return "single_kpi";
  }
  return "generic";
}

function matchesAnyPattern(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
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
