import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { deployBranch, getDeploymentsStatus } from "../deployments.js";

export const getDeployments: RouteHandler = async (ctx, _req, res) =>
  json(res, 200, await getDeploymentsStatus(ctx.config));

export const postDeploy: RouteHandler = async (ctx, req, res) => {
  const body = (await readBody(req)) as { branch?: unknown };
  if (typeof body.branch !== "string" || !body.branch.trim())
    return json(res, 400, { error: "branch is required" });
  const result = await deployBranch(ctx.config, body.branch);
  // 409 (not 400) for the refusal cases: the request was well-formed but the
  // repository state — dirty tree, diverged branches, moved remote — refused it.
  return json(res, result.ok ? 200 : 409, result);
};
