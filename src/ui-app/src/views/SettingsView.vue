<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfigStore } from "../stores/config";
import { useUiStore } from "../stores/ui";
import { api } from "../api";
import Button from "../components/ui/button.vue";
import Card from "../components/ui/card.vue";
import Input from "../components/ui/input.vue";
import Switch from "../components/ui/switch.vue";
import Select from "../components/ui/select/root.vue";
import SelectContent from "../components/ui/select/content.vue";
import SelectItem from "../components/ui/select/item.vue";
import SelectTrigger from "../components/ui/select/trigger.vue";
import SelectValue from "../components/ui/select/value.vue";
import SelectViewport from "../components/ui/select/viewport.vue";

const config = useConfigStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const tunnelReadiness = ref<Record<string, any> | null>(null);
const tunnelStatus = computed(() => {
  if (!tunnelReadiness.value?.configured?.tunnelId) return "Not configured";
  if (tunnelReadiness.value.running) return "Running";
  return tunnelReadiness.value.originCertificate?.usable ? "Configured but stopped" : "Needs attention";
});
onMounted(async () => {
  try { tunnelReadiness.value = await api("/api/tunnel/readiness?port=7171"); } catch { /* status remains safe default */ }
});
const generalFields = computed(() =>
  config.visibleFields.filter((field) => field.key !== "tunnelEnabled"),
);

function focusSetting(key: string): void {
  const el = document.getElementById(`setting-${key}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash");
  window.setTimeout(() => el.classList.remove("flash"), 2000);
  const input = el.querySelector<HTMLElement>("input, select, [role='combobox']");
  if (input) input.focus();
}

watch(
  () => route.query.focus as string | undefined,
  (key) => {
    if (!key) return;
    const tryFocus = (attempt = 0): void => {
      if (config.loaded && document.getElementById(`setting-${key}`)) {
        focusSetting(key);
        void router.replace({ name: "settings" });
      } else if (attempt < 20) {
        window.setTimeout(() => tryFocus(attempt + 1), 100);
      }
    };
    tryFocus();
  },
  { immediate: true },
);

// ---- Auto-save settings (mirrors the Agents page implementation) ----

const form = reactive<Record<string, unknown>>({});
let syncing = false;
let autoSaveTimer: ReturnType<typeof setTimeout> | undefined;
let saveInFlight = false;
let savePending = false;

function sync(): void {
  syncing = true;
  for (const key of Object.keys(config.form)) {
    form[key] = config.form[key];
  }
  syncing = false;
}

watch(
  () => config.loaded,
  (loaded) => {
    if (loaded) sync();
  },
  { immediate: true },
);

function buildBody(): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of config.schema) {
    if (f.tier === "guarded" && !config.showAdvanced) continue;
    let val = form[f.key];
    if (f.type === "array" && typeof val === "string") {
      val = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    body[f.key] = val;
  }
  return body;
}

async function autoSave(): Promise<void> {
  if (saveInFlight) {
    savePending = true;
    return;
  }
  saveInFlight = true;
  savePending = false;
  try {
    await config.save(buildBody());
  } catch {
    // The store exposes the error inline; keep edits in place for the next retry.
  } finally {
    saveInFlight = false;
    if (savePending) scheduleAutoSave(0);
  }
}

function scheduleAutoSave(delay = 450): void {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => void autoSave(), delay);
}

watch(
  form,
  () => {
    if (syncing || !config.loaded) return;
    config.msg = "";
    config.error = "";
    if (saveInFlight) savePending = true;
    scheduleAutoSave();
  },
  { deep: true, flush: "sync" },
);

// Apply theme preferences live as the user changes them.
watch(
  () => form.theme,
  (t) => {
    if (typeof t === "string") config.applyTheme(t, true);
  },
);
watch(
  () => form.uiTheme,
  (t) => {
    if (typeof t === "string") config.applyUiTheme(t, true);
  },
);

onUnmounted(() => {
  clearTimeout(autoSaveTimer);
});
</script>

<template>
  <div>
    <div class="page-title">Settings</div>
    <div class="page-desc">
      RepoOS configuration · <span class="mono" style="color: var(--cyan)">repoos.toml</span>
      <span v-if="config.saving"> · Saving…</span>
      <span v-else-if="config.error" class="save-msg err"> · {{ config.error }}</span>
      <span v-else-if="config.msg" class="save-msg ok"> · {{ config.msg }}</span>
    </div>

    <div v-if="!config.loaded" class="spin"></div>

    <div v-else>
      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span class="live-dot"></span>General
          </div>
          <div v-for="f in generalFields" :key="f.key" :id="`setting-${f.key}`" class="setting-row">
            <div class="setting-info">
              <div class="setting-label">{{ f.label }}</div>
              <div class="setting-desc">{{ f.description }}</div>
            </div>
            <div class="setting-input">
              <Select
                v-if="f.type === 'select'"
                :model-value="String(form[f.key])"
                :disabled="config.saving"
                @update:model-value="(v) => (form[f.key] = v)"
              >
                <SelectTrigger class="h-[34px] w-[200px] rounded-[9px] px-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                    <SelectItem v-for="o in f.options" :key="o.value" :value="o.value">{{
                      o.label
                    }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
              <Switch
                v-else-if="f.type === 'boolean'"
                :checked="!!form[f.key]"
                :disabled="config.saving"
                @update:checked="(v: boolean) => (form[f.key] = v)"
              />
            </div>
            <span v-if="f.restartRequired" class="restart-badge">restart required</span>
          </div>
        </div>
      </Card>

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span class="live-dot"></span>Publishing
          </div>
          <div id="setting-tunnelEnabled" class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Cloudflare publishing</div>
              <div class="setting-desc">
                Configure a protected public hostname for a local RepoOS service. This card reports
                status; it does not start or stop cloudflared.
              </div>
            </div>
            <div class="setting-input tunnel-setting-actions">
              <span class="tunnel-status-chip">{{ tunnelStatus }}</span>
              <Button variant="outline" size="sm" @click="ui.openTunnel()">Configure publishing</Button>
            </div>
          </div>
        </div>
      </Card>

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span
              style="cursor: pointer; user-select: none"
              @click="config.showAdvanced = !config.showAdvanced"
            >
              <span v-if="config.showAdvanced">▾</span><span v-else>▸</span> Advanced
            </span>
          </div>
          <div v-if="config.showAdvanced">
            <div class="adv-gate">
              <div class="warning">
                ⚠ Changing these may break the running server. Edit with care.
              </div>
            </div>
            <div
              v-for="f in config.guardedFields"
              :key="f.key"
              :id="`setting-${f.key}`"
              class="setting-row"
            >
              <div class="setting-info">
                <div class="setting-label">{{ f.label }}</div>
                <div class="setting-desc">{{ f.description }}</div>
              </div>
              <div class="setting-input">
                <Input
                  v-if="f.type === 'string'"
                  :model-value="String(form[f.key])"
                  type="text"
                  :disabled="config.saving"
                  @update:model-value="(v) => (form[f.key] = v)"
                />
                <Input
                  v-else-if="f.type === 'array'"
                  :model-value="String(form[f.key])"
                  type="text"
                  :disabled="config.saving"
                  placeholder=".md, .markdown"
                  @update:model-value="(v) => (form[f.key] = v)"
                />
              </div>
              <span v-if="f.restartRequired" class="restart-badge">restart required</span>
            </div>
          </div>
        </div>
      </Card>

    </div>
  </div>
</template>
