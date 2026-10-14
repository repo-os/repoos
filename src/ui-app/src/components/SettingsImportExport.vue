<script setup lang="ts">
import { computed, ref } from "vue";
import { useConfigStore, DESIGN_THEMES, MAX_FAVORITE_THEMES } from "../stores/config";
import { useRepoStore } from "../stores/repo";
import { api, JSON_OPTS } from "../api";
import Button from "./ui/button.vue";
import Card from "./ui/card.vue";
import Switch from "./ui/switch.vue";
import {
  AGENT_FAVORITES_KEY,
  AGENT_MODEL_FAVORITES_KEY,
  EXPORT_SECTIONS,
  FAVORITE_THEMES_KEY,
  buildImportPatch,
  exportFilename,
  parseSettingsExport,
  sanitizeAgentModelFavorites,
  sanitizeBudgetAllowlist,
  sanitizeIdList,
  sanitizeRemoteValidation,
  serializeSettingsExport,
  summarizeSettingsExport,
  type ExportSectionId,
  type ExportSelection,
  type ParsedSettingsExport,
  type SettingsExportData,
} from "../lib/settings-transfer";

const config = useConfigStore();
const repo = useRepoStore();

// ---- Export ----

const selection = ref<ExportSelection>({
  budgetAllowlist: true,
  agentModelFavorites: true,
  starredAgents: true,
  starredThemes: true,
  remoteValidation: true,
});

const anySelected = computed(() => Object.values(selection.value).some(Boolean));

const filenamePreview = computed(() => exportFilename(repo.repoName, new Date()));

const exportMsg = ref("");
const exportError = ref("");

function readLocalJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : [];
  } catch {
    return [];
  }
}

function collectExportData(): SettingsExportData {
  const data: SettingsExportData = {};
  const serverConfig = (config.data ?? {}) as Record<string, unknown>;
  if (selection.value.budgetAllowlist) {
    data.budgetAllowlist = sanitizeBudgetAllowlist(serverConfig["budget.allowlist"]);
  }
  if (selection.value.remoteValidation) {
    data.remoteValidation = sanitizeRemoteValidation(serverConfig.remoteValidation).config;
  }
  if (selection.value.agentModelFavorites) {
    data.agentModelFavorites = sanitizeAgentModelFavorites(
      readLocalJson(AGENT_MODEL_FAVORITES_KEY),
    );
  }
  if (selection.value.starredAgents) {
    data.starredAgents = sanitizeIdList(readLocalJson(AGENT_FAVORITES_KEY));
  }
  if (selection.value.starredThemes) {
    data.starredThemes = [...config.favoriteThemes];
  }
  return data;
}

function doExport(): void {
  exportMsg.value = "";
  exportError.value = "";
  if (!anySelected.value) {
    exportError.value = "Select at least one setting to export.";
    return;
  }
  try {
    const now = new Date();
    const filename = exportFilename(repo.repoName, now);
    const toml = serializeSettingsExport(collectExportData(), {
      repo: repo.repoName || "repo",
      exportedAt: now.toISOString(),
    });
    // A plain `<a download>` click: the browser saves to the user's default
    // Downloads folder on its own — no location picker involved.
    const blob = new Blob([toml], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    exportMsg.value = `Downloaded ${filename} — check your Downloads folder.`;
  } catch (e) {
    exportError.value = e instanceof Error ? e.message : String(e);
  }
}

// ---- Import ----

const dragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const pendingFile = ref<{ name: string; parsed: ParsedSettingsExport } | null>(null);
const applying = ref(false);
const importError = ref("");
const importMsg = ref("");

const pendingSummary = computed(() =>
  pendingFile.value
    ? summarizeSettingsExport(pendingFile.value.parsed.data, pendingFile.value.parsed.present)
    : [],
);

function resetFileInput(): void {
  if (fileInput.value) fileInput.value.value = "";
}

async function readExportFile(file: File): Promise<void> {
  importError.value = "";
  importMsg.value = "";
  pendingFile.value = null;
  let text: string;
  try {
    text = await file.text();
  } catch (e) {
    importError.value = `Couldn't read ${file.name}: ${e instanceof Error ? e.message : String(e)}`;
    resetFileInput();
    return;
  }
  const result = parseSettingsExport(text);
  if (!result.ok) {
    importError.value = result.error;
    resetFileInput();
    return;
  }
  pendingFile.value = { name: file.name, parsed: result.parsed };
  resetFileInput();
}

function onFilePicked(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void readExportFile(file);
}

function onDrop(event: DragEvent): void {
  dragOver.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) void readExportFile(file);
}

function cancelImport(): void {
  pendingFile.value = null;
  importError.value = "";
  importMsg.value = "";
}

function writeLocalJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw new Error(`Couldn't save ${key} locally: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function applyImport(): Promise<void> {
  if (!pendingFile.value || applying.value) return;
  applying.value = true;
  importError.value = "";
  importMsg.value = "";
  try {
    const { parsed } = pendingFile.value;
    const { data, present } = parsed;
    const warnings = [...parsed.warnings];

    // Server-side settings first: PATCH validates everything before writing,
    // so a failure here applies nothing at all.
    const { patch, warnings: patchWarnings } = buildImportPatch(data);
    warnings.push(...patchWarnings);
    const serverSectionIds: ExportSectionId[] = [];
    if (data.budgetAllowlist !== undefined) serverSectionIds.push("budgetAllowlist");
    if (
      data.remoteValidation !== undefined &&
      Object.keys(patch).some((k) => k !== "budget.allowlist")
    ) {
      serverSectionIds.push("remoteValidation");
    }
    if (Object.keys(patch).length) {
      await api("/api/config", JSON_OPTS("PATCH", patch));
    }

    // Browser-local favorites: the stores behind the Agents page and the
    // theme list read these on mount, so a write here is the apply.
    const localSectionIds: ExportSectionId[] = [];
    if (data.agentModelFavorites !== undefined) {
      const favs = sanitizeAgentModelFavorites(data.agentModelFavorites).map((f) => ({
        cli: f.cli,
        model: f.model,
        addedAt: f.addedAt ?? Date.now(),
        ...(f.recentlyUsedAt !== undefined ? { recentlyUsedAt: f.recentlyUsedAt } : {}),
      }));
      writeLocalJson(AGENT_MODEL_FAVORITES_KEY, favs);
      localSectionIds.push("agentModelFavorites");
    }
    if (data.starredAgents !== undefined) {
      writeLocalJson(AGENT_FAVORITES_KEY, sanitizeIdList(data.starredAgents));
      localSectionIds.push("starredAgents");
    }
    if (data.starredThemes !== undefined) {
      const known = new Set(DESIGN_THEMES.map((t) => t.id));
      const ids = sanitizeIdList(data.starredThemes)
        .filter((id) => known.has(id))
        .slice(0, MAX_FAVORITE_THEMES);
      writeLocalJson(FAVORITE_THEMES_KEY, ids);
      config.favoriteThemes = [...ids];
      config.themeFavoritesNotice = "";
      localSectionIds.push("starredThemes");
    }

    const applied = [...serverSectionIds, ...localSectionIds];
    if (!applied.length) {
      importMsg.value =
        "Nothing to apply — the file's sections are all empty. No settings were changed.";
    } else {
      // Refresh the Settings form from what the server just saved.
      await config.load();
      const names = applied
        .map((id) => EXPORT_SECTIONS.find((s) => s.id === id)?.label ?? id)
        .join(", ");
      importMsg.value = `Applied ${names} from ${pendingFile.value.name}.`;
      if (
        localSectionIds.includes("agentModelFavorites") ||
        localSectionIds.includes("starredAgents")
      ) {
        importMsg.value += " Agent favorites apply the next time the Agents page loads.";
      }
    }
    if (warnings.length) {
      importMsg.value += ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"} — see below.)`;
    }
    pendingFile.value = { name: pendingFile.value.name, parsed: { ...parsed, warnings } };
  } catch (e) {
    importError.value = e instanceof Error ? e.message : String(e);
  } finally {
    applying.value = false;
  }
}
</script>

<template>
  <div>
    <Card style="padding: 0 18px 6px; margin-bottom: 16px">
      <div class="setting-group">
        <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
          <span class="live-dot"></span>Export settings
        </div>
        <div class="setting-desc" style="padding: 4px 0 12px">
          Choose what to include, then download it as a TOML file. Import that file on another
          project to copy these settings over.
        </div>
        <div v-for="s in EXPORT_SECTIONS" :key="s.id" class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ s.label }}</div>
            <div class="setting-desc">{{ s.description }}</div>
          </div>
          <div class="setting-input">
            <Switch
              :checked="!!selection[s.id]"
              :disabled="!config.loaded"
              @update:checked="(v: boolean) => (selection[s.id] = v)"
            />
          </div>
        </div>
        <div class="ie-actions">
          <Button size="sm" :disabled="!anySelected || !config.loaded" @click="doExport">
            Download export
          </Button>
          <span class="setting-desc">
            Saves as <span class="mono">{{ filenamePreview }}</span> in your Downloads folder.
          </span>
        </div>
        <div v-if="exportMsg" class="ff-notice" role="status">{{ exportMsg }}</div>
        <div v-if="exportError" class="ff-error" role="alert">{{ exportError }}</div>
      </div>
    </Card>

    <Card style="padding: 0 18px 6px; margin-bottom: 16px">
      <div class="setting-group">
        <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
          <span class="live-dot"></span>Import settings
        </div>
        <div class="setting-desc" style="padding: 4px 0 12px">
          Drop an exported settings file below, or choose one. Only the settings present in the file
          are applied — everything else in this project stays as it is.
        </div>
        <label
          class="shot-dropzone ie-dropzone"
          :class="{ over: dragOver }"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
        >
          <input
            ref="fileInput"
            class="shot-input"
            type="file"
            accept=".toml,text/plain"
            aria-label="Choose a settings export file"
            @change="onFilePicked"
          />
          <span>Drop a <span class="mono">.toml</span> export here, or click to browse…</span>
        </label>

        <div v-if="pendingFile" class="ie-review">
          <div class="setting-label">{{ pendingFile.name }} — review before applying</div>
          <ul class="ie-summary">
            <li v-for="item in pendingSummary" :key="item.id">
              <strong>{{ item.label }}:</strong> {{ item.detail }}
            </li>
          </ul>
          <div v-if="pendingFile.parsed.warnings.length" class="ff-notice" role="status">
            <div v-for="(w, i) in pendingFile.parsed.warnings" :key="i">{{ w }}</div>
          </div>
          <div class="ie-actions">
            <Button size="sm" :disabled="applying" @click="applyImport">
              {{ applying ? "Applying…" : "Apply to this project" }}
            </Button>
            <Button size="sm" variant="outline" :disabled="applying" @click="cancelImport">
              Cancel
            </Button>
          </div>
        </div>

        <div v-if="importMsg" class="ff-notice" role="status">{{ importMsg }}</div>
        <div v-if="importError" class="ff-error" role="alert">{{ importError }}</div>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.ie-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 0;
}
.ie-dropzone {
  margin-bottom: 12px;
}
.ie-review {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 8px;
}
.ie-summary {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 13px;
  color: var(--txt-dim);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ie-summary strong {
  color: var(--txt);
  font-weight: 600;
}
.ff-notice,
.ff-error {
  margin-bottom: 12px;
}
</style>
