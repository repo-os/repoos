<script setup lang="ts">
import { ref } from "vue";

interface InstallOption {
  id: string;
  label: string;
  cmd: string;
}

// curl is the default tab: it's the one true zero-dependency path (no
// package manager required), so it's what a first-time visitor should see.
const INSTALL_OPTIONS: InstallOption[] = [
  { id: "curl", label: "curl", cmd: "curl -fsSL https://repoos.org/install.sh | bash" },
  { id: "brew", label: "brew", cmd: "brew install repo-os/tap/repoos" },
  { id: "npm", label: "npm", cmd: "npm install -g @repo-os/repoos" },
  { id: "bun", label: "bun", cmd: "bun add -g @repo-os/repoos" },
  { id: "pnpm", label: "pnpm", cmd: "pnpm add -g @repo-os/repoos" },
  { id: "mise", label: "mise", cmd: "mise use -g npm:@repo-os/repoos" },
];

withDefaults(defineProps<{ showNote?: boolean }>(), { showNote: false });

const active = ref(INSTALL_OPTIONS[0]);

const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;

async function copyInstall(): Promise<void> {
  const cmd = active.value.cmd;
  try {
    await navigator.clipboard.writeText(cmd);
  } catch {
    // Clipboard API can be denied (e.g. non-secure context). Fall back to a
    // hidden textarea so the button still works on http:// previews.
    const ta = document.createElement("textarea");
    ta.value = cmd;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  copied.value = true;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copied.value = false), 1600);
}

function selectOption(option: InstallOption): void {
  active.value = option;
  copied.value = false;
  clearTimeout(copyTimer);
}
</script>

<template>
  <div>
    <div class="install-tabs" role="tablist" aria-label="Install method">
      <button
        v-for="option in INSTALL_OPTIONS"
        :key="option.id"
        type="button"
        role="tab"
        class="install-tab"
        :class="{ active: option.id === active.id }"
        :aria-selected="option.id === active.id"
        @click="selectOption(option)"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="install-box">
      <span class="dollar font-mono text-[13.5px]">$</span>
      <code>{{ active.cmd }}</code>
      <button
        class="copy-btn"
        :class="{ copied }"
        type="button"
        :aria-label="copied ? 'Copied' : 'Copy install command'"
        @click="copyInstall"
      >
        <svg
          v-if="!copied"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="h-3.5 w-3.5"
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
          class="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {{ copied ? "copied" : "copy" }}
      </button>
    </div>

    <p v-if="showNote" class="mt-3 text-[13px] text-[var(--txt-faint)]">
      Runs on Bun or Node 20+. No account, no telemetry.
    </p>
  </div>
</template>
