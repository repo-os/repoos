import { computed, reactive, ref, watch } from "vue";
import { defineStore } from "pinia";
import { api, JSON_OPTS } from "../api";
import type { Agent, AgentsMeta, ConfigField } from "../types";

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
  let themeAnimTimer: ReturnType<typeof setTimeout> | undefined;

  const visibleFields = computed(() => schema.value.filter((f) => f.tier !== "guarded"));
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

  async function load(): Promise<void> {
    loaded.value = false;
    error.value = "";
    msg.value = "";
    try {
      const res = await api<ConfigResponse>("/api/config");
      data.value = res.config;
      schema.value = res.schema;
      fillForm(res);
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

  async function save(): Promise<void> {
    saving.value = true;
    msg.value = "";
    error.value = "";
    try {
      const body: Record<string, unknown> = {};
      for (const f of schema.value) {
        if (f.tier === "guarded" && !showAdvanced.value) continue;
        let val = form[f.key];
        if (f.type === "array" && typeof val === "string") {
          val = val
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
        body[f.key] = val;
      }
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
      applyTheme(String(res.config.theme ?? "system"));
      applyUiTheme(String(res.config.uiTheme ?? "classic"));
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
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
    guardedFields,
    load,
    save,
    saveAgents,
    applyTheme,
    applyUiTheme,
    setUiTheme,
    setTunnelEnabled,
    uiTheme,
    agents,
    agentsMeta,
  };
});
