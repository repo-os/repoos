/** Shared policy for choosing local or runner-backed browser evidence. */
export type BrowserCaptureMode = "local" | "runner-available" | "runner-only";

export interface BrowserCaptureArtifacts {
  files: Array<{ name: string; data: string }>;
  result: unknown;
}

export interface BrowserCaptureTransport {
  capture(taskId: string, mode: "shots" | "verify" | "both"): Promise<BrowserCaptureArtifacts>;
}

export interface BrowserCaptureOutcome {
  artifacts?: BrowserCaptureArtifacts;
  notice?: string;
  localRequired: boolean;
}

/**
 * Select the configured capture location. Runner failures are surfaced to the
 * caller so it can log the note and invoke the existing local capture path.
 */
export async function runBrowserCaptureRemoteFirst(
  mode: BrowserCaptureMode,
  taskId: string,
  captureMode: "shots" | "verify" | "both",
  transport: BrowserCaptureTransport | undefined,
): Promise<BrowserCaptureOutcome> {
  if (mode === "local") return { localRequired: true };
  if (!transport) {
    const notice = "Remote browser capture unavailable: no capable runner is ready.";
    if (mode === "runner-only") throw new Error(notice);
    return { localRequired: true, notice };
  }
  try {
    const artifacts = await transport.capture(taskId, captureMode);
    validateBrowserArtifacts(artifacts);
    return { artifacts, localRequired: false };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const notice = `Remote browser capture failed (${detail}); using local capture.`;
    if (mode === "runner-only") throw new Error(notice);
    return { localRequired: true, notice };
  }
}

/** Reject malformed/unsafe artifact payloads before any caller writes files. */
export function validateBrowserArtifacts(value: BrowserCaptureArtifacts): void {
  if (!value || !Array.isArray(value.files)) throw new Error("runner returned malformed artifacts");
  let total = 0;
  const names = new Set<string>();
  for (const file of value.files) {
    if (!file || typeof file.name !== "string" || typeof file.data !== "string") {
      throw new Error("runner returned malformed artifact entry");
    }
    if (!/^(shots\/[A-Za-z0-9._-]+\.(?:png|json)|verification\.json)$/.test(file.name)) {
      throw new Error(`runner returned unsafe artifact path: ${file.name}`);
    }
    if (names.has(file.name)) throw new Error(`runner returned duplicate artifact: ${file.name}`);
    names.add(file.name);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data)) {
      throw new Error(`runner returned invalid base64 for ${file.name}`);
    }
    total += Math.floor((file.data.length * 3) / 4);
    if (total > 50 * 1024 * 1024) throw new Error("runner artifacts exceed 50 MiB");
  }
}
