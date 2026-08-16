import { computed, reactive, ref, watch } from "vue";
import { defineStore } from "pinia";
import { api, JSON_OPTS } from "../api";
import type { Agent, AgentsMeta, ConfigField, ModelSourcesResponse } from "../types";

/** claude code takes model aliases, not the provider/model ids other CLIs use. */
const CLAUDE_CODE_MODELS = ["default", "opus", "sonnet", "haiku"] as const;

const MODEL_LABELS: Record<string, string> = {
  default: "Default",
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
  "big pickle": "Big Pickle",
  "deepseek v4": "DeepSeek v4",
};

/** Display label for a model id; unknown ids render as-is. */
export function labelForModel(m: string): string {
  return MODEL_LABELS[m] ?? m;
}

export interface ConfigResponse {
  config: Record<string, unknown>;
  schema: ConfigField[];
  agentsMeta?: AgentsMeta;
}

export const useConfigStore = defineStore("config", () => {
  const loaded = ref(false);
  const saving = ref(false);
  const msg = ref("");
  const error = ref("");
  const schema = ref<ConfigField[]>([]);
  const data = ref<Record<string, unknown> | null>(null);
  const showAdvanced = ref(false);
  const form = reactive<Record<string, unknown>>({});
  const uiTheme = ref("classic");
  const agents = ref<Agent[]>([]);
  const agentsMeta = ref<AgentsMeta>({ clis: [], models: [], defaults: [] });
  // Live model lists per CLI, probed from /api/models. Shared here rather than
  // held per-view so the Agents page and the per-task pickers offer exactly
  // the same options from one cache and one fetch.
  const liveModelsByCli = ref<Record<string, string[]>>({});
  const modelsLoaded = ref(false);
  const modelsLoading = ref(false);

  async function loadModels(refresh = false): Promise<void> {
    modelsLoading.value = true;
    try {
      const res = await api<ModelSourcesResponse>(`/api/models${refresh ? "?refresh=1" : ""}`);
      liveModelsByCli.value = Object.fromEntries(
        Object.entries(res.byCli).map(([cli, source]) => [cli, source.models]),
      );
      modelsLoaded.value = true;
    } catch {
      liveModelsByCli.value = {};
      modelsLoaded.value = false;
    } finally {
      modelsLoading.value = false;
    }
  }

  /**
   * The models offered for a CLI: its live-probed list, falling back to the
   * static `agentsMeta.models` until the probe lands, plus `saved` so a value
   * already on a task or agent is never silently dropped from its own dropdown.
   */
  function modelsFor(cli: string, saved?: string): { value: string; label: string; disabled: boolean }[] {
    const out: { value: string; label: string; disabled: boolean }[] = [];
    const seen = new Set<string>();
    const push = (m: string): void => {
      if (seen.has(m)) return;
      seen.add(m);
      out.push({ value: m, label: labelForModel(m), disabled: false });
    };
    if (cli === "claude code") {
      for (const m of CLAUDE_CODE_MODELS) push(m);
      if (saved) push(saved);
      return out;
    }
    push("default");
    for (const m of liveModelsByCli.value[cli] ?? []) push(m);
    if (!modelsLoaded.value) for (const m of agentsMeta.value.models) push(m);
    if (saved) push(saved);
    return out;
  }
  let themeAnimTimer: ReturnType<typeof setTimeout> | undefined;

  const visibleFields = computed(() =>
    schema.value.filter((f) => f.tier !== "guarded" && f.group !== "voice"),
  );
  const voiceFields = computed(() => schema.value.filter((f) => f.group === "voice"));
  const guardedFields = computed(() => schema.value.filter((f) => f.tier === "guarded"));

  function animateTheme(): void {
    const el = document.documentElement;
    el.classList.add("theme-anim");
    clearTimeout(themeAnimTimer);
    themeAnimTimer = setTimeout(() => el.classList.remove("theme-anim"), 300);
  }

  function applyTheme(t: string, animate = false): void {
    if (t === "system") {
      document.documentElement.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
    } else {
      document.documentElement.dataset.theme = t;
    }
    if (animate) animateTheme();
  }

  function applyUiTheme(t: string, animate = false): void {
    uiTheme.value = t;
    document.documentElement.dataset.uiTheme = t;
    if (animate) animateTheme();
  }

  async function setUiTheme(t: string): Promise<void> {
    const prev = uiTheme.value;
    applyUiTheme(t, true);
    try {
      await api("/api/config", JSON_OPTS("PATCH", { uiTheme: t }));
    } catch (err) {
      applyUiTheme(prev);
      throw err;
    }
  }

  /** The effective mode the UI is showing right now: resolves "system" to dark/light. */
  const effectiveTheme = computed<string>(() => {
    const stored = typeof form.theme === "string" ? form.theme : "system";
    if (stored !== "system") return stored;
    if (typeof window === "undefined" || !window.matchMedia) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  /**
   * Persist an explicit dark/light choice. Never toggles back to "system" —
   * a click is an explicit choice. Rollback on failure like setUiTheme.
   */
  async function setTheme(t: string): Promise<void> {
    const prev = typeof form.theme === "string" ? form.theme : "system";
    applyTheme(t, true);
    try {
      await api("/api/config", JSON_OPTS("PATCH", { theme: t }));
      if (data.value) data.value.theme = t;
      form.theme = t;
    } catch (err) {
      applyTheme(prev);
      throw err;
    }
  }

  /** Persist the tunnel UI opt-in immediately; setup itself remains CLI-driven. */
  async function setTunnelEnabled(enabled: boolean): Promise<void> {
    const previous = !!form.tunnelEnabled;
    form.tunnelEnabled = enabled;
    saving.value = true;
    msg.value = "";
    error.value = "";
    try {
      await api("/api/config", JSON_OPTS("PATCH", { tunnelEnabled: enabled }));
      if (data.value) data.value.tunnelEnabled = enabled;
      msg.value = enabled
        ? "Cloudflare Tunnel enabled — finish setup in the side panel."
        : "Cloudflare Tunnel hidden — existing tunnel configuration was left unchanged.";
    } catch (err) {
      form.tunnelEnabled = previous;
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      saving.value = false;
    }
  }

  // Apply the dark/light/system preference the moment it changes in the
  // settings form, so it takes effect live without hitting "Save changes".
  watch(
    () => form.theme,
    (t) => {
      if (typeof t === "string") applyTheme(t, true);
    },
  );

  function fillForm(res: ConfigResponse): void {
    for (const f of res.schema) {
      const val = res.config[f.key] ?? f.default;
      if (f.type === "array") form[f.key] = Array.isArray(val) ? val.join(", ") : String(val);
      else if (f.type === "boolean") form[f.key] = !!val;
      else form[f.key] = val;
    }
  }

  /** Mirror the server-side `whisperEnabled` flag onto the form so UI
   * components (mic buttons) can gate on it without seeing the apiKey. */
  function syncWhisperFlag(res: ConfigResponse): void {
    form.whisperEnabled = res.config.whisperEnabled === true;
  }

  async function load(): Promise<void> {
    loaded.value = false;
    error.value = "";
    msg.value = "";
    try {
      const res = await api<ConfigResponse>("/api/config");
      data.value = res.config;
      schema.value = res.schema;
      fillForm(res);
      syncWhisperFlag(res);
      agents.value = Array.isArray(res.config.agents) ? (res.config.agents as Agent[]) : [];
      if (res.agentsMeta) agentsMeta.value = res.agentsMeta;
      applyTheme(String(res.config.theme ?? "system"));
      applyUiTheme(String(res.config.uiTheme ?? "classic"));
      loaded.value = true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  /** Persist the full agents list and refresh local state from the server. */
  async function saveAgents(list: Agent[]): Promise<void> {
    saving.value = true;
    msg.value = "";
    error.value = "";
    try {
      await api("/api/config", JSON_OPTS("PATCH", { agents: list }));
      msg.value = "Agents saved — applied live.";
      const res = await api<ConfigResponse>("/api/config");
      agents.value = Array.isArray(res.config.agents) ? (res.config.agents as Agent[]) : [];
      data.value = res.config;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function save(body: Record<string, unknown>): Promise<void> {
    saving.value = true;
    msg.value = "";
    error.value = "";
    try {
      await api("/api/config", JSON_OPTS("PATCH", body));
      const needsRestart = Object.keys(body).some((k) => {
        const f = schema.value.find((x) => x.key === k);
        return f && f.restartRequired;
      });
      msg.value = needsRestart
        ? "Saved — restart server to apply some changes."
        : "Saved — applied live.";
      const res = await api<ConfigResponse>("/api/config");
      data.value = res.config;
      fillForm(res);
      syncWhisperFlag(res);
      applyTheme(String(res.config.theme ?? "system"));
      applyUiTheme(String(res.config.uiTheme ?? "classic"));
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      saving.value = false;
    }
  }

  return {
    loaded,
    saving,
    msg,
    error,
    schema,
    data,
    showAdvanced,
    form,
    visibleFields,
    voiceFields,
    guardedFields,
    load,
    save,
    saveAgents,
    applyTheme,
    applyUiTheme,
    setUiTheme,
    setTheme,
    effectiveTheme,
    setTunnelEnabled,
    uiTheme,
    agents,
    agentsMeta,
    liveModelsByCli,
    modelsLoaded,
    modelsLoading,
    loadModels,
    modelsFor,
  };
});
