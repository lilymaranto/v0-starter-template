"use client";

const QUEUE_KEY = "__doppelNativeUserSyncQueue";
const INSTALLED_KEY = "__doppelNativeCaptureInstalled";
const DONE_KEY = "__doppelNativeCaptureDone";

type NativeSyncItem = {
  userId: string;
  detail: Record<string, unknown>;
};

type NativeCaptureWindow = Window & {
  [QUEUE_KEY]?: NativeSyncItem[];
  [INSTALLED_KEY]?: boolean;
  [DONE_KEY]?: boolean;
};

export function installNativeUserEarlyCapture() {
  if (typeof window === "undefined") return;
  const w = window as NativeCaptureWindow;
  if (w[INSTALLED_KEY]) return;
  w[INSTALLED_KEY] = true;
  w[QUEUE_KEY] = w[QUEUE_KEY] ?? [];

  window.addEventListener("nativeUserUpdate", (event: Event) => {
    if (w[DONE_KEY]) return;
    const customEvent = event as CustomEvent<Record<string, unknown>>;
    const detail = customEvent?.detail ?? {};
    const raw =
      (detail.userId as string | undefined) ??
      (detail.user_id as string | undefined) ??
      (detail.id as string | undefined);
    const userId = String(raw ?? "").trim();
    if (!userId || userId === "unknown") return;
    w[QUEUE_KEY]?.push({
      userId,
      detail: { ...detail },
    });
  });
}

export function takeNativeUserSyncQueue(): NativeSyncItem[] {
  if (typeof window === "undefined") return [];
  const w = window as NativeCaptureWindow;
  const queue = w[QUEUE_KEY];
  if (!Array.isArray(queue) || queue.length === 0) return [];
  return queue.splice(0, queue.length);
}

export function markNativeUserEarlyCaptureDone() {
  if (typeof window === "undefined") return;
  const w = window as NativeCaptureWindow;
  w[DONE_KEY] = true;
}
