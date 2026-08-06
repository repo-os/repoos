<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useConfigStore } from "../stores/config";
import type { Agent } from "../types";
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

const localAgents = ref<Agent[]>([]);
const newName = ref("");

function sync(): void {
  localAgents.value = config.agents.map((a) => ({ ...a }));
}

watch(
  () => config.loaded,
  (loaded) => {
    if (loaded) sync();
  },
  { immediate: true },
);

const defaultNames = computed(() => config.agentsMeta.defaults.map((a) => a.name));
const defaultAgents = computed(() =>
  localAgents.value.filter((a) => defaultNames.value.includes(a.name)),
);
const customAgents = computed(() =>
  localAgents.value.filter((a) => !defaultNames.value.includes(a.name)),
);

const dirty = computed(() => JSON.stringify(localAgents.value) !== JSON.stringify(config.agents));

const clis = computed(() =>
  config.agentsMeta.clis.map((c) => ({ value: c, label: c === "claude code" ? "Claude Code" : c })),
);
const models = computed(() =>
  config.agentsMeta.models.map((m) => ({
    value: m,
    label: m === "default" ? "Default" : m === "big pickle" ? "Big Pickle" : "DeepSeek v4",
  })),
);

function addCustom(): void {
  const name = newName.value.trim();
  if (!name) return;
  if (localAgents.value.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
    config.error = `An agent named "${name}" already exists.`;
    return;
  }
  localAgents.value.push({
    name,
    cli: config.agentsMeta.clis[0] ?? "opencode",
    model: config.agentsMeta.models[1] ?? "big pickle",
    enabled: true,
    instructions: "",
  });
  newName.value = "";
  config.error = "";
}

function removeCustom(a: Agent): void {
  localAgents.value = localAgents.value.filter((x) => x !== a);
}

function setInstr(a: Agent, e: Event): void {
  a.instructions = (e.target as HTMLTextAreaElement).value;
}

async function save(): Promise<void> {
  const seen = new Set<string>();
  for (const a of localAgents.value) {
    const key = a.name.trim().toLowerCase();
    if (!key) {
      config.error = "Every agent needs a name.";
      return;
    }
    if (seen.has(key)) {
      config.error = `Duplicate agent name "${a.name}".`;
      return;
    }
    seen.add(key);
  }
  await config.saveAgents(localAgents.value.map((a) => ({ ...a, name: a.name.trim() })));
  sync();
}
</script>

<template>
  <div>
    <div class="page-title">Agents</div>
    <div class="page-desc">
      The AI agents that work this repo · opencode + big pickle by default
    </div>

    <div v-if="!config.loaded" class="spin"></div>

    <template v-else>
      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
          <span class="live-dot"></span>Default agents
        </div>
        <div class="agent-desc">
          Built-in roles. Toggle them on or off and pick their coding agent and model.
        </div>
        <div v-for="a in defaultAgents" :key="a.name" class="agent-card" :class="{ off: !a.enabled }">
          <div class="agent-head">
            <div class="agent-title">
              <span class="agent-dot"></span>
              <span class="agent-name">{{ a.name }}</span>
              <span class="agent-badge">default</span>
            </div>
            <Switch :checked="a.enabled" @update:checked="(v) => (a.enabled = v)" />
          </div>
          <div class="agent-body">
            <div class="agent-field">
              <label>Coding agent</label>
              <Select :model-value="a.cli" @update:model-value="(v) => (a.cli = v ?? a.cli)">
                <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                    <SelectItem v-for="c in clis" :key="c.value" :value="c.value">{{ c.label }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
            <div class="agent-field">
              <label>Model</label>
              <Select :model-value="a.model" @update:model-value="(v) => (a.model = v ?? a.model)">
                <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                    <SelectItem v-for="m in models" :key="m.value" :value="m.value">{{ m.label }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
            <div class="agent-field agent-instr-field">
              <label>Instructions</label>
              <textarea
                :value="a.instructions ?? ''"
                class="agent-instr"
                rows="2"
                placeholder="Optional — how this agent should behave"
                @input="setInstr(a, $event)"
              ></textarea>
            </div>
          </div>
        </div>
      </Card>

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
          <span class="live-dot" style="background: var(--violet, var(--cyan))"></span>Custom agents
        </div>
        <div class="agent-desc">
          Your own roles — data analyst, refactor agent, anything you need.
        </div>

        <div class="agent-add">
          <Input
            v-model="newName"
            placeholder="e.g. data analyst"
            class="w-[220px]"
            @keyup.enter="addCustom"
          />
          <Button variant="outline" size="sm" :disabled="!newName.trim()" @click="addCustom">
            Add agent
          </Button>
        </div>

        <div v-if="!customAgents.length" class="agent-empty">
          No custom agents yet — add one above.
        </div>

        <div v-for="a in customAgents" :key="a.name" class="agent-card" :class="{ off: !a.enabled }">
          <div class="agent-head">
            <div class="agent-title">
              <span class="agent-dot"></span>
              <Input :model-value="a.name" class="w-[180px] h-[30px]" @update:model-value="(v) => (a.name = String(v ?? ''))" />
            </div>
            <div style="display: flex; align-items: center; gap: 10px">
              <Button variant="ghost" size="sm" class="agent-remove" @click="removeCustom(a)">
                Remove
              </Button>
              <Switch :checked="a.enabled" @update:checked="(v) => (a.enabled = v)" />
            </div>
          </div>
          <div class="agent-body">
            <div class="agent-field">
              <label>Coding agent</label>
              <Select :model-value="a.cli" @update:model-value="(v) => (a.cli = v ?? a.cli)">
                <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                    <SelectItem v-for="c in clis" :key="c.value" :value="c.value">{{ c.label }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
            <div class="agent-field">
              <label>Model</label>
              <Select :model-value="a.model" @update:model-value="(v) => (a.model = v ?? a.model)">
                <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                    <SelectItem v-for="m in models" :key="m.value" :value="m.value">{{ m.label }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
            <div class="agent-field agent-instr-field">
              <label>Instructions</label>
              <textarea
                :value="a.instructions ?? ''"
                class="agent-instr"
                rows="2"
                placeholder="Optional — how this agent should behave"
                @input="setInstr(a, $event)"
              ></textarea>
            </div>
          </div>
        </div>
      </Card>

      <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap">
        <Button variant="default" @click="save" :disabled="config.saving || !config.loaded">
          {{ config.saving ? "Saving…" : "Save agents" }}
        </Button>
        <span v-if="dirty" class="agent-dirty">unsaved changes</span>
        <div v-if="config.msg" class="save-msg ok">{{ config.msg }}</div>
        <div v-if="config.error" class="save-msg err">{{ config.error }}</div>
      </div>
    </template>
  </div>
</template>
