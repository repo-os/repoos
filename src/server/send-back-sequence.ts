export type SendBackStep = "move" | "start" | "message";

export interface SendBackStepResult {
  ok: boolean;
  status?: number;
  error?: string;
  value?: unknown;
}

export interface SendBackResult {
  ok: boolean;
  step?: SendBackStep;
  status?: number;
  error?: string;
  moved: boolean;
  started: boolean;
  messageQueued: boolean;
  message?: unknown;
}

/** Run the send-back operations in order, stopping at the first failed step. */
export async function runSendBackSequence(
  message: string,
  steps: {
    move: () => Promise<SendBackStepResult>;
    start: () => Promise<SendBackStepResult>;
    queue: (message: string) => Promise<SendBackStepResult>;
  },
): Promise<SendBackResult> {
  const text = message.trim();
  if (!text) {
    return {
      ok: false,
      step: "message",
      status: 400,
      error: "message text is required",
      moved: false,
      started: false,
      messageQueued: false,
    };
  }
  const moved = await steps.move();
  if (!moved.ok) {
    return {
      ok: false,
      step: "move",
      status: moved.status,
      error: moved.error,
      moved: false,
      started: false,
      messageQueued: false,
    };
  }
  const started = await steps.start();
  if (!started.ok) {
    return {
      ok: false,
      step: "start",
      status: started.status,
      error: started.error,
      moved: true,
      started: false,
      messageQueued: false,
    };
  }
  const queued = await steps.queue(text);
  if (!queued.ok) {
    return {
      ok: false,
      step: "message",
      status: queued.status,
      error: queued.error,
      moved: true,
      started: true,
      messageQueued: false,
    };
  }
  return { ok: true, moved: true, started: true, messageQueued: true, message: queued.value };
}
