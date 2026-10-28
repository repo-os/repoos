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
