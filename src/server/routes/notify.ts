import { basename } from "node:path";
import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import { publish } from "../ntfy.js";

export const testNotification: RouteHandler = (ctx, _req, res) => {
  const { config } = ctx;
  if (!config.ntfyEnabled) {
    return json(res, 400, { error: "ntfy notifications are disabled" });
  }
  const topic = (config.ntfyTopic ?? "").trim();
  if (!topic) {
    return json(res, 400, { error: "ntfy topic is empty" });
  }
  const repoName = basename(config.root);
  const message = `Hello from RepoOS at ${repoName}!`;
  publish(config, message);
  return json(res, 200, { ok: true });
};
