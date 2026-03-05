import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  type InvocationInputMember,
  type SessionState,
} from "@aws-sdk/client-bedrock-agent-runtime";
import {
  IActionLambdaInvoker,
  SignedActionLambdaInvoker,
  type ActionInvocationResult,
} from "./action-lambda-invoker";

export type AgentEvent =
  | { type: "step"; step: string; detail?: string }
  | { type: "chunk"; text: string }
  | { type: "actionGroupOutput"; actionGroup: string; output: string }
  | { type: "returnControl"; invocationId: string; inputCount: number };

export interface IBedrockAgentClient {
  stream(params: {
    agentId: string;
    agentAliasId: string;
    sessionId: string;
    inputText: string;
    autoApproveActions?: boolean;
  }): AsyncGenerator<AgentEvent>;
}

export class BedrockAgentClient implements IBedrockAgentClient {
  private readonly sdk: BedrockAgentRuntimeClient;
  private readonly actionInvoker: IActionLambdaInvoker;

  constructor(sdk?: BedrockAgentRuntimeClient, actionInvoker?: IActionLambdaInvoker) {
    this.sdk =
      sdk ??
      new BedrockAgentRuntimeClient({
        region: process.env.AWS_REGION ?? "ap-northeast-2",
      });
    this.actionInvoker = actionInvoker ?? new SignedActionLambdaInvoker();
  }

  async *stream(params: {
    agentId: string;
    agentAliasId: string;
    sessionId: string;
    inputText: string;
    autoApproveActions?: boolean;
  }): AsyncGenerator<AgentEvent> {
    let sessionState: SessionState | undefined;

    for (;;) {
      const command = new InvokeAgentCommand({
        agentId: params.agentId,
        agentAliasId: params.agentAliasId,
        sessionId: params.sessionId,
        inputText: params.inputText,
        enableTrace: true,
        ...(sessionState ? { sessionState } : {}),
      });

      const response = await this.sdk.send(command);
      if (!response.completion) return;

      // AWS SDK puts actionGroupName in invocationInput (before the call),
      // not in actionGroupInvocationOutput (after the call). Carry it forward.
      let pendingActionGroupName = "unknown";
      let shouldContinue = false;

      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          const text = Buffer.from(event.chunk.bytes).toString("utf-8");
          yield { type: "chunk", text };
        }

        if (event.returnControl) {
          const invocationId = event.returnControl.invocationId ?? "";
          const invocationInputs = event.returnControl.invocationInputs ?? [];

          yield {
            type: "returnControl",
            invocationId,
            inputCount: invocationInputs.length,
          };

          if (!params.autoApproveActions || !invocationId || invocationInputs.length === 0) {
            return;
          }

          const invocationResults = [];
          for (const invocationInput of invocationInputs) {
            const invocationResult = await this.invokeAction(invocationInput);
            invocationResults.push(invocationResult);
            yield {
              type: "actionGroupOutput",
              actionGroup: invocationResult.actionGroup,
              output: JSON.stringify(invocationResult.result),
            };
          }

          sessionState = {
            invocationId,
            returnControlInvocationResults: invocationResults.map(toApprovalResult),
          };
          shouldContinue = true;
          break;
        }

        const oTrace = event.trace?.trace?.orchestrationTrace;
        if (!oTrace) continue;

        if (oTrace.modelInvocationInput) {
          yield { type: "step", step: "agentThinking" };
        }

        const agName = oTrace.invocationInput?.actionGroupInvocationInput?.actionGroupName;
        if (agName) {
          pendingActionGroupName = agName;
        }

        const obs = oTrace.observation;
        if (obs?.actionGroupInvocationOutput) {
          yield {
            type: "actionGroupOutput",
            actionGroup: pendingActionGroupName,
            output: obs.actionGroupInvocationOutput.text ?? "",
          };
          pendingActionGroupName = "unknown";
        }

        if (obs?.finalResponse?.text) {
          yield { type: "step", step: "finalResponse", detail: obs.finalResponse.text };
        }
      }

      if (!shouldContinue) {
        return;
      }
    }
  }

  private async invokeAction(input: InvocationInputMember): Promise<ActionInvocationResult> {
    if ("functionInvocationInput" in input && input.functionInvocationInput) {
      return this.actionInvoker.invoke({
        actionGroup: input.functionInvocationInput.actionGroup ?? "",
        functionName: input.functionInvocationInput.function ?? "",
        parameters: input.functionInvocationInput.parameters,
      });
    }

    throw new Error("Unsupported returnControl invocation input.");
  }
}

function toApprovalResult(invocationResult: ActionInvocationResult) {
  return {
    functionResult: {
      actionGroup: invocationResult.actionGroup,
      function: invocationResult.functionName,
      confirmationState: "CONFIRM" as const,
      responseBody: {
        TEXT: {
          body: JSON.stringify(invocationResult.result),
        },
      },
    },
  };
}
