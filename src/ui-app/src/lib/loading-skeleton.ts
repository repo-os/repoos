/** Shapes `PageSkeleton` can draw while a route's data is still loading. */
export type LoadingSkeletonKind =
  | "board"
  | "inputBoard"
  | "dashboard"
  | "cards"
  | "table"
  | "rows"
  | "targets"
  | "deployments";

/** Timing is shared by the route shell and every view-level placeholder. */
export const SKELETON_SHOW_DELAY_MS = 180;
export const SKELETON_MIN_VISIBLE_MS = 350;

/** Minimal representative blocks for content that is not available yet. */
export const MISSION_CONTROL_PLACEHOLDER_COUNT = 1;
export const PAGE_CARD_PLACEHOLDER_COUNT = 1;
export const PAGE_TABLE_PLACEHOLDER_COUNT = 1;
export const PAGE_ROW_PLACEHOLDER_COUNT = 1;
export const DEV_TARGET_PLACEHOLDER_COUNT = 1;
export const DEPLOYMENT_SERVICE_PLACEHOLDER_COUNT = 1;
export const DEPLOYMENT_BRANCH_PLACEHOLDER_COUNT = 1;
/** Must stay aligned with `.board` in style.css. */
export const BOARD_MEDIUM_BREAKPOINT_PX = 1250;

export const LOADING_SKELETON_ITEM_COUNTS = {
  dashboard: MISSION_CONTROL_PLACEHOLDER_COUNT,
  cards: PAGE_CARD_PLACEHOLDER_COUNT,
  table: PAGE_TABLE_PLACEHOLDER_COUNT,
  rows: PAGE_ROW_PLACEHOLDER_COUNT,
  targets: DEV_TARGET_PLACEHOLDER_COUNT,
  deployments: DEPLOYMENT_SERVICE_PLACEHOLDER_COUNT,
} as const satisfies Partial<Record<LoadingSkeletonKind, number>>;

/** Every routed path the app shell can open while the repo index loads. */
export const LOADING_SKELETON_ROUTES = [
  "/",
  "/work",
  "/client-board",
  "/inputs",
  "/stories",
  "/checks",
  "/releases",
  "/deployments",
  "/dev",
  "/secrets",
  "/agents",
  "/settings",
  "/repo",
] as const;

/**
 * Pick a skeleton that matches the route being opened. `/work` is the board;
 * list and settings pages use rows; a few routes already have a closer shape.
 */
export function loadingSkeletonKind(path: string): LoadingSkeletonKind {
  const route = path.split("?")[0] ?? "/";
  if (route === "/work" || route.startsWith("/work/")) return "board";
  if (route === "/inputs" || route === "/client-board") return "inputBoard";
  if (route === "/") return "dashboard";
  if (route === "/checks" || route === "/secrets") return "table";
  if (route === "/agents" || route === "/releases") return "cards";
  if (route === "/dev") return "targets";
  if (route === "/deployments") return "deployments";
  if (route === "/stories" || route === "/settings" || route === "/repo") return "rows";
  if (route.startsWith("/tasks/") || route.startsWith("/repo/")) return "rows";
  return "rows";
}

/** The heading a page shows above its content, drawn while data loads. */
export interface LoadingPageHeader {
  title: string;
  desc: string;
}

/** Static page chrome rendered by the app-level loading shell. */
export function loadingPageHeader(path: string): LoadingPageHeader | null {
  const route = path.split("?")[0] ?? "/";
  if (route === "/") return { title: "Mission Control", desc: "Live from your repo" };
  if (route === "/work" || route.startsWith("/work/")) {
    return { title: "Work Queue", desc: "Repo-native tasks" };
  }
  if (route === "/client-board")
    return { title: "Project board", desc: "Work planned and in progress for this project." };
  if (route === "/inputs") return { title: "Inputs", desc: "Raw requests and source material" };
  if (route === "/stories") return { title: "Stories", desc: "Cross-area delivery slices" };
  if (route === "/checks") return { title: "Checks", desc: "The check plan and recent runs" };
  if (route === "/releases") {
    return { title: "Releases", desc: "Cut and track tagged releases of this repository." };
  }
  if (route === "/deployments")
    return { title: "Deployments", desc: "Where this repo is deployed" };
  if (route === "/dev") return { title: "Dev", desc: "Run the things this project declares" };
  if (route === "/secrets") {
    return {
      title: "Secrets",
      desc: "Manage the keys this project expects. Saved values stay hidden.",
    };
  }
  if (route === "/agents") return { title: "Agents", desc: "Coding agents and budgets" };
  if (route === "/settings") return { title: "Settings", desc: "Configure RepoOS" };
  if (route === "/repo") {
    return { title: "Repo Context", desc: "AI-readable docs · ADRs · skills · history" };
  }
  return null;
}
