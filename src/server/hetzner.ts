/**
 * Minimal Hetzner Cloud API client for the Remote Validation Runner (#RVR).
 *
 * Only the four calls the runner needs: create a server from a snapshot, poll
 * its status, delete it, and list servers by label (leak reconciliation). Uses
 * the platform's native `fetch` — no runtime dependency, same as ntfy.ts.
 *
 * The API token comes from `HETZNER_API_TOKEN` (env only, never a git-tracked
 * config key). Every method throws `HetznerApiError` on a non-2xx response so
 * the runner can classify the failure as transient infra trouble.
 */

const API_BASE = "https://api.hetzner.cloud/v1";

export class HetznerApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HetznerApiError";
  }
}

export interface HetznerServer {
  id: number;
  name: string;
  /** "initializing" | "starting" | "running" | "stopping" | "off" | "deleting" | "rebuilding" | "migrating" | "unknown" */
  status: string;
  /** Public IPv4 address, or null before it is assigned. */
  ipv4: string | null;
  /** ISO 8601 creation timestamp. */
  created: string;
  labels: Record<string, string>;
}

export interface CreateServerOptions {
  name: string;
  serverType: string;
  location: string;
  /** Snapshot ID (number) or image name. */
  image: string;
  /** Names of SSH keys already registered in the Hetzner project. */
  sshKeyNames: string[];
  labels?: Record<string, string>;
  /** cloud-init user data, if the snapshot needs any first-boot setup. */
  userData?: string;
}

/** Shape returned by the API for a server object (only fields we read). */
interface RawServer {
  id: number;
  name: string;
  status: string;
  created: string;
  labels?: Record<string, string>;
  public_net?: { ipv4?: { ip?: string } | null };
}

function toServer(raw: RawServer): HetznerServer {
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status,
    ipv4: raw.public_net?.ipv4?.ip ?? null,
    created: raw.created,
    labels: raw.labels ?? {},
  };
}

export interface HetznerClient {
  createServer(opts: CreateServerOptions): Promise<HetznerServer>;
  getServer(id: number): Promise<HetznerServer | null>;
  deleteServer(id: number): Promise<void>;
  listServers(labelSelector: string): Promise<HetznerServer[]>;
}

export function createHetznerClient(token: string): HetznerClient {
  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    if (!token) throw new HetznerApiError("HETZNER_API_TOKEN is not set");
    let resp: Response;
    try {
      resp = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
    } catch (e) {
      throw new HetznerApiError(`network error calling Hetzner API: ${(e as Error).message}`);
    }
    if (resp.status === 204) return {};
    let body: unknown;
    try {
      body = await resp.json();
    } catch {
      body = {};
    }
    if (!resp.ok) {
      const err = (body as { error?: { message?: string } })?.error?.message;
      throw new HetznerApiError(
        `Hetzner API ${init?.method ?? "GET"} ${path} → ${resp.status}${err ? `: ${err}` : ""}`,
        resp.status,
      );
    }
    return body;
  };

  return {
    async createServer(opts) {
      const body = await request("/servers", {
        method: "POST",
        body: JSON.stringify({
          name: opts.name,
          server_type: opts.serverType,
          location: opts.location,
          // The API distinguishes an image *ID* (int) from an image *name/slug*
          // (string). A snapshot has a numeric ID, so a bare-number string like
          // "123456789" must go up as a number or the API returns "image not
          // found". A real slug ("ubuntu-24.04") stays a string.
          image: /^\d+$/.test(opts.image) ? Number(opts.image) : opts.image,
          ssh_keys: opts.sshKeyNames,
          labels: opts.labels ?? {},
          start_after_create: true,
          ...(opts.userData ? { user_data: opts.userData } : {}),
        }),
      });
      const raw = (body as { server?: RawServer }).server;
      if (!raw) throw new HetznerApiError("Hetzner create-server response had no server object");
      return toServer(raw);
    },

    async getServer(id) {
      try {
        const body = await request(`/servers/${id}`);
        const raw = (body as { server?: RawServer }).server;
        return raw ? toServer(raw) : null;
      } catch (e) {
        if (e instanceof HetznerApiError && e.status === 404) return null;
        throw e;
      }
    },

    async deleteServer(id) {
      try {
        await request(`/servers/${id}`, { method: "DELETE" });
      } catch (e) {
        // A server that is already gone is a success for our purposes.
        if (e instanceof HetznerApiError && e.status === 404) return;
        throw e;
      }
    },

    async listServers(labelSelector) {
      const body = await request(`/servers?label_selector=${encodeURIComponent(labelSelector)}`);
      const raw = (body as { servers?: RawServer[] }).servers ?? [];
      return raw.map(toServer);
    },
  };
}
