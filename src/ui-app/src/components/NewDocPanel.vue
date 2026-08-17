<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { X, RotateCcw } from "lucide-vue-next";
import { useUiStore } from "../stores/ui";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { useDocsStore } from "../stores/docs";
import { insertTextAtCursor } from "../utils/text-insertion";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
import VoiceDictate from "./VoiceDictate.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";
import SelectSearchGroup from "./SelectSearchGroup.vue";
import AgentModelControl from "./AgentModelControl.vue";

const ui = useUiStore();
const repo = useRepoStore();
const config = useConfigStore();
const docs = useDocsStore();

const open = computed(() => ui.isNewDoc);
function setOpen(v: boolean): void {
  if (!v) ui.close();
}

function onOpenAutoFocus(e: Event): void {
  if (ui.isNewDoc) {
    e.preventDefault();
    requestAnimationFrame(() => {
      const id = newMode.value === "freeform" ? "nd-freeform" : "nd-path";
      document.getElementById(id)?.focus();
    });
  }
}

const newMode = ref<"freeform" | "manual">("freeform");
const freeformText = ref("");
const freeformError = ref("");
const freeformRunning = ref(false);
const freeformRunId = ref<string | null>(null);

const pmAgentReady = computed(() => {
  if (!config.loaded) return true;
  return (config.agents ?? []).some((a) => a.name === "pm" && a.enabled);
});

watch(
  () => ui.isNewDoc,
  (isNewDoc) => {
    if (!isNewDoc) return;
    newMode.value = config.form.defaultTaskMode === "manual" ? "manual" : "freeform";
    freeformText.value = "";
    freeformError.value = "";
    initFreeformOverrides();
  },
);

async function createFreeform(): Promise<void> {
  const text = freeformText.value.trim();
  if (!text) return;
  ui.saving = true;
  freeformRunning.value = true;
  freeformError.value = "";
  if (freeformRunId.value) repo.clearOutput(freeformRunId.value);
  freeformRunId.value = crypto.randomUUID();
  try {
    const overrides = freeformIsCustom.value
      ? { agent: freeformOverride.agent, cli: freeformOverride.cli, model: freeformOverride.model }
      : undefined;
    const res = await repo.createFreeformDocument(text, freeformRunId.value, overrides);
    ui.close();
    freeformText.value = "";
    await repo.refresh();
    await docs.loadDocs();
    if (res.path) await docs.loadDoc(res.path);
  } catch (err) {
    freeformError.value = err instanceof Error ? err.message : String(err);
  } finally {
    freeformRunning.value = false;
    freeformRunId.value = null;
    ui.saving = false;
  }
}

async function createDoc(): Promise<void> {
  if (!ui.nd.path || !ui.nd.content) return;
  ui.saving = true;
  try {
    const path = ui.nd.path;
    await repo.createDocument({ path, content: ui.nd.content });
    ui.close();
    ui.nd.path = "";
    ui.nd.content = "";
    await repo.refresh();
    await docs.loadDocs();
    await docs.loadDoc(path);
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

const enabledAgents = computed(() => (config.agents ?? []).filter((a) => a.enabled));
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

const freeformIsCustom = computed(() => {
  const base = freeformPmBase.value;
  if (!base) return false;
  return (
    freeformOverride.agent !== base.name ||
    freeformOverride.cli !== base.cli ||
    freeformOverride.model !== base.model
  );
});

function resetFreeformOverrides(): void {
  initFreeformOverrides();
}

const freeformLines = computed<{ s: "out" | "err"; d: string }[]>(() => {
  const raw = freeformRunId.value ? repo.outputs[freeformRunId.value] ?? [] : [];
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

const freeformTextarea = ref<HTMLTextAreaElement | null>(null);
const docBodyTextarea = ref<HTMLTextAreaElement | null>(null);

function onFreeformTranscribed(text: string): void {
  if (freeformTextarea.value) {
    insertTextAtCursor(freeformTextarea.value, text);
  }
}

function onDocBodyTranscribed(text: string): void {
  if (docBodyTextarea.value) {
    insertTextAtCursor(docBodyTextarea.value, text);
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
        <DialogTitle>New doc</DialogTitle>
        <DialogDescription class="sr-only">Create a new document</DialogDescription>
        <DialogClose class="close-x">
          <X class="size-[15px]" />
        </DialogClose>
      </div>

      <div class="drawer-tabs">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: newMode === 'freeform' }"
          @click="newMode = 'freeform'"
        >
          Freeform
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: newMode === 'manual' }"
          @click="newMode = 'manual'"
        >
          Manual doc
        </button>
      </div>

      <div class="drawer-body">
        <template v-if="newMode === 'freeform'">
          <div class="field">
            <div class="field-header">
              <label for="nd-freeform">Describe the document</label>
              <VoiceDictate @transcribed="onFreeformTranscribed" />
            </div>
            <textarea
              id="nd-freeform"
              ref="freeformTextarea"
              v-model="freeformText"
              class="ff-textarea"
              rows="10"
              placeholder="Type the document description — like explaining what should be documented. The PM agent writes the document and chooses an appropriate path."
            ></textarea>
          </div>
          <div class="ff-agent-bar">
            <div class="agent-pick-grid">
              <div class="agent-field">
                <label>Role</label>
                <Select v-model="freeformOverride.agent" :disabled="freeformRunning">
                  <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                    <SelectValue placeholder="agent" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                      <SelectItem v-for="a in enabledAgents" :key="a.name" :value="a.name">
                        {{ a.name }}
                      </SelectItem>
                    </SelectViewport>
                  </SelectContent>
                </Select>
              </div>
              <div class="agent-field" style="grid-column: 1 / -1">
                <AgentModelControl
                  :cli-options="cliOptions"
                  :model-options="modelOptions"
                  v-model:cli="freeformOverride.cli"
                  v-model:model="freeformOverride.model"
                  :disabled="freeformRunning"
                />
              </div>
            </div>
            <div v-if="freeformIsCustom" class="agent-override-actions">
              <span class="agent-custom-badge">custom</span>
              <Button
                variant="ghost"
                size="sm"
                :disabled="freeformRunning"
                @click="resetFreeformOverrides"
                title="Reset to PM defaults"
              >
                <RotateCcw class="size-3" />
              </Button>
            </div>
          </div>
          <div v-if="!pmAgentReady" class="ff-notice">
            No PM agent is configured.
            <router-link :to="{ name: 'agents' }" @click="ui.close()">
              Set one up on the Agents page
            </router-link>
            — until then use the Manual doc tab.
          </div>
          <div v-if="freeformError" class="ff-error">{{ freeformError }}</div>
          <div class="btn-row" style="margin-top: 20px">
            <Button variant="outline" @click="ui.close()">Cancel</Button>
            <Button
              variant="default"
              @click="createFreeform"
              :disabled="ui.saving || !freeformText.trim()"
            >
              <ActivityIndicator v-if="freeformRunning" />
              {{ freeformRunning ? "Asking the PM agent…" : "Create document" }}
            </Button>
          </div>
          <div v-if="freeformLines.length" class="ff-stream">
            <div class="ff-stream-head">
              <ActivityIndicator />
              PM agent
            </div>
            <div class="ff-stream-log" ref="ffLogEl">
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
        </template>
        <template v-else>
          <div class="field">
            <label for="nd-path">File path</label>
            <Input
              id="nd-path"
              v-model="ui.nd.path"
              placeholder="docs/my-document.md"
              @keyup.enter="createDoc"
            />
          </div>
          <div class="field">
            <div class="field-header">
              <label for="nd-content">Content</label>
              <VoiceDictate @transcribed="onDocBodyTranscribed" />
            </div>
            <textarea
              id="nd-content"
              ref="docBodyTextarea"
              v-model="ui.nd.content"
              class="doc-textarea"
              rows="15"
              placeholder="Enter the document content in Markdown format..."
            ></textarea>
          </div>
          <div class="btn-row" style="margin-top: 20px">
            <Button variant="outline" @click="ui.close()">Cancel</Button>
            <Button variant="default" @click="createDoc" :disabled="ui.saving || !ui.nd.path || !ui.nd.content">
              Create
            </Button>
          </div>
        </template>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.ff-textarea,
.doc-textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-family: monospace;
  font-size: 12px;
  resize: vertical;
  background: var(--bg-secondary);
  color: var(--txt);
}

.ff-agent-bar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 12px 0;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.agent-pick-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

.agent-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-field label {
  font-size: 12px;
  font-weight: 500;
  color: var(--txt-secondary);
}

.agent-override-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-custom-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--accent-alpha);
  color: var(--accent);
  border-radius: 4px;
  font-weight: 600;
}

.ff-notice {
  margin: 12px 0;
  padding: 10px;
  background: var(--info-alpha);
  color: var(--info);
  border-radius: 6px;
  font-size: 13px;
}

.ff-notice a {
  color: inherit;
  text-decoration: underline;
}

.ff-error {
  margin: 12px 0;
  padding: 10px;
  background: var(--red-alpha);
  color: var(--red);
  border-radius: 6px;
  font-size: 13px;
}

.ff-stream {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.ff-stream-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--txt-secondary);
}

.ff-stream-log {
  max-height: 200px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 11px;
  line-height: 1.5;
}

.ff-stream-line {
  color: var(--txt-faint);
  word-break: break-all;
}

.ff-stream-line.err {
  color: var(--red);
}

.btn-row {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.field-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--txt-secondary);
}
</style>
