/** Shapes `PageSkeleton` can draw while a route's data is still loading. */
export type LoadingSkeletonKind = "board" | "cards" | "table" | "rows" | "targets" | "deployments";

/**
 * Pick a skeleton that matches the route being opened. `/work` is the board;
 * list and settings pages use rows; a few routes already have a closer shape.
 */
export function loadingSkeletonKind(path: string): LoadingSkeletonKind {
  const route = path.split("?")[0] ?? "/";
  if (route === "/work" || route.startsWith("/work/")) return "board";
  if (route === "/checks" || route === "/secrets") return "table";
  if (route === "/agents" || route === "/releases") return "cards";
  if (route === "/dev") return "targets";
  if (route === "/deployments") return "deployments";
  return "rows";
}

/** The heading a page shows above its content, drawn while the page itself is still loading. */
export interface LoadingPageHeader {
  title: string;
  desc: string;
}

/**
 * Pages keep their title at the top while data loads, with the skeleton below
 * it. The app-level loader replaces the whole route, so it draws this header
 * itself. Routes without a standard page header (diffs, unknown paths) return
 * null and show the skeleton alone.
 */
export function loadingPageHeader(path: string): LoadingPageHeader | null {
  const route = path.split("?")[0] ?? "/";
  if (route === "/") return { title: "Mission Control", desc: "Live from your repo" };
  if (route === "/work" || route.startsWith("/work/")) {
    return { title: "Work Queue", desc: "Repo-native tasks" };
  }
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
