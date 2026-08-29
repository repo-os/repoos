<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { useUiStore } from "../stores/ui";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { useDocsStore } from "../stores/docs";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
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
const docs = useDocsStore();

const open = computed(() => ui.isNewSkill);
function setOpen(v: boolean): void {
  if (!v) ui.close();
}

const newMode = ref<"freeform" | "manual" | "upload">("freeform");
const freeformText = ref("");
const freeformError = ref("");
const freeformRunning = ref(false);
const freeformRunId = ref<string | null>(null);

const manualError = ref("");
const uploadFile = ref<File | null>(null);
const uploadError = ref("");

const pmAgentReady = computed(() => {
  if (!config.loaded) return true;
  return (config.agents ?? []).some((a) => a.name === "pm" && a.enabled);
});

/** The freeform skill is authored by the PM agent; the coding agent + model
 *  default to the PM role's config and can be overridden here (no role picker —
 *  the role is always PM). */
const pmBase = computed(
  () => (config.agents ?? []).find((a) => a.enabled && a.name === "pm") ?? null,
);

const freeformOverride = reactive({ cli: "", model: "" });

function initOverride(): void {
  freeformOverride.cli = pmBase.value?.cli || "";
  freeformOverride.model = pmBase.value?.model || "";
}

const overrideIsCustom = computed(() => {
  const base = pmBase.value;
  if (!base) return false;
  return freeformOverride.cli !== base.cli || freeformOverride.model !== base.model;
});

const cliOptions = computed(() => config.agentsMeta.clis ?? []);
const modelOptions = computed(() =>
  config.modelsFor(freeformOverride.cli, freeformOverride.model || undefined),
);

/** Preview the folder slug the way the server derives it. */
const slug = computed(() =>
  ui.ns.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, ""),
);

watch(
  () => ui.isNewSkill,
  (isNewSkill) => {
    if (!isNewSkill) return;
    newMode.value = "freeform";
    freeformText.value = "";
    freeformError.value = "";
    manualError.value = "";
    uploadFile.value = null;
    uploadError.value = "";
    initOverride();
  },
);

async function afterCreate(path: string | undefined): Promise<void> {
  ui.close();
  await repo.refresh();
  await docs.loadSkills();
  if (path) await docs.loadSkill(path);
}

async function createFreeform(): Promise<void> {
  const text = freeformText.value.trim();
  if (!text) return;
  ui.saving = true;
  freeformRunning.value = true;
  freeformError.value = "";
  if (freeformRunId.value) repo.clearOutput(freeformRunId.value);
  freeformRunId.value = crypto.randomUUID();
  try {
    const overrides = overrideIsCustom.value
      ? { cli: freeformOverride.cli, model: freeformOverride.model }
      : undefined;
    const res = await repo.createFreeformSkill(text, freeformRunId.value, overrides);
    freeformText.value = "";
    await afterCreate(res.path);
  } catch (err) {
    freeformError.value = err instanceof Error ? err.message : String(err);
  } finally {
    freeformRunning.value = false;
    freeformRunId.value = null;
    ui.saving = false;
  }
}

async function createManual(): Promise<void> {
  if (!ui.ns.name.trim() || !ui.ns.description.trim() || !ui.ns.content.trim()) return;
  ui.saving = true;
  manualError.value = "";
  try {
    const res = await repo.createSkill({
      name: ui.ns.name.trim(),
      description: ui.ns.description.trim(),
      body: ui.ns.content,
    });
    await afterCreate(res.path);
  } catch (err) {
    manualError.value = err instanceof Error ? err.message : String(err);
  } finally {
    ui.saving = false;
  }
}

async function createUpload(): Promise<void> {
  if (!uploadFile.value || !ui.ns.name.trim()) return;
  ui.saving = true;
  uploadError.value = "";
  try {
    const content = await uploadFile.value.text();
    const res = await repo.createSkill({ name: ui.ns.name.trim(), content });
    await afterCreate(res.path);
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : String(err);
  } finally {
    ui.saving = false;
  }
}

function onUploadFileSelected(e: Event): void {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length > 0) uploadFile.value = files[0];
}

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
</script>

<template>
  <Dialog :open="open" @update:open="setOpen">
    <DialogOverlay />
    <DialogContent :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }">
      <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>

      <div class="drawer-head">
        <DialogTitle>New skill</DialogTitle>
        <DialogDescription class="sr-only">Create a new skill</DialogDescription>
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
          Manual
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: newMode === 'upload' }"
          @click="newMode = 'upload'"
        >
          Upload
        </button>
      </div>

      <div class="drawer-body">
        <template v-if="newMode === 'freeform'">
          <div class="field">
            <label for="ns-freeform">Describe the skill</label>
            <textarea
              id="ns-freeform"
              v-model="freeformText"
              class="ff-textarea"
              rows="10"
              placeholder="Describe what the skill should do and when an agent should reach for it. The PM agent writes the SKILL.md and picks the skills/<name>/ folder."
            ></textarea>
          </div>
          <div class="ff-agent-bar">
            <AgentModelControl
              :cli-options="cliOptions"
              :model-options="modelOptions"
              v-model:cli="freeformOverride.cli"
              v-model:model="freeformOverride.model"
              :disabled="freeformRunning"
            />
          </div>
          <div v-if="!pmAgentReady" class="ff-notice">
            No PM agent is configured.
            <router-link :to="{ name: 'agents' }" @click="ui.close()">
              Set one up on the Agents page
            </router-link>
            — until then use the Manual tab.
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
              {{ freeformRunning ? "Asking the PM agent…" : "Create skill" }}
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

        <template v-else-if="newMode === 'manual'">
          <div class="field">
            <label for="ns-name">Skill name</label>
            <Input id="ns-name" v-model="ui.ns.name" placeholder="my-skill" />
            <div v-if="slug" class="hint">→ skills/{{ slug }}/SKILL.md</div>
          </div>
          <div class="field">
            <label for="ns-desc">Description</label>
            <Input
              id="ns-desc"
              v-model="ui.ns.description"
              placeholder="One line: when should an agent use this skill?"
            />
          </div>
          <div class="field">
            <label for="ns-body">Instructions (Markdown)</label>
            <textarea
              id="ns-body"
              v-model="ui.ns.content"
              class="doc-textarea"
              rows="14"
              placeholder="# My skill&#10;&#10;What the agent should do when this skill is active..."
            ></textarea>
          </div>
          <div v-if="manualError" class="ff-error">{{ manualError }}</div>
          <div class="btn-row" style="margin-top: 20px">
            <Button variant="outline" @click="ui.close()">Cancel</Button>
            <Button
              variant="default"
              @click="createManual"
              :disabled="
                ui.saving ||
                !ui.ns.name.trim() ||
                !ui.ns.description.trim() ||
                !ui.ns.content.trim()
              "
            >
              Create
            </Button>
          </div>
        </template>

        <template v-else>
          <div class="field">
            <label for="ns-upload-name">Skill name</label>
            <Input id="ns-upload-name" v-model="ui.ns.name" placeholder="my-skill" />
            <div v-if="slug" class="hint">→ skills/{{ slug }}/SKILL.md</div>
          </div>
          <div class="field">
            <label for="ns-upload-file">Select SKILL.md</label>
            <input
              id="ns-upload-file"
              type="file"
              class="upload-input"
              @change="onUploadFileSelected"
            />
            <div v-if="uploadFile" class="upload-file-info">
              {{ uploadFile.name }} ({{ (uploadFile.size / 1024).toFixed(1) }} KB)
            </div>
          </div>
          <div v-if="uploadError" class="ff-error">{{ uploadError }}</div>
          <div class="btn-row" style="margin-top: 20px">
            <Button variant="outline" @click="ui.close()">Cancel</Button>
            <Button
              variant="default"
              @click="createUpload"
              :disabled="ui.saving || !uploadFile || !ui.ns.name.trim()"
            >
              Upload
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

.hint {
  font-family: monospace;
  font-size: 11px;
  color: var(--txt-faint);
}

.ff-agent-bar {
  display: flex;
  margin: 12px 0;
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

.field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--txt-secondary);
}

.upload-input {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--txt);
  cursor: pointer;
  font-size: 13px;
}

.upload-input:hover {
  border-color: var(--border-focus);
}

.upload-file-info {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border-radius: 6px;
  font-size: 12px;
  color: var(--txt-secondary);
}
</style>
