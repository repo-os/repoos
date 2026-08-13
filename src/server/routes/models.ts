import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { AGENT_CLIS } from "../../core/config.js";
import { listModelSources, type ModelSourceResult } from "../../core/models.js";
import { testModelCombination } from "../model-test.js";

export const listModels: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const url = new URL(req.url ?? "/", "http://localhost");
  const refresh = url.searchParams.get("refresh") === "1";
  let byCli: Record<string, ModelSourceResult> = {};
  try {
    byCli = await listModelSources({ refresh, cwd: config.root });
  } catch {
    byCli = {};
  }
  return json(res, 200, { byCli, at: new Date().toISOString() });
};

export const testModel: RouteHandler = async (ctx, _req, res) => {
  const { config } = ctx;
  try {
    const body = (await readBody(_req)) as { cli?: unknown; model?: unknown };
    if (
      typeof body.cli !== "string" ||
      !AGENT_CLIS.includes(body.cli as (typeof AGENT_CLIS)[number])
    ) {
      return json(res, 400, { error: "cli must be a supported coding agent" });
    }
    if (typeof body.model !== "string" || !body.model.trim() || body.model.length > 120) {
      return json(res, 400, { error: "model must be a non-empty string" });
    }
    const result = await testModelCombination(body.cli, body.model, { cwd: config.root });
    return json(res, 200, { result, at: new Date().toISOString() });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return json(res, 500, { error: `Model compatibility test failed: ${reason}` });
  }
};
