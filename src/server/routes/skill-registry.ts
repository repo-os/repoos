import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  curatedRegistrySkills,
  installRegistrySkill,
  registryAudit,
  registryDetail,
  searchRegistrySkills,
} from "../../core/skills-registry.js";

export const getRegistryCurated: RouteHandler = async (_ctx, _req, res) => {
  try { return json(res, 200, { skills: await curatedRegistrySkills() }); }
  catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : "Skills.sh unavailable" }); }
};

export const searchRegistry: RouteHandler = async (_ctx, req, res) => {
  const q = new URL(req.url ?? "/", "http://localhost").searchParams.get("q") ?? "";
  try { return json(res, 200, { skills: await searchRegistrySkills(q) }); }
  catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : "Skills.sh unavailable" }); }
};

export const getRegistryDetail: RouteHandler = async (_ctx, req, res) => {
  const id = new URL(req.url ?? "/", "http://localhost").searchParams.get("id") ?? "";
  try {
    const [detail, audit] = await Promise.all([registryDetail(id), registryAudit(id)]);
    return json(res, 200, { detail, audit });
  } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : "Skill unavailable" }); }
};

export const installRegistry: RouteHandler = async (ctx, req, res) => {
  const body = await readBody(req) as { id?: unknown };
  if (typeof body.id !== "string") return json(res, 400, { error: "id is required" });
  try {
    const detail = await registryDetail(body.id);
    return json(res, 201, { ok: true, ...installRegistrySkill(ctx.config, detail), hash: detail.hash });
  } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : "Could not install skill" }); }
};
