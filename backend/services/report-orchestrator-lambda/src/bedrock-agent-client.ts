import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";

export type AgentEvent =
  | { type: "step"; step: string; detail?: string }
  | { type: "chunk"; text: string }
  | { type: "actionGroupOutput"; actionGroup: string; output: string };

export interface IBedrockAgentClient {
  stream(params: {
    agentId: string;
    agentAliasId: string;
    sessionId: string;
    inputText: string;
  }): AsyncGenerator<AgentEvent>;
}

export class BedrockAgentClient implements IBedrockAgentClient {
  private readonly sdk: BedrockAgentRuntimeClient;

  constructor(sdk?: BedrockAgentRuntimeClient) {
    this.sdk =
      sdk ??
      new BedrockAgentRuntimeClient({
        region: process.env.AWS_REGION ?? "ap-northeast-2",
      });
  }

  async *stream(params: {
    agentId: string;
    agentAliasId: string;
    sessionId: string;
    inputText: string;
  }): AsyncGenerator<AgentEvent> {
    const command = new InvokeAgentCommand({
      agentId: params.agentId,
      agentAliasId: params.agentAliasId,
      sessionId: params.sessionId,
      inputText: params.inputText,
      enableTrace: true,
    });

    const response = await this.sdk.send(command);
    if (!response.completion) return;

    for await (const event of response.completion) {
      if (event.chunk?.bytes) {
        const text = Buffer.from(event.chunk.bytes).toString("utf-8");
        yield { type: "chunk", text };
      }

      const oTrace = event.trace?.trace?.orchestrationTrace;
      if (!oTrace) continue;

      if (oTrace.modelInvocationInput) {
        yield { type: "step", step: "agentThinking" };
      }

      const obs = oTrace.observation;
      if (obs?.actionGroupInvocationOutput) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ag = obs.actionGroupInvocationOutput as any;
        yield {
          type: "actionGroupOutput",
          actionGroup: ag.actionGroupName ?? "unknown",
          output: ag.text ?? "",
        };
      }

      if (obs?.finalResponse?.text) {
        yield { type: "step", step: "finalResponse", detail: obs.finalResponse.text };
      }
    }
  }
}
