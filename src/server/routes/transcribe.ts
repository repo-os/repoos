import { json } from "./utils.js";
import type { RouteHandler } from "./types.js";

async function transcribeWithGroq(apiKey: string, audioBuffer: Buffer): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/webm" });
  formData.append("file", blob, "audio.webm");
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

async function transcribeWithOpenAI(apiKey: string, audioBuffer: Buffer): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/webm" });
  formData.append("file", blob, "audio.webm");
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
  return new Promise<void>(() => {
    let boundaryEnd = false;

    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on("end", async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = req.headers["content-type"] || "";
        const boundaryMatch = contentType.match(/boundary=([^;]+)/);
        const boundary = boundaryMatch ? boundaryMatch[1] : "";

        // Extract audio data from multipart form
        let audioBuffer: Buffer | null = null;
        if (boundary) {
          const bufferStr = buffer.toString("binary");
          const parts = bufferStr.split(`--${boundary}`);

          for (const part of parts) {
            if (part.includes('name="audio"')) {
              const match = part.match(/\r?\n\r?\n([\s\S]*?)\r?\n--/);
              if (match) {
                audioBuffer = Buffer.from(match[1], "binary");
                break;
              }
            }
          }
        } else {
          // If no boundary, assume the entire body is audio
          audioBuffer = buffer;
        }

        if (!audioBuffer || audioBuffer.length === 0) {
          return json(res, 400, { error: "No audio data provided" });
        }

        let text = "";
        if (provider === "groq") {
          text = await transcribeWithGroq(apiKey, audioBuffer);
        } else if (provider === "openai") {
          text = await transcribeWithOpenAI(apiKey, audioBuffer);
        } else {
          return json(res, 400, { error: `Unknown provider: ${provider}` });
        }

        json(res, 200, { text: text || "" });
      } catch (err) {
        console.error("Transcription error:", err);
        json(res, 500, {
          error: `Transcription failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    req.on("error", (err) => {
      console.error("Request error:", err);
      json(res, 500, { error: "Request failed" });
      boundaryEnd = true;
    });
  });
};
