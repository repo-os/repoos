import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteContext, RouteHandler } from "./types.js";

export interface RouterEntry {
  method: string;
  pattern: string | RegExp;
  handler: RouteHandler;
}

export class Router {
  private routes: RouterEntry[] = [];

  register(method: string, pattern: string | RegExp, handler: RouteHandler): void {
    this.routes.push({ method, pattern, handler });
  }

  async dispatch(
    ctx: RouteContext,
    method: string,
    path: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    for (const route of this.routes) {
      if (route.method !== method) continue;

      let match: RegExpMatchArray | null = null;
      if (typeof route.pattern === "string") {
        if (route.pattern !== path) continue;
        match = null;
      } else {
        match = path.match(route.pattern);
        if (!match) continue;
      }

      const params: Record<string, string> = {};
      if (match) {
        for (let i = 1; i < match.length; i++) {
          params[`param${i}`] = match[i];
        }
      }

      await route.handler(ctx, req, res, params);
      return true;
    }
    return false;
  }
}
