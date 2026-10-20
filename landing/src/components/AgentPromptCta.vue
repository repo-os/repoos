<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import {
  AGENT_CTA,
  STARTER_PROMPT,
  STARTER_PROMPT_PREVIEW,
  agentGuideHref,
  copyTextToClipboard,
} from "../../../agent/cta";

const guideHref = agentGuideHref("landing");

const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;

async function copyPrompt(): Promise<void> {
  await copyTextToClipboard(STARTER_PROMPT);
  copied.value = true;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copied.value = false), 2400);
}

onBeforeUnmount(() => clearTimeout(copyTimer));
</script>

<template>
  <section class="agent-cta" aria-labelledby="agent-cta-heading">
    <h2 id="agent-cta-heading" class="agent-cta-heading">{{ AGENT_CTA.heading }}</h2>
    <p class="agent-cta-sentence">{{ AGENT_CTA.sentence }}</p>

    <pre
      class="agent-cta-preview"
      :aria-label="AGENT_CTA.previewLabel"
    ><code>{{ STARTER_PROMPT_PREVIEW }}</code></pre>

    <div class="agent-cta-actions">
      <button
        type="button"
        class="agent-cta-button"
        :class="{ copied }"
        :aria-label="copied ? AGENT_CTA.copiedLabel : AGENT_CTA.buttonLabel"
        @click="copyPrompt"
      >
        <svg
          v-if="!copied"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="agent-cta-icon"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          class="agent-cta-icon"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {{ copied ? AGENT_CTA.copiedLabel : AGENT_CTA.buttonLabel }}
      </button>

      <a class="agent-cta-guide" :href="guideHref">
        {{ AGENT_CTA.guideLabel }}
        <span aria-hidden="true">→</span>
      </a>
    </div>

    <p class="agent-cta-status" role="status" aria-live="polite">
      {{ copied ? AGENT_CTA.copiedLabel : "" }}
    </p>
  </section>
</template>

<style scoped>
.agent-cta {
  max-width: 640px;
  margin-top: 1.5rem;
  padding: 16px 18px 18px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
}

.agent-cta-heading {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--txt);
}

.agent-cta-sentence {
  margin: 6px 0 0;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--txt-dim);
}

.agent-cta-preview {
  margin: 12px 0 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-solid);
  color: var(--txt-dim);
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.agent-cta-preview code {
  font: inherit;
  color: inherit;
}

.agent-cta-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  margin-top: 12px;
}

.agent-cta-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  padding: 8px 13px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--cyan);
  color: var(--bg);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.agent-cta-button:hover {
  background: color-mix(in srgb, var(--cyan) 82%, var(--txt));
}

.agent-cta-button.copied {
  background: var(--green);
}

.agent-cta-icon {
  flex: none;
  width: 14px;
  height: 14px;
}

.agent-cta-guide {
  font-size: 13px;
  color: var(--cyan);
  text-decoration: none;
}

.agent-cta-guide:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.agent-cta-status {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
