"use client";

const STORAGE_KEY = "agent-auto-approve-actions";

export function readAgentAutoApproveSetting(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeAgentAutoApproveSetting(value: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {
    // Ignore storage failures and fall back to the current in-memory value.
  }
}
