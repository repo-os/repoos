<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Card from "./ui/card.vue";
import Button from "./ui/button.vue";
import { api } from "../lib/api";

export interface DecisionDigestAction {
  id: string;
  label: string;
  policyAutomatic: boolean;
}

export interface DecisionDigestItem {
  id: string;
  kind: string;
  taskId: string | null;
  title: string;
  cause: { headline: string; detail?: string; step?: string; failingTests?: string[] };
  evidence: Array<{ label: string; href?: string; path?: string }>;
  actions: DecisionDigestAction[];
  at: string;
  link: string | null;
}

interface DecisionDigestResponse {
  ok: boolean;
  items: DecisionDigestItem[];
  automationPaused: boolean;
  approvalEnabled: boolean;
  generatedAt: string;
}

const router = useRouter();
const loading = ref(false);
const error = ref<string | null>(null);
const digest = ref<DecisionDigestResponse | null>(null);

const items = computed(() => digest.value?.items ?? []);

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    digest.value = await api<DecisionDigestResponse>("/api/decisions");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

function openItem(item: DecisionDigestItem): void {
  if (item.link) void router.push(item.link);
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "handoff-failed":
      return "Handoff";
    case "close-out-failed":
      return "Close-out";
    case "review-blocked":
      return "Review";
    case "stuck-run":
      return "Stuck run";
    case "needs-merge":
      return "Merge";
    case "release":
      return "Release";
    case "owner-config":
      return "Config";
    default:
      return "Decision";
  }
}

onMounted(() => {
  void refresh();
});

defineExpose({ refresh });
</script>

<template>
  <Card>
    <div class="panel-head">
      <div class="panel-title">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 8v5m0 3h.01M10.29 3.86 2.82 17a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Needs a decision
      </div>
      <span
        v-if="items.length"
        class="tag"
        style="background: var(--rose-tint, var(--amber-tint)); color: var(--rose, var(--amber))"
        >{{ items.length }}</span
      >
      <Button size="sm" variant="ghost" class="digest-refresh" :disabled="loading" @click="refresh">
        Refresh
      </Button>
    </div>

    <p v-if="digest?.automationPaused" class="digest-note ff-notice">
      Automation is paused — items the CTO would normally handle are listed here too.
    </p>

    <div v-if="error" class="ff-error">{{ error }}</div>
    <div v-else-if="loading && !digest" class="feed-empty">Loading…</div>
    <div v-else-if="!items.length" class="feed-empty needs-empty">
      <div>Nothing needs your decision — routine work stays with the CTO and approval policy.</div>
    </div>

    <div v-else class="feed">
      <div
        v-for="item in items"
        :key="item.id"
        class="feed-item digest-item"
        :class="{ 'digest-clickable': item.link }"
        @click="item.link ? openItem(item) : undefined"
      >
        <div class="feed-dot" style="background: var(--rose, var(--amber))"></div>
        <div class="feed-line"></div>
        <div style="flex: 1; min-width: 0">
          <div class="feed-msg">
            <span class="kind-tag digest-kind">{{ kindLabel(item.kind) }}</span>
            <span v-if="item.taskId">#{{ item.taskId }}</span>
            {{ item.title }}
          </div>
          <div class="needs-reasons">{{ item.cause.headline }}</div>
          <div v-if="item.cause.failingTests?.length" class="digest-tests">
            Failing: {{ item.cause.failingTests.slice(0, 3).join("; ")
            }}<span v-if="item.cause.failingTests.length > 3">…</span>
          </div>
          <div v-if="item.cause.step" class="feed-meta">
            <span>Step: {{ item.cause.step }}</span>
          </div>
          <ul class="digest-actions kv-rows" style="--kv-label-w: 5.5rem">
            <li v-for="act in item.actions.filter((a) => !a.policyAutomatic)" :key="act.id">
              <span class="digest-action-label">You</span>
              <span>{{ act.label }}</span>
            </li>
            <li
              v-for="act in item.actions.filter((a) => a.policyAutomatic)"
              :key="`auto-${act.id}`"
            >
              <span class="digest-action-label">CTO</span>
              <span>{{ act.label }}</span>
            </li>
          </ul>
          <div v-if="item.evidence.some((e) => e.path)" class="feed-meta digest-evidence">
            <span
              v-for="ev in item.evidence.filter((e) => e.path)"
              :key="ev.path"
              :title="ev.path"
            >
              {{ ev.label }}: {{ ev.path }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.digest-refresh {
  margin-left: auto;
}

.digest-note {
  margin: 0 0 10px;
  font-size: 0.85rem;
}

.digest-clickable {
  cursor: pointer;
}

.digest-kind {
  margin-right: 6px;
}

.digest-tests {
  font-size: 0.82rem;
  color: var(--txt-dim);
  margin-top: 4px;
}

.digest-actions {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  font-size: 0.82rem;
}

.digest-actions li {
  display: contents;
}

.digest-action-label {
  color: var(--txt-faint);
}

.digest-evidence {
  margin-top: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
}
</style>
