import { json } from "./utils.js";
import type { RouteHandler } from "./types.js";
import type { RepoOSConfig } from "../../core/types.js";

async function transcribeWithGroq(
  apiKey: string,
  audioBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  const extension = mimeType.split("/")[1] || "webm";
  formData.append("file", blob, `audio.${extension}`);
  formData.append("model", "whisper-large-v3");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq transcription failed: ${response.status} ${error}`);
  }

  const result = (await response.json()) as { text?: string };
  return result.text || "";
}

async function transcribeWithOpenAI(
  apiKey: string,
  audioBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  const extension = mimeType.split("/")[1] || "webm";
  formData.append("file", blob, `audio.${extension}`);
  formData.append("model", "whisper-1");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI transcription failed: ${response.status} ${error}`);
  }

  const result = (await response.json()) as { text?: string };
  return result.text || "";
}

function parseMultipart(
  buffer: Buffer,
  boundary: string,
): Map<string, { data: Buffer; mimeType?: string }> {
  const parts = new Map<string, { data: Buffer; mimeType?: string }>();
  const bufferStr = buffer.toString("binary");
  const delimiter = `--${boundary}`;
  const sections = bufferStr.split(delimiter);

  for (const section of sections) {
    if (!section.trim() || section.trim() === "--") continue;

    const headerEnd = section.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headers = section.slice(0, headerEnd);
    const body = section.slice(headerEnd + 4); // skip \r\n\r\n

    // Remove trailing \r\n-- if present
    const cleanBody = body.replace(/\r\n--$/, "");

    const nameMatch = headers.match(/name="([^"]+)"/);
    if (!nameMatch) continue;

    const name = nameMatch[1];
    const mimeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
    const mimeType = mimeMatch ? mimeMatch[1].trim() : undefined;

    parts.set(name, {
      data: Buffer.from(cleanBody, "binary"),
      mimeType,
    });
  }

  return parts;
}

/**
 * Transcribe one audio buffer with the configured whisper provider. Shared by
 * the browser route and the Telegram voice-note path (#0543) so both use the
 * same provider selection and error text.
 */
export async function transcribeAudio(
  config: Pick<RepoOSConfig, "whisper">,
  audioBuffer: Buffer,
  mimeType: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const provider = config.whisper?.provider || "none";
  const apiKey = config.whisper?.apiKey || "";
  if (!provider || provider === "none" || !apiKey) {
    return { ok: false, error: "Voice transcription not configured" };
  }
  try {
    const text =
      provider === "groq"
        ? await transcribeWithGroq(apiKey, audioBuffer, mimeType)
        : provider === "openai"
          ? await transcribeWithOpenAI(apiKey, audioBuffer, mimeType)
          : null;
    if (text === null) return { ok: false, error: `Unknown provider: ${provider}` };
    return { ok: true, text };
  } catch (err) {
    return {
      ok: false,
      error: `Transcription failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export const transcribe: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;

  // Check if whisper is configured
  const provider = config.whisper?.provider || "none";
  const apiKey = config.whisper?.apiKey || "";

  if (!provider || provider === "none" || !apiKey) {
    return json(res, 400, { error: "Voice transcription not configured" });
  }

  // Parse multipart form data
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  try {
    const buffer = Buffer.concat(chunks);
    const contentType = req.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    const boundary = boundaryMatch ? boundaryMatch[1] : "";

    let audioBuffer: Buffer | null = null;
    let mimeType = "audio/webm";

    if (boundary) {
      const parts = parseMultipart(buffer, boundary);
      const audioPart = parts.get("audio");
      if (audioPart) {
        audioBuffer = audioPart.data;
        if (audioPart.mimeType) mimeType = audioPart.mimeType;
      }
    } else {
      // If no boundary, assume the entire body is audio
      audioBuffer = buffer;
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return json(res, 400, { error: "No audio data provided" });
    }

    const result = await transcribeAudio(config, audioBuffer, mimeType);
    if (!result.ok) {
      return json(res, result.error.startsWith("Unknown provider") ? 400 : 500, {
        error: result.error,
      });
    }
    return json(res, 200, { text: result.text || "" });
  } catch (err) {
    console.error("Transcription error:", err);
    return json(res, 500, {
      error: `Transcription failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
};
