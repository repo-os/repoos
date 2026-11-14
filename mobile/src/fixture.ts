/**
 * Browser-dev fixtures for screenshots and tests (`?fixture=empty` etc.).
 * Never used on native builds — only query params on the Vite dev server.
 */
import type { ServerEntry } from "./types";

export type HubFixture =
  | "empty"
  | "one"
  | "many"
  | "unreachable"
  | "settings"
  | "add";

const FIXTURE_SERVERS: Record<Exclude<HubFixture, "settings" | "add">, ServerEntry[]> = {
  empty: [],
  one: [
    {
      id: "fx-1",
      url: "https://dev.repoos.org",
      name: "dev",
      order: 0,
      createdAt: 1,
    },
  ],
  many: [
    {
      id: "fx-1",
      url: "https://dev.repoos.org",
      name: "dev",
      order: 0,
      createdAt: 1,
    },
    {
      id: "fx-2",
      url: "https://celleris.repoos.org",
      name: "celleris",
      order: 1,
      createdAt: 2,
    },
    {
      id: "fx-3",
      url: "https://staging.repoos.org",
      name: "staging",
      order: 2,
      createdAt: 3,
    },
  ],
  unreachable: [
    {
      id: "fx-dead",
      url: "https://offline.example.test",
      name: "offline",
      order: 0,
      createdAt: 1,
    },
  ],
};

export function readHubFixture(): HubFixture | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("fixture")?.trim().toLowerCase();
  if (!raw) return null;
  const allowed: HubFixture[] = ["empty", "one", "many", "unreachable", "settings", "add"];
  return allowed.includes(raw as HubFixture) ? (raw as HubFixture) : null;
}

export function fixtureServers(fixture: HubFixture | null): ServerEntry[] | null {
  if (!fixture || fixture === "settings" || fixture === "add") return null;
  return FIXTURE_SERVERS[fixture] ?? null;
}

export function fixtureInitialRoute(fixture: HubFixture | null): "picker" | "settings" | "add" {
  if (fixture === "settings") return "settings";
  if (fixture === "add") return "add";
  return "picker";
}