import {
  AgentEvent,
  BedrockAgentClient,
  IBedrockAgentClient,
} from "../src/bedrock-agent-client";
import { BedrockAgentRuntimeClient } from "@aws-sdk/client-bedrock-agent-runtime";

function makeSdkMock(streamEvents: object[]): BedrockAgentRuntimeClient {
  const fakeCompletion = (async function* () {
    for (const ev of streamEvents) yield ev;
  })();
  return {
    send: jest.fn().mockResolvedValue({ completion: fakeCompletion }),
  } as unknown as BedrockAgentRuntimeClient;
}

async function collectEvents(
  client: IBedrockAgentClient,
  params = { agentId: "a1", agentAliasId: "alias1", sessionId: "s1", inputText: "test" }
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const ev of client.stream(params)) events.push(ev);
  return events;
}

test("yields chunk event when SDK emits chunk.bytes", async () => {
  const client = new BedrockAgentClient(
    makeSdkMock([{ chunk: { bytes: Buffer.from("Hello world") } }])
  );
  const events = await collectEvents(client);
  expect(events).toHaveLength(1);
  expect(events[0]).toEqual({ type: "chunk", text: "Hello world" });
});

test("yields step event for modelInvocationInput trace", async () => {
  const client = new BedrockAgentClient(
    makeSdkMock([
      { trace: { trace: { orchestrationTrace: { modelInvocationInput: {} } } } },
    ])
  );
  const events = await collectEvents(client);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: "step", step: "agentThinking" });
});

test("yields actionGroupOutput event — name from invocationInput, text from observation", async () => {
  // Real AWS SDK: actionGroupName is in invocationInput (before the call),
  // and actionGroupInvocationOutput only has { text }.
  // The client must carry the name forward to the output event.
  const client = new BedrockAgentClient(
    makeSdkMock([
      {
        trace: {
          trace: {
            orchestrationTrace: {
              invocationInput: {
                actionGroupInvocationInput: { actionGroupName: "query-lambda" },
              },
            },
          },
        },
      },
      {
        trace: {
          trace: {
            orchestrationTrace: {
              observation: {
                actionGroupInvocationOutput: {
                  text: '{"rows":[],"rowCount":0,"truncated":false}',
                },
              },
            },
          },
        },
      },
    ])
  );
  const events = await collectEvents(client);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: "actionGroupOutput", actionGroup: "query-lambda" });
});

test("yields nothing when completion is undefined", async () => {
  const sdkMock = {
    send: jest.fn().mockResolvedValue({ completion: undefined }),
  } as unknown as BedrockAgentRuntimeClient;
  const client = new BedrockAgentClient(sdkMock);
  const events = await collectEvents(client);
  expect(events).toHaveLength(0);
});
