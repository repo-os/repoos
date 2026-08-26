/**
 * Core domain types for the RepoOS mobile hub.
 *
 * A `ServerEntry` is a locally-saved reference to a self-hosted RepoOS
 * instance. Everything here stays on-device; nothing is ever sent to RepoOS
 * beyond the URL the user chooses to open in the WebView.
 */
export interface ServerEntry {
  /** Stable local id (uuid). Never user-visible. */
  id: string;
  /** HTTPS origin of the RepoOS instance, e.g. "https://dev.repoos.org". */
  url: string;
  /** User-assigned local display name, e.g. "dev" or "Work". */
  name: string;
  /** Position in the picker (0 = first). */
  order: number;
  /** When this entry was added (epoch ms). */
  createdAt: number;
}

/** A server entry before it has an id/order (draft from the add form). */
export type NewServer = Pick<ServerEntry, "url" | "name">;

/** Options for the optional device lock. */
export interface LockSettings {
  enabled: boolean;
  /** "reopen" = lock whole app, "server" = lock only when opening a server. */
  scope: "reopen" | "server";
}

export interface DeviceLockResult {
  supported: boolean;
  available: boolean;
}
