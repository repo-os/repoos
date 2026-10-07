/**
 * Minimal SSE frame parser for CLI consumers (#0728).
 */

export function parseSseChunk(buffer: string, onData: (jsonText: string) => void): string {
  let rest = buffer;
  let split = rest.indexOf("\n\n");
  while (split !== -1) {
    const frame = rest.slice(0, split);
    rest = rest.slice(split + 2);
    const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
    if (dataLine) onData(dataLine.slice(6));
    split = rest.indexOf("\n\n");
  }
  return rest;
}

export async function consumeSseResponse(
  res: Response,
  onJson: (data: unknown) => void,
  shouldContinue: () => boolean,
): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (shouldContinue()) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = parseSseChunk(buffer, (text) => {
        try {
          onJson(JSON.parse(text));
        } catch {
          /* ignore partial frames */
        }
      });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
