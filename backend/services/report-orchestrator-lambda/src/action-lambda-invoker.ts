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
    const payload = JSON.stringify({
      messageVersion: "1.0",
      actionGroup: invocation.actionGroup,
      function: invocation.functionName,
      parameters: invocation.parameters ?? [],
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
