# Chat Queue Render Gate

## Summary

The chat UI now treats queued questions as a strictly sequential, tab-local workflow. A queued question keeps the queue locked until the answer is fully streamed, persisted, and visibly rendered in the committed message list.

## Behavior

- Queue scope: current browser tab and current chat page instance only.
- In-flight limit: one queued question at a time.
- Release condition:
  - SSE finished
  - session save finished successfully
  - committed assistant message rendered after one `requestAnimationFrame`
- Error handling:
  - rendered `error` frames still release the queue
  - `EMPTY_RESPONSE` fallback still releases the queue
  - session save failure pauses the queue until retry succeeds
- Queue editing:
  - removing or clearing queued items does not cancel the current in-flight question
  - only pending items are removed

## Implementation Notes

- `useSequentialQuestionRunner` centralizes queue execution state for both chat entry pages.
- `MessageList` forwards committed assistant message ids to `AssistantMessage`.
- `AssistantMessage` emits a one-time render acknowledgement only for non-streaming committed content.
- Both `(app)/page.tsx` and `(app)/sessions/[sessionId]/page.tsx` use the same render-gated queue flow.
