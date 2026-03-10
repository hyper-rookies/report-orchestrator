import type { StoredMessage } from "../types/session";

export interface PersistableFrame {
  type: string;
  data: Record<string, unknown>;
}

export interface PersistableMessage {
  id: string;
  role: StoredMessage["role"];
  content: string;
  frames?: PersistableFrame[];
}

export interface SaveRequest {
  sessionId: string;
  title: string;
  messages: StoredMessage[];
}

export interface SessionSaveIds {
  persistedSessionId: string | null;
  draftSessionId: string | null;
}

interface ResolveSessionTitleArgs {
  persistedTitle: string | null;
  loadedTitle: string | null;
  question: string;
}

interface PrepareSessionSaveArgs extends ResolveSessionTitleArgs, SessionSaveIds {
  messages: PersistableMessage[];
  skipFrameTypes: ReadonlySet<string>;
  createSessionId: () => string;
}

export interface PreparedSessionSave {
  request: SaveRequest;
  shouldNavigateOnSuccess: boolean;
}

export interface FailedSessionSave {
  message: string;
  request: SaveRequest;
  shouldNavigateOnSuccess: boolean;
}

export interface SaveSuccessResult extends SessionSaveIds {
  navigateTo: string | null;
}

export function toStoredMessages(
  messages: PersistableMessage[],
  skipFrameTypes: ReadonlySet<string>
): StoredMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    frames: message.frames?.filter((frame) => !skipFrameTypes.has(frame.type)),
  }));
}

export function resolveSessionTitle({
  persistedTitle,
  loadedTitle,
  question,
}: ResolveSessionTitleArgs): string {
  const providerTitle = persistedTitle?.trim();
  if (providerTitle) {
    return providerTitle;
  }

  const restoredTitle = loadedTitle?.trim();
  if (restoredTitle) {
    return restoredTitle;
  }

  return question.trim().slice(0, 40);
}

export function prepareSessionSave({
  persistedSessionId,
  draftSessionId,
  persistedTitle,
  loadedTitle,
  question,
  messages,
  skipFrameTypes,
  createSessionId,
}: PrepareSessionSaveArgs): PreparedSessionSave {
  const sessionId = persistedSessionId ?? draftSessionId ?? createSessionId();

  return {
    request: {
      sessionId,
      title: resolveSessionTitle({ persistedTitle, loadedTitle, question }),
      messages: toStoredMessages(messages, skipFrameTypes),
    },
    shouldNavigateOnSuccess: persistedSessionId === null,
  };
}

export function createSaveFailure(
  request: SaveRequest,
  shouldNavigateOnSuccess: boolean,
  error: unknown
): FailedSessionSave {
  const detail =
    error instanceof Error && error.message.trim().length > 0 ? ` (${error.message})` : "";

  return {
    message: `세션 저장에 실패했습니다. 새로고침하기 전에 다시 시도해 주세요.${detail}`,
    request,
    shouldNavigateOnSuccess,
  };
}

export function applySaveSuccess(
  ids: SessionSaveIds,
  savedSessionId: string
): SaveSuccessResult {
  return {
    persistedSessionId: savedSessionId,
    draftSessionId: savedSessionId,
    navigateTo: ids.persistedSessionId ? null : `/sessions/${savedSessionId}`,
  };
}
