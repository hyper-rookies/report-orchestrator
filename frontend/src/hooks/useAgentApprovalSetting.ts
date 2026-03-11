"use client";

import { useSyncExternalStore } from "react";

import {
  readAgentAutoApproveSetting,
  writeAgentAutoApproveSetting,
} from "@/lib/agentApprovalSetting";

const CHANGE_EVENT = "agent-auto-approve-actions-change";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === "agent-auto-approve-actions") {
      callback();
    }
  };
  const handleChange = () => callback();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(CHANGE_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CHANGE_EVENT, handleChange);
  };
}

function getSnapshot() {
  return readAgentAutoApproveSetting();
}

function getServerSnapshot() {
  return true;
}

export function useAgentApprovalSetting() {
  const autoApproveActions = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setAutoApproveActions = (value: boolean) => {
    writeAgentAutoApproveSetting(value);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return {
    autoApproveActions,
    setAutoApproveActions,
  };
}
