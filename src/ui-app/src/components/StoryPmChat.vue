<script setup lang="ts">
/**
 * The story side panel's PM tab (#0515) — the PM conversation about one story.
 *
 * This is the *host*, not the chat. The surface itself is the shared
 * `<PmChatSurface>`, the same one the task panel's PM tab renders, so the two
 * cannot drift apart in either appearance or behaviour; that component owns the
 * transcript, the compose box, `useChatScroll`, the jump-to-latest control and
 * the AI-chat-standard hooks. All this file does is own a story's state and
 * talk to the story PM routes.
 *
 * What is story-specific, and nothing more:
 *   - the session is keyed per story, not per task (`pm-story-v1:<number>`,
 *     built by `storyPmSessionId` so client and server agree without either
 *     knowing the other's internals);
 *   - the canned prompts ask story questions rather than task questions.
 *
 * The pending-screenshot buffer is local to this component rather than shared
 * from the ui store, which the task panel owns and clears on every task open
 * and close — two independent conversations must not hand each other's picks.
 */
import { computed, reactive, ref, watch } from "vue";
import { api, JSON_OPTS } from "../api";
import { storyPmSessionId } from "../../../core/stories.js";
import type { MergedStoryGroup } from "../../../core/story-display.js";
import type { AgentOutputEntry, Task } from "../types";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { useRepoStore } from "../stores/repo";
import { pendingToShots } from "../lib/screenshot-viewer";
import AgentModelControl from "./AgentModelControl.vue";
import PmChatSurface, { type PendingShot } from "./PmChatSurface.vue";
import ScreenshotViewer from "./ScreenshotViewer.vue";

const props = defineProps<{
  /**
   * The story the panel is showing. The host only mounts this component while
   * the PM tab is selected, so "mounted" already means "active" — which is why
   * the surface needs no `active` prop from here.
   */
  story: MergedStoryGroup<Task>;
}>();

// This component has two roots (the chat and the screenshot viewer), so Vue
// cannot auto-inherit fallthrough attributes — and the tab's ARIA wiring
// (`role="tabpanel"`, `aria-labelledby`, the panel id) arrives exactly that way
// from StoryPanel. Forward it by hand onto the chat, which is the tab panel.
defineOptions({ inheritAttrs: false });

const auth = useAuthStore();
const config = useConfigStore();
const repo = useRepoStore();

/** Runner session key for this story's PM conversation — see `storyPmSessionId`. */
const sessionId = computed(() => storyPmSessionId(props.story.key, props.story.number, auth.email));

const lines = computed(() => repo.outputs[sessionId.value] ?? []);
const busy = computed(() => submitting.value || repo.runningIds.includes(sessionId.value));

/** Mirrors the task panel: an unconfigured PM agent disables the composer. */
const pmAgentEnabled = computed(() => {
  if (!config.loaded) return true;
  return (config.agents ?? []).some((a) => a.name === "pm" && a.enabled);
});

const draft = ref("");
const submitting = ref(false);

// ---- agent + model selector (same control and look as the task PM tab) ----
//
// A story has no file to persist an override on, so the pick is remembered
// per story in this browser and sent with each message; the server applies it
// the way the task PM route does. Unpicked = the configured pm agent.
const pmBase = computed(
  () => (config.agents ?? []).find((a) => a.enabled && a.name === "pm") ?? null,
);
const pick = reactive({ cli: "", model: "" });
const pickKey = computed(() => `repoos:story-pm-agent:${props.story.key}`);

function loadPick(): void {
  let saved: { cli?: string; model?: string } | null = null;
  try {
    const raw = window.localStorage.getItem(pickKey.value);
    saved = raw ? (JSON.parse(raw) as { cli?: string; model?: string }) : null;
  } catch {
    saved = null;
  }
  pick.cli = saved?.cli || pmBase.value?.cli || "";
  pick.model = saved?.model || pmBase.value?.model || "";
}

watch(() => [props.story.key, pmBase.value?.cli, pmBase.value?.model], loadPick, {
  immediate: true,
});

watch(
  () => [pick.cli, pick.model],
  () => {
    const base = pmBase.value;
    try {
      if (!pick.cli || (pick.cli === base?.cli && pick.model === base?.model)) {
        window.localStorage.removeItem(pickKey.value);
      } else {
        window.localStorage.setItem(
          pickKey.value,
          JSON.stringify({ cli: pick.cli, model: pick.model }),
        );
      }
    } catch {
      // Private mode / blocked storage: the pick still applies for this session.
    }
  },
);

/** Antigravity is worktree-bound; a story has no worktree, so it is not offered. */
const cliOptions = computed(() => {
  const options = (config.agentsMeta.clis ?? []).filter((cli) => cli !== "antigravity");
  return pick.cli && !options.includes(pick.cli) ? [pick.cli, ...options] : options;
});
const modelOptions = computed(() => config.modelsFor(pick.cli, pick.model || undefined));

/** Override fields for the request: only what differs from the configured pm agent. */
function overrideBody(): { cliOverride?: string; modelOverride?: string } {
  const base = pmBase.value;
  if (!base || !pick.cli) return {};
  const cliChanged = pick.cli !== base.cli;
  return {
    ...(cliChanged ? { cliOverride: pick.cli } : {}),
    ...(cliChanged || pick.model !== base.model ? { modelOverride: pick.model } : {}),
  };
}
const shots = ref<PendingShot[]>([]);

// 0513: pending screenshots open the shared full-size viewer, exactly as they
// do in the task panel's PM chat — the two surfaces must not differ in an
// affordance, which is the whole reason the chat is one component.
const viewerOpen = ref(false);
const viewerStart = ref(0);
const viewerShots = computed(() => pendingToShots(shots.value));
function openShot(index: number): void {
  viewerStart.value = index;
  viewerOpen.value = true;
}

/** Cap the task panel also applies, so neither buffer grows without bound. */
const MAX_SHOTS = 6;

function addShots(files: File[]): void {
  for (const file of files) {
    if (shots.value.length >= MAX_SHOTS) break;
    if (!file.type.startsWith("image/")) continue;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        shots.value.push({ name: file.name, mime: file.type, dataUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  }
}

/**
 * Canned prompts, in the task panel's spirit and shape (`pm-canned-messages`):
 * the questions a user actually opens a story panel to ask, above the compose
 * box, until they start typing their own.
 */
const cannedMessages = computed<string[]>(() => {
  const s = props.story;
  if (s.attention > 0) {
    return [`${s.attention} task(s) in this story need input — what's blocking them?`];
  }
  if (s.total === 0) {
    return ["Break this story down into tasks.", "What would make this story complete?"];
  }
  if (s.complete) {
    return ["Is this story really done, or is anything untagged?"];
  }
  return [
    "Break the remaining work down into tasks.",
    "What's blocking this story?",
    "What should I do next?",
  ];
});

/** Restore the conversation after a browser reload or a server handover. */
async function hydrate(): Promise<void> {
  try {
    const r = await api<{ ok: boolean; lines: AgentOutputEntry[] }>(
      `/api/stories/${encodeURIComponent(props.story.key)}/pm/output`,
    );
    if (r.ok) repo.outputs[sessionId.value] = r.lines;
  } catch {
    // Best-effort — a missing transcript is an empty conversation, not an error
    // the user needs to act on. Same contract as the task panel's loadOutput.
  }
}

async function send(): Promise<void> {
  const text = draft.value.trim();
  if (!text || busy.value || !pmAgentEnabled.value) return;

  submitting.value = true;
  const optimistic: AgentOutputEntry = { type: "human", text, at: new Date().toISOString() };
  const optimisticIndex = lines.value.length;
  repo.outputs[sessionId.value] = [...lines.value, optimistic];
  draft.value = "";
  // Same wire shape as the task panel's attach: base64 without the data-URL
  // prefix. Kept local until the send succeeds so a failure doesn't lose them.
  const images = shots.value.map((s) => ({
    name: s.name,
    mime: s.mime,
    data: s.dataUrl.split(",")[1] ?? "",
  }));

  try {
    await api(
      `/api/stories/${encodeURIComponent(props.story.key)}/pm/message`,
      JSON_OPTS("POST", {
        text,
        images: images.length ? images : undefined,
        ...overrideBody(),
      }),
    );
    shots.value = [];
  } catch (error) {
    repo.outputs[sessionId.value] = (repo.outputs[sessionId.value] ?? []).filter(
      (_entry, index) => index !== optimisticIndex,
    );
    draft.value = text;
    repo.outputs[sessionId.value] = [
      ...(repo.outputs[sessionId.value] ?? []),
      { type: "sys", d: error instanceof Error ? error.message : String(error) },
    ];
    repo.onError(error);
  } finally {
    submitting.value = false;
  }
}

async function interrupt(): Promise<void> {
  try {
    await api(`/api/stories/${encodeURIComponent(props.story.key)}/pm/interrupt`, {
      method: "POST",
    });
  } catch (error) {
    repo.onError(error);
  }
}

watch(
  () => props.story.key,
  () => {
    void hydrate();
  },
  { immediate: true },
);
</script>

<template>
  <PmChatSurface
    v-bind="$attrs"
    v-model:draft="draft"
    :chat-id="sessionId"
    :lines="lines"
    :busy="busy"
    :disabled="!pmAgentEnabled"
    placeholder="Ask PM about this story…"
    welcome-title="Chat about this story"
    welcome-body="Ask the PM to break the story down into tasks, retag or update one, or discuss what is blocking it."
    log-label="Conversation with the PM about this story"
    :canned="cannedMessages"
    :shots="shots"
    @send="send"
    @interrupt="interrupt"
    @attach="addShots"
    @remove-shot="shots.splice($event, 1)"
    @open-shot="openShot"
  >
    <template #header>
      <div v-if="pmBase" class="agent-override-bar">
        <div class="agent-pick-grid">
          <div class="agent-field" style="grid-column: 1 / -1">
            <AgentModelControl
              :cli-options="cliOptions"
              :model-options="modelOptions"
              :memory-key="'story:' + story.key + ':pm'"
              v-model:cli="pick.cli"
              v-model:model="pick.model"
              :disabled="submitting"
            />
          </div>
        </div>
      </div>
    </template>
  </PmChatSurface>
  <ScreenshotViewer v-model:open="viewerOpen" :shots="viewerShots" :start-index="viewerStart" />
</template>
