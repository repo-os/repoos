/** Walk from a DOM node to the nearest copy-inspector attribution. */
export interface CopyInspectorTarget {
  file: string;
  line: number | null;
}

const FILE_ATTR = "data-repoos-file";
const LINE_ATTR = "data-repoos-line";

export function findCopyInspectorTarget(start: Node | null): CopyInspectorTarget | null {
  let el: Element | null =
    start instanceof Element
      ? start
      : start?.parentElement instanceof Element
        ? start.parentElement
        : null;
  while (el) {
    const file = el.getAttribute(FILE_ATTR);
    if (file) {
      const lineRaw = el.getAttribute(LINE_ATTR);
      const line = lineRaw && /^\d+$/.test(lineRaw) ? Number.parseInt(lineRaw, 10) : null;
      return { file, line: line && line >= 1 ? line : null };
    }
    el = el.parentElement;
  }
  return null;
}

export function formatInspectorPath(target: CopyInspectorTarget): string {
  return target.line != null ? `${target.file}:${target.line}` : target.file;
}
