<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import { Mic, Square } from "lucide-vue-next";
import { useConfigStore } from "../stores/config";

interface Props {
  disabled?: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  transcribed: [text: string];
}>();

const config = useConfigStore();
const state = ref<"idle" | "recording" | "transcribing">("idle");
const mediaRecorder = ref<MediaRecorder | null>(null);
const audioChunks = ref<Blob[]>([]);
const elapsedTime = ref(0);
let timerInterval: NodeJS.Timeout | null = null;

const isEnabled = computed(() => {
  const whisper = (config.form as Record<string, unknown>).whisper as Record<string, unknown> | undefined;
  return whisper?.provider && whisper.provider !== "none";
});

async function startRecording(): Promise<void> {
  if (state.value !== "idle" || !isEnabled.value) return;

  try {
    state.value = "recording";
    audioChunks.value = [];
    elapsedTime.value = 0;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);

    recorder.addEventListener("dataavailable", (e) => {
      audioChunks.value.push(e.data);
    });

    recorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      await transcribeAudio();
    });

    mediaRecorder.value = recorder;
    recorder.start();

    timerInterval = setInterval(() => {
      elapsedTime.value += 1;
      // Cap at 2 minutes
      if (elapsedTime.value >= 120) {
        stopRecording();
      }
    }, 1000);
  } catch (err) {
    state.value = "idle";
    console.error("Recording failed:", err);
  }
}

function stopRecording(): void {
  if (state.value === "recording" && mediaRecorder.value) {
    mediaRecorder.value.stop();
    if (timerInterval) clearInterval(timerInterval);
  }
}

function cancelRecording(): void {
  if (state.value === "recording" && mediaRecorder.value) {
    mediaRecorder.value.stop();
    if (timerInterval) clearInterval(timerInterval);
    state.value = "idle";
    audioChunks.value = [];
  }
}

async function transcribeAudio(): Promise<void> {
  if (audioChunks.value.length === 0) {
    state.value = "idle";
    return;
  }

  state.value = "transcribing";
  try {
    const blob = new Blob(audioChunks.value, { type: "audio/webm" });
    const formData = new FormData();
    formData.append("audio", blob, "audio.webm");

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Transcription error:", error);
      state.value = "idle";
      return;
    }

    const result = (await response.json()) as { text?: string };
    const text = result.text?.trim() || "";

    if (text) {
      // Try to insert into the focused textarea if one is focused
      const focused = document.activeElement;
      if (focused instanceof HTMLTextAreaElement) {
        insertTextAtCursor(focused, text);
      }
      emit("transcribed", text);
    }
  } catch (err) {
    console.error("Transcription failed:", err);
  } finally {
    state.value = "idle";
  }
}

function insertTextAtCursor(textarea: HTMLTextAreaElement, text: string): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);
  textarea.value = before + text + after;
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}


function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

onBeforeUnmount(() => {
  if (timerInterval) clearInterval(timerInterval);
  if (mediaRecorder.value?.state === "recording") {
    mediaRecorder.value.stop();
  }
});
</script>

<template>
  <div class="voice-dictate">
    <button
      type="button"
      :disabled="!isEnabled || disabled"
      :title="!isEnabled ? 'Voice transcription not configured' : ''"
      :class="{ recording: state === 'recording', transcribing: state === 'transcribing' }"
      @click="state === 'idle' ? startRecording() : stopRecording()"
    >
      <Mic v-if="state === 'idle'" class="icon" />
      <Square v-else class="icon" />
      <span v-if="state === 'recording'" class="time">{{ formatTime(elapsedTime) }}</span>
    </button>
    <button
      v-if="state === 'recording'"
      type="button"
      class="cancel-btn"
      @click="cancelRecording"
      title="Cancel recording"
    >
      ✕
    </button>
  </div>
</template>

<style scoped>
.voice-dictate {
  display: flex;
  gap: 4px;
  align-items: center;
}

button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  color: var(--txt);
  font-size: 12px;
  transition: all 0.2s;
}

button:hover:not(:disabled) {
  background: var(--bg-tertiary);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button.recording {
  background: #ff4444;
  border-color: #cc0000;
  color: white;
  animation: pulse 1s infinite;
}

button.recording:hover {
  background: #ff5555;
}

button.transcribing {
  background: var(--bg-secondary);
  border-color: var(--accent);
  color: var(--accent);
}

.icon {
  width: 16px;
  height: 16px;
}

.time {
  font-size: 11px;
  font-weight: 600;
}

.cancel-btn {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--border);
  font-size: 14px;
  min-width: auto;
}

.cancel-btn:hover {
  background: var(--red-alpha);
  color: var(--red);
}
</style>
