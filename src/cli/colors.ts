/** Minimal ANSI styling. Honors NO_COLOR and non-TTY output. */
const enabled = process.env.NO_COLOR === undefined && process.stdout.isTTY === true;

const wrap = (open: number, close: number) => (s: string) =>
  enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  cyan: wrap(36, 39),
  magenta: wrap(35, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  red: wrap(31, 39),
  gray: wrap(90, 39),
};

/** Color a status string consistently with the GUI palette. */
export function statusColor(status: string): (s: string) => string {
  switch (status) {
    case "draft":
      return c.dim;
    case "ready":
      return c.cyan;
    case "active":
      return c.magenta;
    case "review":
      return c.yellow;
    case "done":
      return c.green;
    default:
      return c.gray;
  }
}

export function priorityColor(p: string): (s: string) => string {
  if (p === "p0" || p === "p1") return c.red;
  if (p === "p2") return c.yellow;
  return c.green;
}
