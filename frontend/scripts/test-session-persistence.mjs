import assert from "node:assert/strict";

import {
  applySaveSuccess,
  createSaveFailure,
  prepareSessionSave,
} from "../src/lib/sessionPersistence.ts";

const SKIP_TYPES = new Set(["chunk", "status", "delta"]);

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const sampleMessages = [
  {
    id: "user-1",
    role: "user",
    content: "첫 질문",
  },
  {
    id: "assistant-1",
    role: "assistant",
    content: "",
    frames: [
      { type: "chunk", data: { text: "partial" } },
      { type: "final", data: { summary: "완료" } },
    ],
  },
];

test("rename persists after another save by preferring provider title", () => {
  const prepared = prepareSessionSave({
    persistedSessionId: "session-1",
    draftSessionId: "session-1",
    persistedTitle: "Renamed title",
    loadedTitle: "Stale loaded title",
    question: "new follow-up question",
    messages: sampleMessages,
    skipFrameTypes: SKIP_TYPES,
    createSessionId: () => "unused",
  });

  assert.equal(prepared.request.title, "Renamed title");
  assert.deepEqual(prepared.request.messages[1].frames, [
    { type: "final", data: { summary: "완료" } },
  ]);
});

test("failed save keeps retry payload and exposes actionable messaging", () => {
  const prepared = prepareSessionSave({
    persistedSessionId: null,
    draftSessionId: "draft-1",
    persistedTitle: null,
    loadedTitle: null,
    question: "draft question",
    messages: sampleMessages,
    skipFrameTypes: SKIP_TYPES,
    createSessionId: () => "unused",
  });

  const failure = createSaveFailure(
    prepared.request,
    prepared.shouldNavigateOnSuccess,
    new Error("HTTP 500")
  );

  assert.equal(failure.request.sessionId, "draft-1");
  assert.equal(failure.shouldNavigateOnSuccess, true);
  assert.match(failure.message, /다시 시도/);
  assert.match(failure.message, /HTTP 500/);
});

test("session URL becomes durable only after save success", () => {
  const pending = prepareSessionSave({
    persistedSessionId: null,
    draftSessionId: null,
    persistedTitle: null,
    loadedTitle: null,
    question: "first question",
    messages: sampleMessages,
    skipFrameTypes: SKIP_TYPES,
    createSessionId: () => "draft-2",
  });

  assert.equal(pending.request.sessionId, "draft-2");
  assert.equal(pending.shouldNavigateOnSuccess, true);

  const saved = applySaveSuccess(
    { persistedSessionId: null, draftSessionId: pending.request.sessionId },
    pending.request.sessionId
  );

  assert.equal(saved.persistedSessionId, "draft-2");
  assert.equal(saved.navigateTo, "/sessions/draft-2");
});

test("restore after save keeps the persisted id and title", () => {
  const saved = applySaveSuccess(
    { persistedSessionId: null, draftSessionId: "draft-3" },
    "draft-3"
  );

  const restored = prepareSessionSave({
    persistedSessionId: saved.persistedSessionId,
    draftSessionId: saved.draftSessionId,
    persistedTitle: "Stored session title",
    loadedTitle: "Older loaded title",
    question: "follow-up after restore",
    messages: sampleMessages,
    skipFrameTypes: SKIP_TYPES,
    createSessionId: () => "unused",
  });

  assert.equal(restored.request.sessionId, "draft-3");
  assert.equal(restored.shouldNavigateOnSuccess, false);
  assert.equal(restored.request.title, "Stored session title");
});
