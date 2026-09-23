<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { useUiStore } from "../stores/ui";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
import VoiceDictate from "./VoiceDictate.vue";
import AgentModelControl from "./AgentModelControl.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";

const ui = useUiStore();
const repo = useRepoStore();
const config = useConfigStore();

const open = computed(() => ui.isNewStory);
function setOpen(v: boolean): void {
  if (!v) ui.close();
}

const storyName = ref("");
const description = ref("");
const formError = ref("");
const freeformRunning = ref(false);
const freeformRunId = ref<string | null>(null);

const pmAgentReady = computed(() => {
  if (!config.loaded) return true;
  return (config.agents ?? []).some((a) => a.name === "pm" && a.enabled);
});

const cliOptions = computed(() => config.agentsMeta.clis ?? []);
const modelOptions = computed(() =>
  config.modelsFor(freeformOverride.cli, freeformOverride.model || undefined),
);

const freeformPmBase = computed(() => {
  const list = config.agents?.length ? config.agents : [];
  return list.find((a) => a.enabled && a.name === "pm") ?? null;
});

const freeformOverride = reactive({
  agent: "",
  cli: "",
  model: "",
});

function initFreeformOverrides(): void {
  const base = freeformPmBase.value;
  freeformOverride.agent = base?.name || "";
  freeformOverride.cli = base?.cli || "";
  freeformOverride.model = base?.model || "";
}

watch(
  () => ui.isNewStory,
  (isOpen) => {
    if (!isOpen) return;
    storyName.value = "";
    description.value = "";
    formError.value = "";
    initFreeformOverrides();
  },
);

const freeformIsCustom = computed(() => {
  const base = freeformPmBase.value;
  if (!base) return false;
  return (
    freeformOverride.agent !== base.name ||
    freeformOverride.cli !== base.cli ||
    freeformOverride.model !== base.model
  );
});

const freeformLines = computed<{ s: "out" | "err"; d: string }[]>(() => {
  const raw = freeformRunId.value ? (repo.outputs[freeformRunId.value] ?? []) : [];
  return raw.map((e) => {
    if ("type" in e) {
      return { s: "out", d: e.type === "text" ? e.text : ((e as { d?: string }).d ?? "") };
    }
    return { s: e.s === "err" ? "err" : "out", d: e.d };
  });
});

const ffLogEl = ref<HTMLElement | null>(null);
watch(freeformLines, () => {
  nextTick(() => {
    const el = ffLogEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
});

const descriptionTextarea = ref<HTMLTextAreaElement | null>(null);

function onDescriptionTranscribed(text: string): void {
  if (descriptionTextarea.value) {
    const el = descriptionTextarea.value;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    description.value = el.value;
  }
}

async function createStory(): Promise<void> {
  const desc = description.value.trim();
  if (!desc || freeformRunning.value) return;
  ui.saving = true;
  freeformRunning.value = true;
  formError.value = "";
  if (freeformRunId.value) repo.clearOutput(freeformRunId.value);
  freeformRunId.value = crypto.randomUUID();
  try {
    const overrides = freeformIsCustom.value
      ? { agent: freeformOverride.agent, cli: freeformOverride.cli, model: freeformOverride.model }
      : undefined;
    const res = await repo.createFreeformStory(
      { name: storyName.value.trim(), description: desc },
      freeformRunId.value,
      overrides,
    );
    if (res.fallback && res.pmError) {
      formError.value = `PM agent failed: ${res.pmError} — saved as-is.`;
      await new Promise((r) => setTimeout(r, 1200));
    }
    ui.close();
    storyName.value = "";
    description.value = "";
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err);
  } finally {
    freeformRunning.value = false;
    freeformRunId.value = null;
    ui.saving = false;
  }
}

function onOpenAutoFocus(e: Event): void {
  if (ui.isNewStory) {
    e.preventDefault();
    requestAnimationFrame(() => document.getElementById("ns-story-name")?.focus());
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="setOpen">
    <DialogOverlay />
    <DialogContent
      :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }"
      @open-auto-focus="onOpenAutoFocus"
    >
      <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>
      <div class="drawer-head">
        <div class="drawer-head-title">
          <DialogTitle>New story</DialogTitle>
          <DialogDescription class="sr-only"
            >Capture a delivery slice before breaking it into tasks</DialogDescription
          >
        </div>
        <DialogClose class="close-x"><X class="size-[15px]" /></DialogClose>
      </div>
      <div class="drawer-body">
        <div class="field">
          <label for="ns-story-name">Story name</label>
          <Input
            id="ns-story-name"
            v-model="storyName"
            placeholder="Project updates email"
            :disabled="freeformRunning"
          />
        </div>
        <div class="field">
          <div class="field-header">
            <label for="ns-story-desc">Description</label>
            <VoiceDictate @transcribed="onDescriptionTranscribed" />
          </div>
          <textarea
            id="ns-story-desc"
            ref="descriptionTextarea"
            v-model="description"
            class="ff-textarea"
            rows="10"
            placeholder="Describe the outcome, areas involved, and constraints — the PM agent will flesh this out."
            :disabled="freeformRunning"
          ></textarea>
        </div>
        <div class="ff-agent-bar">
          <div class="agent-pick-grid">
            <div class="agent-field" style="grid-column: 1 / -1">
              <AgentModelControl
                :cli-options="cliOptions"
                :model-options="modelOptions"
                memory-key="panel:new-story"
                v-model:cli="freeformOverride.cli"
                v-model:model="freeformOverride.model"
                :disabled="freeformRunning"
              />
            </div>
          </div>
        </div>
        <div v-if="!pmAgentReady" class="ff-notice">
          No PM agent is configured.
          <router-link :to="{ name: 'agents' }" @click="ui.close()">
            Set one up on the Agents page
          </router-link>
          — your description will be saved as-is.
        </div>
        <div v-if="formError" class="ff-error">{{ formError }}</div>
        <div class="btn-row" style="margin-top: 20px">
          <Button variant="outline" @click="ui.close()">Cancel</Button>
          <Button
            variant="default"
            :disabled="ui.saving || !description.trim()"
            @click="createStory"
          >
            <ActivityIndicator v-if="freeformRunning" />
            {{ freeformRunning ? "Asking the PM agent…" : "Create story" }}
          </Button>
        </div>
        <div v-if="freeformLines.length" class="ff-stream">
          <div class="ff-stream-head">
            <ActivityIndicator />
            PM agent
          </div>
          <div ref="ffLogEl" class="ff-stream-log">
            <div
              v-for="(line, i) in freeformLines"
              :key="i"
              class="ff-stream-line"
              :class="line.s === 'err' ? 'err' : ''"
            >
              {{ line.d }}
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
