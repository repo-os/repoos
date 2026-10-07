/**
 * `repoos story` — create, list, show and update story definitions under
 * `stories/` (#0696), without the PM agent.
 *
 * The only create path used to be the UI's **New story**, which always starts
 * the PM afterwards: the PM rewrites the body and tags untagged tasks it judges
 * part of the story. An agent or script that already knows the finished story
 * cannot use that — it needs the file written and committed exactly as given.
 * These commands are the deterministic counterpart, the story equivalent of
 * `repoos new` / `repoos update`.
 *
 * Board-rooted like every board write (#0202): resolved through `boardRoot()`
 * so a command run from inside a task's linked worktree still lands on the MAIN
 * checkout, the only copy the live board reads. `stories/` is a repo-level tree
 * shared by every task, so a worktree-local write would be invisible.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { boardRoot, loadConfig } from "../core/config.js";
import { commitFiles } from "../core/git.js";
import { c } from "../cli/colors.js";
import { normalizeStoryName } from "../core/stories.js";
import { mergeStoriesForDisplay, type StoryDefinition } from "../core/story-display.js";
import {
  findStoryDefinitionByKey,
  listStoryDefinitions,
  rewriteStoryDefinition,
  writeStoryDefinition,
} from "../core/story-definition-files.js";
import { createRepoOS } from "../core/repoos.js";

export const STORY_NEW_USAGE =
  '  Usage: repoos story new "<name>" --body "<text>"|-\n' +
  "    Writes and commits the story definition exactly as given; starts no agent.";

export const STORY_UPDATE_USAGE =
  '  Usage: repoos story update <number|name> [--name "<new name>"] [--body "<text>"|-]';

export const STORY_SHOW_USAGE = "  Usage: repoos story show <number|name> [--json]";

export const STORY_LIST_USAGE = "  Usage: repoos story list [--json]";

/**
 * The one place a story write resolves its root. Prints the same
 * "reading the MAIN checkout" warning `boardRepoOS()` does, so the jump is
 * never silent — but returns the config directly because `writeStoryDefinition`
 * and `rewriteStoryDefinition` take a `RepoOSConfig`, not a `RepoOS` facade.
 */
function boardConfig(): ReturnType<typeof loadConfig> {
  const { root, fromWorktree } = boardRoot();
  if (fromWorktree) {
    console.error(
      c.yellow("  ⚠ ") +
        c.dim("running from inside a linked worktree — writing the MAIN checkout's stories (") +
        c.cyan(root) +
        c.dim(")"),
    );
  }
  return loadConfig(root);
}

/** Match a story by its stable number (`0007`, `#0007`, `7`) or by its name/key. */
function resolveStory(config: ReturnType<typeof loadConfig>, ref: string): StoryDefinition | null {
  const raw = ref.trim().replace(/^#/, "");
  const wanted = raw.toLowerCase();
  const definitions = listStoryDefinitions(config);
  if (/^\d+$/.test(wanted)) {
    const number = wanted.padStart(4, "0");
    const byNumber = definitions.find((d) => d.number === number);
    if (byNumber) return byNumber;
  }
  return findStoryDefinitionByKey(config, wanted);
}

/** `repoos story new "<name>" --body <text|->` — write verbatim, commit, no PM. */
export function cmdStoryNew(args: string[]): void {
  const positional: string[] = [];
  let body: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--body") {
      const raw = args[++i];
      if (raw === undefined) {
        console.error(c.red(`  Missing value for --body\n${STORY_NEW_USAGE}`));
        process.exitCode = 1;
        return;
      }
      body = raw === "-" ? readFileSync(0, "utf8") : raw;
      continue;
    }
    if (a.startsWith("--")) {
      console.error(c.red(`  Unknown flag ${a}\n${STORY_NEW_USAGE}`));
      process.exitCode = 1;
      return;
    }
    positional.push(a);
  }
  const name = normalizeStoryName(positional.join(" "));
  if (!name) {
    console.error(c.red(STORY_NEW_USAGE));
    process.exitCode = 1;
    return;
  }
  if (body === undefined || !body.trim()) {
    console.error(
      c.red(`  A story body is required (--body "<text>" or --body -).\n${STORY_NEW_USAGE}`),
    );
    process.exitCode = 1;
    return;
  }

  const config = boardConfig();
  let definition: StoryDefinition;
  try {
    definition = writeStoryDefinition(config, { name, body });
  } catch (err) {
    console.error(c.red(`  ${(err as Error).message}`));
    process.exitCode = 1;
    return;
  }
  const committed = commitFiles(
    config.root,
    [join(config.root, definition.path)],
    `docs(stories): add "${definition.name}"`,
  );
  console.log(
    "  " +
      c.green("created story ") +
      c.dim(`#${definition.number}  `) +
      definition.name +
      c.dim("  → " + definition.path),
  );
  if (committed) console.log("  " + c.green("committed "));
  else console.log("  " + c.yellow("warning: ") + c.dim("file left uncommitted"));
}

/** `repoos story list [--json]` — every registered definition. */
export function cmdStoryList(args: string[]): void {
  const config = boardConfig();
  const definitions = listStoryDefinitions(config);
  if (args.includes("--json")) {
    console.log(JSON.stringify(definitions, null, 2));
    return;
  }
  if (definitions.length === 0) {
    console.log(
      c.dim("\n  No registered stories. Create one with ") +
        c.cyan('repoos story new "Name" --body "…"') +
        c.dim(".\n"),
    );
    return;
  }
  console.log(c.bold("\n  Stories") + c.dim(`  ·  ${definitions.length}\n`));
  for (const d of definitions) {
    console.log("    " + c.dim("#" + d.number + "  ") + d.name + c.dim("  → " + d.path));
  }
  console.log("");
}

/** `repoos story show <number|name> [--json]` — definition plus member tasks. */
export function cmdStoryShow(args: string[]): void {
  const json = args.includes("--json");
  const ref = args
    .filter((a) => !a.startsWith("--"))
    .join(" ")
    .trim();
  if (!ref) {
    console.error(c.red(STORY_SHOW_USAGE));
    process.exitCode = 1;
    return;
  }
  const config = boardConfig();
  const definition = resolveStory(config, ref);
  // `mergeStoriesForDisplay` resolves a number, a name or a key to one group and
  // carries its member tasks with their statuses — the same roll-up the panel
  // shows, so `show` can never disagree with the board about membership.
  const groups = mergeStoriesForDisplay(
    createRepoOS(config.root).getTasks(),
    listStoryDefinitions(config),
  );
  const key = definition ? definition.key : ref.trim().toLowerCase();
  const number = definition?.number;
  const group = groups.find((g) => (number && g.number === number) || g.key === key) ?? null;
  if (!definition && !group) {
    console.error(c.red(`  Story "${ref}" not found.`));
    process.exitCode = 1;
    return;
  }
  const members = group?.tasks ?? [];
  const name = definition?.name ?? group?.name ?? ref;

  if (json) {
    console.log(
      JSON.stringify(
        {
          definition,
          number: definition?.number ?? null,
          name,
          tasks: members.map((t) => ({ id: t.id, title: t.title, status: t.status })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("");
  console.log(
    "  " +
      c.bold(name) +
      (definition ? c.dim(`  #${definition.number}`) : c.dim("  (tag-only, no definition)")),
  );
  if (definition) console.log("  " + c.dim(definition.path));
  console.log(c.dim("  ─────────────────────────────────────────────────────────"));
  console.log("  " + c.dim("members  ") + String(members.length));
  for (const t of members) {
    console.log("    " + c.dim("#" + t.id + "  ") + c.dim(t.status.padEnd(8)) + t.title);
  }
  console.log(c.dim("  ─────────────────────────────────────────────────────────"));
  const body = definition?.body ?? group?.body ?? "";
  if (body) {
    for (const line of body.split("\n")) console.log("  " + line);
  }
  console.log("");
}

/** `repoos story update <number|name> [--name …] [--body …|-]` — keep the number. */
export function cmdStoryUpdate(args: string[]): void {
  const positional: string[] = [];
  let newName: string | undefined;
  let newBody: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--name") {
      const raw = args[++i];
      if (raw === undefined) {
        console.error(c.red(`  Missing value for --name\n${STORY_UPDATE_USAGE}`));
        process.exitCode = 1;
        return;
      }
      newName = raw;
      continue;
    }
    if (a === "--body") {
      const raw = args[++i];
      if (raw === undefined) {
        console.error(c.red(`  Missing value for --body\n${STORY_UPDATE_USAGE}`));
        process.exitCode = 1;
        return;
      }
      newBody = raw === "-" ? readFileSync(0, "utf8") : raw;
      continue;
    }
    if (a.startsWith("--")) {
      console.error(c.red(`  Unknown flag ${a}\n${STORY_UPDATE_USAGE}`));
      process.exitCode = 1;
      return;
    }
    positional.push(a);
  }
  const ref = positional.join(" ").trim();
  if (!ref) {
    console.error(c.red(STORY_UPDATE_USAGE));
    process.exitCode = 1;
    return;
  }
  if (newName === undefined && newBody === undefined) {
    console.error(c.red(`  Nothing to update — pass --name and/or --body.\n${STORY_UPDATE_USAGE}`));
    process.exitCode = 1;
    return;
  }

  const config = boardConfig();
  const existing = resolveStory(config, ref);
  if (!existing) {
    console.error(c.red(`  Story "${ref}" not found.`));
    process.exitCode = 1;
    return;
  }
  let rewritten;
  try {
    rewritten = rewriteStoryDefinition(config, existing.path, {
      name: newName ?? existing.name,
      body: newBody ?? existing.body,
    });
  } catch (err) {
    console.error(c.red(`  ${(err as Error).message}`));
    process.exitCode = 1;
    return;
  }
  const committed = commitFiles(
    config.root,
    [rewritten.definition.path, rewritten.previousPath]
      .filter((p): p is string => Boolean(p))
      .map((p) => join(config.root, p)),
    `docs(stories): update "${rewritten.definition.name}"`,
  );
  console.log(
    "  " +
      c.green("updated story ") +
      c.dim(`#${rewritten.definition.number}  `) +
      rewritten.definition.name,
  );
  if (rewritten.previousPath) {
    console.log("  " + c.dim(`moved ${rewritten.previousPath} → ${rewritten.definition.path}`));
  }
  if (committed) console.log("  " + c.green("committed "));
  else console.log("  " + c.yellow("warning: ") + c.dim("file left uncommitted"));
}

/** Dispatch `repoos story <sub> …`; unknown subcommands print usage. */
export function cmdStory(args: string[]): void {
  const [sub, ...rest] = args;
  switch (sub) {
    case "new":
      cmdStoryNew(rest);
      return;
    case "list":
    case "ls":
      cmdStoryList(rest);
      return;
    case "show":
    case "cat":
      cmdStoryShow(rest);
      return;
    case "update":
      cmdStoryUpdate(rest);
      return;
    default:
      console.error(
        c.red(`  Unknown story subcommand: ${sub ?? "(none)"}`) +
          "\n" +
          c.dim(
            [STORY_NEW_USAGE, STORY_LIST_USAGE, STORY_SHOW_USAGE, STORY_UPDATE_USAGE].join("\n"),
          ),
      );
      process.exitCode = 1;
  }
}
