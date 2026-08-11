<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfigStore } from "../stores/config";
import { useUiStore } from "../stores/ui";
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
const generalFields = computed(() =>
  config.visibleFields.filter((field) => field.key !== "tunnelEnabled"),
);

async function toggleTunnel(enabled: boolean): Promise<void> {
  try {
    await config.setTunnelEnabled(enabled);
    if (enabled) ui.openTunnel();
    else ui.closeTunnel();
  } catch {
    // The config store restores the previous value and surfaces the error.
  }
}

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
</script>

<template>
  <div>
    <div class="page-title">Settings</div>
    <div class="page-desc">
      RepoOS configuration · <span class="mono" style="color: var(--cyan)">repoos.toml</span>
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
                :model-value="String(config.form[f.key])"
                :disabled="config.saving"
                @update:model-value="(v) => (config.form[f.key] = v)"
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
                :checked="!!config.form[f.key]"
                :disabled="config.saving"
                @update:checked="(v) => (config.form[f.key] = v)"
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
              <div class="setting-label">Cloudflare Tunnel</div>
              <div class="setting-desc">
                Publish local apps securely through Cloudflare Tunnel + Access. Off by default.
              </div>
            </div>
            <div class="setting-input tunnel-setting-actions">
              <Button
                v-if="config.form.tunnelEnabled"
                variant="outline"
                size="sm"
                :disabled="config.saving"
                @click="ui.openTunnel()"
              >
                Open setup
              </Button>
              <Switch
                :checked="!!config.form.tunnelEnabled"
                :disabled="config.saving"
                aria-label="Enable Cloudflare Tunnel publishing"
                @update:checked="toggleTunnel"
              />
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
                  :model-value="String(config.form[f.key])"
                  type="text"
                  :disabled="config.saving"
                  @update:model-value="(v) => (config.form[f.key] = v)"
                />
                <Input
                  v-else-if="f.type === 'array'"
                  :model-value="String(config.form[f.key])"
                  type="text"
                  :disabled="config.saving"
                  placeholder=".md, .markdown"
                  @update:model-value="(v) => (config.form[f.key] = v)"
                />
              </div>
              <span v-if="f.restartRequired" class="restart-badge">restart required</span>
            </div>
          </div>
        </div>
      </Card>

      <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap">
        <Button
          variant="default"
          @click="config.save()"
          :disabled="config.saving || !config.loaded"
        >
          {{ config.saving ? "Saving…" : "Save changes" }}
        </Button>
        <div v-if="config.msg" class="save-msg ok">{{ config.msg }}</div>
        <div v-if="config.error" class="save-msg err">{{ config.error }}</div>
      </div>
    </div>
  </div>
</template>
