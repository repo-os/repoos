<script setup lang="ts">
import { computed, ref } from "vue";
import { classifyAgentFailure } from "../../../core/agent-failure.js";
import type { Agent, ModelTestResult } from "../types";
import type { AgentLastRunRow } from "../../../core/agent-last-runs.js";
import { useConfigStore } from "../stores/config";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import Switch from "./ui/switch.vue";
import AgentModelControl from "./AgentModelControl.vue";
import AgentRunStatus from "./AgentRunStatus.vue";
import VoiceDictate from "./VoiceDictate.vue";
import { ChevronDown, ChevronRight, Plus } from "lucide-vue-next";

export type AgentCardVariant = "default" | "custom" | "team";

const SKILLS_HELP =
  "Skills are selected dynamically for each task/run from repository skills; these are this agent's preferred candidates.";

const props = defineProps<{
  agent: Agent;
  variant: AgentCardVariant;
  cliOptions: string[];
  memoryKey: string;
  skillsAvailable: boolean;
  testing: boolean;
  testResult?: ModelTestResult;
  registerInstrRef: (el: HTMLTextAreaElement | null) => void;
  /** Latest run for this role, when one exists. */
  lastRun?: AgentLastRunRow | null;
}>();

const emit = defineEmits<{
  test: [];
  "open-skills": [];
  remove: [];
  "instr-input": [event: Event];
  "instr-blur": [];
  "open-recommendations": [];
  transcribed: [text: string];
}>();

const config = useConfigStore();
const instrExpanded = ref(false);
const testMessage = computed(() => {
  const error = props.testResult?.error;
  if (!error) return "";
  const reason = classifyAgentFailure(error, props.agent.cli);
  return reason ? `${reason.summary} ${reason.fix}` : error;
});

function isLegacyGemini(cli: string): boolean {
  return cli.toLowerCase() === "gemini";
}

function badgeLabel(): string | null {
  if (props.variant === "default") return "default";
  if (props.variant === "team") return "team";
  return null;
}
</script>

<template>
  <div class="agent-card" :class="{ off: !agent.enabled }">
    <div class="agent-head">
      <div class="agent-title">
        <span class="agent-dot"></span>
        <Input
          v-if="variant === 'custom'"
          :model-value="agent.name"
          class="w-[180px] h-[30px]"
          @update:model-value="(v) => (agent.name = String(v ?? ''))"
        />
        <span v-else class="agent-name">{{ agent.name }}</span>
        <span v-if="badgeLabel()" class="agent-badge">{{ badgeLabel() }}</span>
        <AgentRunStatus :run="lastRun ?? null" :cli="agent.cli" :model="agent.model" />
      </div>
      <div v-if="variant === 'custom'" style="display: flex; align-items: center; gap: 10px">
        <Button variant="ghost" size="sm" class="agent-remove" @click="emit('remove')">
          Remove
        </Button>
        <Switch :checked="agent.enabled" @update:checked="(v) => (agent.enabled = v)" />
      </div>
      <Switch v-else :checked="agent.enabled" @update:checked="(v) => (agent.enabled = v)" />
    </div>
    <div class="agent-body">
      <div class="agent-field">
        <label>Coding agent + Model</label>
        <AgentModelControl
          :cli-options="cliOptions"
          :model-options="config.modelsFor(agent.cli, agent.model)"
          :memory-key="memoryKey"
          v-model:cli="agent.cli"
          v-model:model="agent.model"
        />
        <div v-if="isLegacyGemini(agent.cli)" class="agent-legacy-notice" role="status">
          <strong>Deprecated Gemini CLI</strong> — this saved value is preserved for history, but
          new assignments use Antigravity CLI (agy).
          <button type="button" class="model-pricing-link" @click="emit('open-recommendations')">
            Migrate in the agent guide →
          </button>
        </div>
      </div>
      <div class="agent-field agent-test-result">
        <label>Compatibility</label>
        <div class="agent-test-actions">
          <Button variant="outline" size="sm" :disabled="testing" @click="emit('test')">
            <span v-if="testing" class="model-test-spinner"></span>
            {{ testing ? "Testing…" : testResult ? "Test again" : "Test" }}
          </Button>
          <span
            v-if="testResult"
            :class="'model-test model-test-' + testResult.status"
            role="status"
          >
            {{ testResult.status.replace("_", " ") }}
          </span>
        </div>
        <p v-if="testMessage" class="model-test-detail" role="status">{{ testMessage }}</p>
      </div>
      <div class="agent-field agent-instr-field">
        <div class="instr-header agent-instr-header">
          <label>Instructions</label>
          <div class="agent-instr-header-actions">
            <VoiceDictate v-if="instrExpanded" @transcribed="emit('transcribed', $event)" />
            <button
              type="button"
              class="agent-instr-toggle"
              :aria-expanded="instrExpanded"
              :title="instrExpanded ? 'Collapse instructions' : 'Expand instructions'"
              @click="instrExpanded = !instrExpanded"
            >
              <ChevronDown v-if="instrExpanded" class="size-4" aria-hidden="true" />
              <ChevronRight v-else class="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <textarea
          v-if="instrExpanded"
          :ref="(el) => props.registerInstrRef(el as HTMLTextAreaElement | null)"
          :value="agent.instructions ?? ''"
          class="agent-instr"
          rows="2"
          placeholder="Optional — how this agent should behave"
          @input="emit('instr-input', $event)"
          @blur="emit('instr-blur')"
        ></textarea>
      </div>
      <div v-if="skillsAvailable" class="agent-field agent-skills-field">
        <label class="agent-skills-label">Enabled skills</label>
        <div class="agent-skills-row">
          <Button
            variant="ghost"
            size="sm"
            class="agent-skills-add"
            title="Add skills to agent"
            :aria-label="`Add skills to ${agent.name}`"
            @click="emit('open-skills')"
          >
            <Plus class="size-3.5" aria-hidden="true" />
          </Button>
          <span class="agent-skills-info" :title="SKILLS_HELP" aria-label="About enabled skills"
            >ⓘ</span
          >
          <span class="agent-skills-inline-summary">
            {{ (agent.skills ?? []).join(", ") || "No default candidates" }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
