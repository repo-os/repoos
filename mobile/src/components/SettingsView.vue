<script setup lang="ts">
import { ChevronLeft, Info, Lock, Palette } from "lucide-vue-next";
import type { LockSettings } from "../types";
import { DESIGN_THEMES, type AppearanceMode, type DesignThemeId } from "../theme";

const props = defineProps<{
  designTheme: DesignThemeId;
  appearanceMode: AppearanceMode;
  lock: LockSettings;
  lockSupported: boolean;
  platform: "ios" | "android" | "web";
  appVersion: string;
}>();

const emit = defineEmits<{
  back: [];
  "update:designTheme": [id: DesignThemeId];
  "update:appearanceMode": [mode: AppearanceMode];
  "update:lockEnabled": [enabled: boolean];
  "update:lockScope": [scope: "reopen" | "server"];
}>();

const appearanceOptions: { id: AppearanceMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];
</script>

<template>
  <div class="settings-view" data-testid="hub-settings">
    <header class="subhead" :class="{ 'is-ios': platform === 'ios' }">
      <button type="button" class="back-btn" data-testid="hub-settings-back" @click="emit('back')">
        <ChevronLeft :size="22" />
        <span>Servers</span>
      </button>
      <h1 class="subhead-title">Settings</h1>
    </header>

    <div class="settings-scroll">
      <section class="settings-group" :class="{ 'is-ios': platform === 'ios' }">
        <div class="group-label">
          <Palette :size="16" />
          Appearance
        </div>

        <label class="field-row">
          <span>Color theme</span>
          <select
            class="styled-select"
            data-testid="hub-theme-picker"
            :value="designTheme"
            @change="
              emit(
                'update:designTheme',
                ($event.target as HTMLSelectElement).value as DesignThemeId,
              )
            "
          >
            <option v-for="t in DESIGN_THEMES" :key="t.id" :value="t.id">{{ t.label }}</option>
          </select>
        </label>

        <div
          class="segmented"
          role="group"
          aria-label="Appearance"
          data-testid="hub-appearance-mode"
        >
          <button
            v-for="opt in appearanceOptions"
            :key="opt.id"
            type="button"
            class="segment"
            :class="{ active: appearanceMode === opt.id }"
            @click="emit('update:appearanceMode', opt.id)"
          >
            {{ opt.label }}
          </button>
        </div>
      </section>

      <section class="settings-group" :class="{ 'is-ios': platform === 'ios' }">
        <div class="group-label">
          <Lock :size="16" />
          Device lock
        </div>
        <p class="hint">
          Require biometrics or your device passcode before reopening the app or opening a saved
          server. Separate from each server's sign-in.
        </p>
        <label class="switch-row">
          <span>Enable device lock</span>
          <button
            type="button"
            class="switch"
            :class="{ on: lock.enabled }"
            role="switch"
            :aria-checked="lock.enabled"
            data-testid="hub-lock-toggle"
            @click="emit('update:lockEnabled', !lock.enabled)"
          >
            <span class="knob" />
          </button>
        </label>
        <template v-if="lock.enabled">
          <label class="field-row">
            <span>Lock on</span>
            <select
              class="styled-select"
              data-testid="hub-lock-scope"
              :value="lock.scope"
              @change="
                emit(
                  'update:lockScope',
                  ($event.target as HTMLSelectElement).value as 'reopen' | 'server',
                )
              "
            >
              <option value="reopen">Reopening the app</option>
              <option value="server">Opening a server</option>
            </select>
          </label>
          <p v-if="!lockSupported" class="warn">
            Biometrics aren't available on this device — the lock will be skipped.
          </p>
        </template>
      </section>

      <section class="settings-group" :class="{ 'is-ios': platform === 'ios' }">
        <div class="group-label">
          <Info :size="16" />
          About
        </div>
        <div class="kv">
          <span class="kv-label">Version</span>
          <span class="kv-value" data-testid="hub-about-version">{{ appVersion }}</span>
        </div>
        <p class="hint about-note">
          The app was renamed to <strong>RepoOS Hub</strong> in 2025 — a private client for your own
          servers, not a hosted directory.
        </p>
      </section>
    </div>
  </div>
</template>
