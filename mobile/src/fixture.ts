/**
 * Browser-dev fixtures for screenshots and tests (`?fixture=empty` etc.).
 * Never used on native builds — only query params on the Vite dev server.
 */
import type { ServerEntry } from "./types";
import type { TailnetServer } from "./tailnet";

export type HubFixture = "empty" | "one" | "many" | "unreachable" | "settings" | "add" | "discover";

const FIXTURE_SERVERS: Record<
  Exclude<HubFixture, "settings" | "add" | "discover">,
  ServerEntry[]
> = {
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
  const allowed: HubFixture[] = [
    "empty",
    "one",
    "many",
    "unreachable",
    "settings",
    "add",
    "discover",
  ];
  return allowed.includes(raw as HubFixture) ? (raw as HubFixture) : null;
}

export function fixtureServers(fixture: HubFixture | null): ServerEntry[] | null {
  if (!fixture || fixture === "settings" || fixture === "add") return null;
  if (fixture === "discover") return FIXTURE_SERVERS.many;
  return FIXTURE_SERVERS[fixture] ?? null;
}

/**
 * Browser-dev discovery results (`?fixture=discover`) so the picker's import
 * screen can be inspected without a tailnet. `dev.repoos.org` is already in the
 * `many` fixture to exercise the "Already saved" row; the HTTP and unreachable
 * rows exercise the two non-selectable messages.
 */
export function fixtureTailnetRows(): TailnetServer[] {
  return [
    {
      host: "bee",
      port: 7499,
      projectName: "dev",
      url: "https://dev.repoos.org",
      https: true,
    },
    {
      host: "thinkpad",
      port: 7819,
      projectName: "celleris-nightly",
      url: "https://thinkpad.tailc0c173.ts.net:8443",
      https: true,
    },
    {
      host: "thinkpad",
      port: 7578,
      projectName: "plain-http",
      url: "http://thinkpad.tailc0c173.ts.net:7578",
      https: false,
    },
    {
      host: "mini",
      unreachable: true,
      reason: "timed out",
    },
  ];
}

export function fixtureInitialRoute(
  fixture: HubFixture | null,
): "picker" | "settings" | "add" | "discover" {
  if (fixture === "settings") return "settings";
  if (fixture === "add") return "add";
  if (fixture === "discover") return "discover";
  return "picker";
}
