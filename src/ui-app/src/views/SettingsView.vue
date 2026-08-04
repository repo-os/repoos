<script setup lang="ts">
import { useConfigStore } from "../stores/config";

const config = useConfigStore();
</script>

<template>
  <div>
    <div class="page-title">Settings</div>
    <div class="page-desc">
      RepoOS configuration · <span class="mono" style="color: var(--cyan)">repoos.toml</span>
    </div>

    <div v-if="!config.loaded" class="spin"></div>

    <div v-else>
      <div class="glass" style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span class="live-dot"></span>General
          </div>
          <div v-for="f in config.visibleFields" :key="f.key" class="setting-row">
            <div class="setting-info">
              <div class="setting-label">{{ f.label }}</div>
              <div class="setting-desc">{{ f.description }}</div>
            </div>
            <div class="setting-input">
              <select v-if="f.type === 'select'" v-model="config.form[f.key]" :disabled="config.saving">
                <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <label v-else-if="f.type === 'boolean'" class="toggle">
                <input type="checkbox" v-model="config.form[f.key]" :disabled="config.saving" />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <span v-if="f.restartRequired" class="restart-badge">restart required</span>
          </div>
        </div>
      </div>

      <div class="glass" style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span style="cursor: pointer; user-select: none" @click="config.showAdvanced = !config.showAdvanced">
              <span v-if="config.showAdvanced">▾</span><span v-else>▸</span> Advanced
            </span>
          </div>
          <div v-if="config.showAdvanced">
            <div class="adv-gate">
              <div class="warning">⚠ Changing these may break the running server. Edit with care.</div>
            </div>
            <div v-for="f in config.guardedFields" :key="f.key" class="setting-row">
              <div class="setting-info">
                <div class="setting-label">{{ f.label }}</div>
                <div class="setting-desc">{{ f.description }}</div>
              </div>
              <div class="setting-input">
                <input v-if="f.type === 'string'" type="text" v-model="config.form[f.key]" :disabled="config.saving" />
                <input
                  v-else-if="f.type === 'array'"
                  type="text"
                  v-model="config.form[f.key]"
                  :disabled="config.saving"
                  placeholder=".md, .markdown"
                />
              </div>
              <span v-if="f.restartRequired" class="restart-badge">restart required</span>
            </div>
          </div>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap">
        <button class="btn primary" @click="config.save()" :disabled="config.saving || !config.loaded">
          {{ config.saving ? "Saving…" : "Save changes" }}
        </button>
        <div v-if="config.msg" class="save-msg ok">{{ config.msg }}</div>
        <div v-if="config.error" class="save-msg err">{{ config.error }}</div>
      </div>
    </div>
  </div>
</template>
