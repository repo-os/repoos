/**
 * Easter-eggs bundle task body layout and surgical edits (#0823, #0824).
 * See docs/easter-eggs-bundles.md.
 */
import { extractSection } from "./task.js";

/** Title prefix for easter-eggs bundle tasks. */
export const EASTER_EGGS_BUNDLE_TITLE_PREFIX = "Easter eggs bundle: ";

/** Checklist heading at the top of every easter-eggs bundle body. */
export const EASTER_EGGS_BUNDLE_ITEMS_HEADING = "## Items";

/** Sub-headings inside each `## E<n> · Title` section. */
export const EASTER_EGGS_BUNDLE_ITEM_SUBSECTIONS = [
  "Problem",
  "Desired UX",
  "Acceptance criteria",
  "Notes for AI",
] as const;

export type EasterEggsBundleSubsection = (typeof EASTER_EGGS_BUNDLE_ITEM_SUBSECTIONS)[number];

export class EasterEggsBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EasterEggsBundleError";
  }
}

export function isEasterEggsBundleTitle(title: string): boolean {
  return title.startsWith(EASTER_EGGS_BUNDLE_TITLE_PREFIX);
}

export function assertEasterEggsBundleTitle(title: string, force = false): void {
  if (!force && !isEasterEggsBundleTitle(title)) {
    throw new EasterEggsBundleError(
      `task is not an easter-eggs bundle (title must start with "${EASTER_EGGS_BUNDLE_TITLE_PREFIX.trim()}") — pass --force to override`,
    );
  }
}

/** Normalize `E2`, `e2`, or `2` to `E2`. */
export function normalizeBundleItemId(ref: string): string {
  const trimmed = ref.trim();
  const m = trimmed.match(/^E?(\d+)$/i);
  if (!m) {
    throw new EasterEggsBundleError(
      `unknown bundle item id "${ref}" — expected E<n> or a number (e.g. E2 or 2)`,
    );
  }
  return `E${m[1]}`;
}

/** One `## Items` checklist line; id is stable for the life of the bundle. */
export function easterEggsBundleItemsLine(
  id: number,
  title: string,
  area: string,
  fix: string,
  source: string,
  done = false,
): string {
  const check = done ? "x" : " ";
  return `- [${check}] **E${id} · ${title}** (${area}) — ${fix}. Source: ${source}.`;
}

export function easterEggsBundleItemSectionHeading(id: number, title: string): string {
  return `## E${id} · ${title}`;
}

export function easterEggsBundleItemsIntro(): string {
  return (
    "Each item below has the same parts: Problem, Desired UX, Acceptance criteria, Notes for AI. " +
    "Edit one item at a time with `--section`; never resend the whole body."
  );
}

/**
 * Starter body for a new easter-eggs bundle with one item. PM agents and
 * `repoos bundle` append helpers match this layout exactly.
 */
export function easterEggsBundleStarterBody(opts: {
  id: number;
  title: string;
  area: string;
  fix: string;
  source: string;
}): string {
  const blocks: string[] = [
    EASTER_EGGS_BUNDLE_ITEMS_HEADING,
    "",
    easterEggsBundleItemsLine(opts.id, opts.title, opts.area, opts.fix, opts.source),
    "",
    easterEggsBundleItemsIntro(),
    "",
    easterEggsBundleItemSectionHeading(opts.id, opts.title),
    "",
  ];
  for (const name of EASTER_EGGS_BUNDLE_ITEM_SUBSECTIONS) {
    blocks.push(`### ${name}`, "", "");
  }
  return blocks.join("\n");
}

/** Numeric ids from `## E<n> ·` section headings. */
export function bundleItemSectionNumericIds(body: string): number[] {
  const ids: number[] = [];
  for (const line of body.split("\n")) {
    const m = line.trim().match(/^## E(\d+)\s*·/);
    if (m) ids.push(Number(m[1]));
  }
  return ids;
}

/** Next free stable id (never reuses a gap). */
export function nextBundleItemId(body: string): number {
  const ids = bundleItemSectionNumericIds(body);
  if (ids.length === 0) return 1;
  return Math.max(...ids) + 1;
}

function nextTopLevelSectionLine(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^## [^#]/.test(t)) return i;
  }
  return lines.length;
}

function itemsSectionRange(lines: string[]): [number, number] {
  const start = lines.findIndex((l) => l.trim() === EASTER_EGGS_BUNDLE_ITEMS_HEADING);
  if (start === -1) {
    throw new EasterEggsBundleError("bundle body has no ## Items section");
  }
  return [start, nextTopLevelSectionLine(lines, start + 1)];
}

function lastChecklistLineInItems(lines: string[], start: number, end: number): number {
  let last = -1;
  for (let i = start + 1; i < end; i++) {
    if (/^- \[[ x]\] \*\*E\d+\s*·/.test(lines[i].trim())) last = i;
  }
  if (last === -1) {
    throw new EasterEggsBundleError("## Items has no checklist lines");
  }
  return last;
}

function lastBundleItemSectionEnd(lines: string[]): number {
  let lastEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^## E\d+\s*·/.test(lines[i].trim())) {
      lastEnd = nextTopLevelSectionLine(lines, i + 1);
    }
  }
  if (lastEnd === -1) {
    throw new EasterEggsBundleError("bundle body has no ## E<n> · sections");
  }
  return lastEnd;
}

function bundleItemSectionRange(lines: string[], itemId: string): [number, number] {
  const num = itemId.slice(1);
  const re = new RegExp(`^## E${num}\\s*·`);
  const start = lines.findIndex((l) => re.test(l.trim()));
  if (start === -1) {
    throw new EasterEggsBundleError(`bundle has no section for ${itemId}`);
  }
  return [start, nextTopLevelSectionLine(lines, start + 1)];
}

function formatNewItemSection(id: number, title: string, test?: string): string {
  const blocks: string[] = [easterEggsBundleItemSectionHeading(id, title), ""];
  for (const name of EASTER_EGGS_BUNDLE_ITEM_SUBSECTIONS) {
    blocks.push(`### ${name}`, "");
    if (name === "Acceptance criteria" && test?.trim()) {
      blocks.push(`- Test: ${test.trim()}`, "");
    } else {
      blocks.push("");
    }
  }
  return blocks.join("\n");
}

export interface AppendBundleItemOpts {
  title: string;
  area: string;
  fix: string;
  source: string;
  test?: string;
}

/** Append one checklist line and one `## E<n>` section; leave all other bytes unchanged. */
export function appendBundleItem(body: string, opts: AppendBundleItemOpts): string {
  const id = nextBundleItemId(body);
  const newLine = easterEggsBundleItemsLine(id, opts.title, opts.area, opts.fix, opts.source);
  const lines = body.split("\n");
  const [itemsStart, itemsEnd] = itemsSectionRange(lines);
  const insertLineAt = lastChecklistLineInItems(lines, itemsStart, itemsEnd) + 1;
  lines.splice(insertLineAt, 0, newLine);

  const sectionEnd = lastBundleItemSectionEnd(lines);
  const sectionBlock = formatNewItemSection(id, opts.title, opts.test);
  const prefix = lines.slice(0, sectionEnd).join("\n");
  const suffix = lines.slice(sectionEnd).join("\n");
  if (suffix.length === 0) {
    return `${prefix}\n\n${sectionBlock}`;
  }
  return `${prefix}\n\n${sectionBlock}\n\n${suffix}`;
}

/** Replace one `###` subsection inside a bundle item's `## E<n>` section. */
export function editBundleItemSubsection(
  body: string,
  itemRef: string,
  subsection: string,
  sectionBody: string,
): string {
  const itemId = normalizeBundleItemId(itemRef);
  const name = subsection.trim();
  if (!(EASTER_EGGS_BUNDLE_ITEM_SUBSECTIONS as readonly string[]).includes(name)) {
    throw new EasterEggsBundleError(
      `unknown subsection "${subsection}" — expected one of: ${EASTER_EGGS_BUNDLE_ITEM_SUBSECTIONS.join(", ")}`,
    );
  }

  const lines = body.split("\n");
  const [secStart, secEnd] = bundleItemSectionRange(lines, itemId);
  const sectionLines = lines.slice(secStart, secEnd);
  const heading = `### ${name}`;
  const subStart = sectionLines.findIndex((l) => l.trim() === heading);
  if (subStart === -1) {
    throw new EasterEggsBundleError(`${itemId} has no ${heading} subsection`);
  }
  let subEnd = sectionLines.length;
  for (let i = subStart + 1; i < sectionLines.length; i++) {
    if (sectionLines[i].trim().startsWith("### ")) {
      subEnd = i;
      break;
    }
  }
  const contentLines = sectionBody.split("\n");
  const rebuiltSection = [
    ...sectionLines.slice(0, subStart + 1),
    ...contentLines,
    ...sectionLines.slice(subEnd),
  ];
  const before = lines.slice(0, secStart).join("\n");
  const after = lines.slice(secEnd).join("\n");
  const middle = rebuiltSection.join("\n");
  if (before && after) return `${before}\n${middle}\n${after}`;
  if (before) return `${before}\n${middle}`;
  if (after) return `${middle}\n${after}`;
  return middle;
}

/** Toggle `- [ ]` / `- [x]` on the matching line under `## Items`. */
export function setBundleItemChecked(body: string, itemRef: string, checked: boolean): string {
  const itemId = normalizeBundleItemId(itemRef);
  const num = itemId.slice(1);
  bundleItemSectionRange(body.split("\n"), itemId);

  const lines = body.split("\n");
  const [itemsStart, itemsEnd] = itemsSectionRange(lines);
  const re = new RegExp(`^- \\[[ x]\\] \\*\\*E${num}\\s*·`);
  let found = false;
  for (let i = itemsStart + 1; i < itemsEnd; i++) {
    if (re.test(lines[i].trim())) {
      found = true;
      const check = checked ? "x" : " ";
      lines[i] = lines[i].replace(/^- \[[ x]\]/, `- [${check}]`);
      break;
    }
  }
  if (!found) {
    throw new EasterEggsBundleError(`no checklist line for ${itemId} under ## Items`);
  }
  return lines.join("\n");
}

/** Apply a bundle mutation from an API/CLI action payload. */
export function applyBundleBodyMutation(
  title: string,
  body: string,
  input: BundleMutationInput,
): string {
  assertEasterEggsBundleTitle(title, input.force === true);
  switch (input.action) {
    case "add": {
      if (!input.title?.trim()) throw new EasterEggsBundleError("--title is required");
      if (!input.area?.trim()) throw new EasterEggsBundleError("--area is required");
      if (!input.fix?.trim()) throw new EasterEggsBundleError("--fix is required");
      if (!input.source?.trim()) throw new EasterEggsBundleError("--source is required");
      return appendBundleItem(body, {
        title: input.title.trim(),
        area: input.area.trim(),
        fix: input.fix.trim(),
        source: input.source.trim(),
        test: input.test?.trim() || undefined,
      });
    }
    case "edit": {
      if (!input.item) throw new EasterEggsBundleError("bundle item id is required (e.g. E2)");
      if (!input.section?.trim()) throw new EasterEggsBundleError("--section is required");
      if (input.sectionBody === undefined) {
        throw new EasterEggsBundleError("--section-body is required");
      }
      return editBundleItemSubsection(body, input.item, input.section, input.sectionBody);
    }
    case "done":
      if (!input.item) throw new EasterEggsBundleError("bundle item id is required (e.g. E2)");
      return setBundleItemChecked(body, input.item, true);
    case "undo":
      if (!input.item) throw new EasterEggsBundleError("bundle item id is required (e.g. E2)");
      return setBundleItemChecked(body, input.item, false);
    default:
      throw new EasterEggsBundleError(`unknown bundle action "${String(input.action)}"`);
  }
}

export interface BundleMutationInput {
  action: "add" | "edit" | "done" | "undo";
  force?: boolean;
  title?: string;
  area?: string;
  fix?: string;
  source?: string;
  test?: string;
  item?: string;
  section?: string;
  sectionBody?: string;
}

/** `## E<n> · …` item section ids in a bundle body (empty when not a bundle). */
export function bundleItemSectionIds(body: string): Set<string> {
  const ids = new Set<string>();
  for (const n of bundleItemSectionNumericIds(body)) ids.add(`E${n}`);
  return ids;
}

/** `**E<n> ·` ids listed under `## Items` (empty when that section is absent). */
export function bundleItemsListIds(body: string): Set<string> {
  const itemsSection = extractSection(body, EASTER_EGGS_BUNDLE_ITEMS_HEADING);
  if (itemsSection === null) return new Set();
  const ids = new Set<string>();
  for (const line of itemsSection.split("\n")) {
    const m = line.match(/\*\*E(\d+)\s*·/);
    if (m) ids.add(`E${m[1]}`);
  }
  return ids;
}
