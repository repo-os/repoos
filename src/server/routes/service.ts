/**
 * Server routes for background service management (0185).
 *
 *   GET  /api/service/status   → current repo's service status + live OS query
 *   GET  /api/service/list     → all managed services
 *   POST /api/service/install  → install a service for the current repo
 *   POST /api/service/start    → start the service
 *   POST /api/service/stop     → stop the service
 *   POST /api/service/restart  → restart the service
 *   POST /api/service/enable   → enable auto-start at login
 *   POST /api/service/disable  → disable auto-start at login
 *   POST /api/service/remove   → remove the service entirely
 *   POST /api/service/health   → run a health check
 */
import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import { deriveServePort } from "../../core/config.js";
import {
  getServiceStatus,
  listServices,
  installService,
  removeService,
  startService,
  stopService,
  restartService,
  enableAutoStart,
  disableAutoStart,
  checkHealth,
} from "../../core/service-manager.js";

export const getServiceStatusRoute: RouteHandler = async (ctx, _req, res) => {
  const entry = await getServiceStatus(ctx.config.root);
  return json(res, 200, { ok: true, service: entry });
};

export const listServicesRoute: RouteHandler = (_ctx, _req, res) => {
  const result = listServices();
  return json(res, 200, { ok: true, ...result });
};

export const installServiceRoute: RouteHandler = async (ctx, _req, res) => {
  const port = deriveServePort(ctx.config.root);
  const result = await installService(ctx.config.root, port);
  if (!result.ok) return json(res, 400, { error: result.error });
  return json(res, 200, { ok: true, service: result.entry });
};

export const startServiceRoute: RouteHandler = async (ctx, _req, res) => {
  const result = await startService(ctx.config.root);
  if (!result.ok) return json(res, 400, { error: result.error });
  return json(res, 200, { ok: true });
};

export const stopServiceRoute: RouteHandler = async (ctx, _req, res) => {
  const result = await stopService(ctx.config.root);
  if (!result.ok) return json(res, 400, { error: result.error });
  return json(res, 200, { ok: true });
};

export const restartServiceRoute: RouteHandler = async (ctx, _req, res) => {
  const result = await restartService(ctx.config.root);
  if (!result.ok) return json(res, 400, { error: result.error });
  return json(res, 200, { ok: true });
};

export const enableAutoStartRoute: RouteHandler = async (ctx, _req, res) => {
  const result = await enableAutoStart(ctx.config.root);
  if (!result.ok) return json(res, 400, { error: result.error });
  return json(res, 200, { ok: true });
};

export const disableAutoStartRoute: RouteHandler = async (ctx, _req, res) => {
  const result = await disableAutoStart(ctx.config.root);
  if (!result.ok) return json(res, 400, { error: result.error });
  return json(res, 200, { ok: true });
};

export const removeServiceRoute: RouteHandler = async (ctx, _req, res) => {
  const result = await removeService(ctx.config.root);
  if (!result.ok) return json(res, 400, { error: result.error });
  return json(res, 200, { ok: true });
};

export const healthCheckRoute: RouteHandler = async (ctx, _req, res) => {
  const result = await checkHealth(ctx.config.root);
  return json(res, 200, {
    ok: result.ok,
    status: result.status,
    error: result.error ?? null,
  });
};
