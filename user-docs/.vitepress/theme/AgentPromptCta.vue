<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import {
  AGENT_CTA,
  STARTER_PROMPT,
  STARTER_PROMPT_PREVIEW,
  agentGuideHref,
  copyTextToClipboard,
} from "../../../agent/cta";

const guideHref = agentGuideHref("docs");

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
  margin: 28px 0 8px;
  padding: 18px 20px 20px;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg-alt);
}

.agent-cta-heading {
  margin: 0;
  padding: 0;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--vp-c-text-1);
}

.agent-cta-sentence {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.agent-cta-preview {
  margin: 14px 0 0;
  padding: 10px 12px;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 1.65;
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
  gap: 10px 18px;
  margin-top: 14px;
}

.agent-cta-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  padding: 8px 14px;
  border: 1px solid var(--vp-button-brand-border);
  border-radius: 8px;
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}

.agent-cta-button:hover {
  border-color: var(--vp-button-brand-hover-border);
  background: var(--vp-button-brand-hover-bg);
  color: var(--vp-button-brand-hover-text);
}

.agent-cta-button.copied {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-text-1);
}

.agent-cta-icon {
  flex: none;
  width: 14px;
  height: 14px;
}

.agent-cta-guide {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
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
