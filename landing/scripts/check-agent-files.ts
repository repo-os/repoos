#!/usr/bin/env bun
/**
 * Build assertion for the landing site's agent files.
 *
 * Runs after `vite build` (see package.json), so the generated files are on
 * disk. It fails the landing build — not a separate `repoos check` step — when:
 *   - `landing/dist/llms.txt` is missing;
 *   - its install lines, InstallBox, getting-started, or the skill drift from
 *     the published six commands in agent/install-commands.ts;
 *   - the built call to action no longer embeds agent/starter-prompt.md; or
 *   - a docs.repoos.org link in llms.txt points at a page that does not exist.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareInstallCommands,
  extractInstallCommands,
  normalizeInstallCommand,
} from "../../agent/install-commands";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(scriptsDir, "../..");

const DOCS_ORIGIN = "https://docs.repoos.org";
/** Files the docs build generates, so there is no `user-docs/*.md` source. */
const GENERATED_DOCS_FILES = new Set(["llms.txt", "llms-full.txt"]);

function readText(absolute: string, label: string, failures: string[]): string {
  if (!existsSync(absolute)) {
    failures.push(`missing ${label}`);
    return "";
  }
  return readFileSync(absolute, "utf8");
}

function docsRouteExists(repoRoot: string, route: string): boolean {
  if (GENERATED_DOCS_FILES.has(route)) return true;
  const userDocsRoot = path.join(repoRoot, "user-docs");
  const clean = route.replace(/\.md$/, "");
  if (clean === "") return existsSync(path.join(userDocsRoot, "index.md"));
  return [`${clean}.md`, `${clean}/index.md`].some((relative) =>
    existsSync(path.join(userDocsRoot, relative)),
  );
}

/** Every docs.repoos.org URL in `text` must map to a real user-docs page. */
export function collectLandingLinkFailures(
  text: string,
  label: string,
  repoRoot = DEFAULT_REPO_ROOT,
): string[] {
  const failures: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(/https:\/\/docs\.repoos\.org[^\s)\]"'<>`]*/g)) {
    const url = match[0].replace(/[.,;:]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);

    const pathname = url.slice(DOCS_ORIGIN.length).split("#")[0].split("?")[0];
    const route = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!docsRouteExists(repoRoot, route)) {
      failures.push(`${label} links ${url}, but that page is not in user-docs/`);
    }
  }

  return failures;
}

/** Collect every agent-file build failure for the landing site. */
export function collectLandingAgentFileFailures(repoRoot = DEFAULT_REPO_ROOT): string[] {
  const failures: string[] = [];
  const landingRoot = path.join(repoRoot, "landing");
  const distRoot = path.join(landingRoot, "dist");

  const prompt = readText(
    path.join(repoRoot, "agent", "starter-prompt.md"),
    "agent/starter-prompt.md",
    failures,
  ).trim();

  // 1. The generated overview must exist and agree with the published commands.
  const llms = readText(
    path.join(distRoot, "llms.txt"),
    "landing/dist/llms.txt (vite build must emit it)",
    failures,
  );
  if (llms) {
    failures.push(...compareInstallCommands("landing/dist/llms.txt", extractInstallCommands(llms)));
    if (prompt && !llms.includes(`\`\`\`text\n${prompt}\n\`\`\``)) {
      failures.push("landing/dist/llms.txt does not embed agent/starter-prompt.md verbatim");
    }
    failures.push(...collectLandingLinkFailures(llms, "landing/dist/llms.txt", repoRoot));
  }

  // 2. Every hand-written copy of the install commands must match the list.
  const installBox = readText(
    path.join(landingRoot, "src", "components", "InstallBox.vue"),
    "landing/src/components/InstallBox.vue",
    failures,
  );
  if (installBox) {
    const commands = [...installBox.matchAll(/\bcmd:\s*"([^"]+)"/g)].map((match) =>
      normalizeInstallCommand(match[1]),
    );
    failures.push(...compareInstallCommands("landing/src/components/InstallBox.vue", commands));
  }

  const gettingStarted = readText(
    path.join(repoRoot, "user-docs", "getting-started.md"),
    "user-docs/getting-started.md",
    failures,
  );
  if (gettingStarted) {
    failures.push(
      ...compareInstallCommands(
        "user-docs/getting-started.md",
        extractInstallCommands(gettingStarted),
      ),
    );
  }

  const skillInstall = readText(
    path.join(repoRoot, "agent", "skill", "references", "detect-and-install.md"),
    "agent/skill/references/detect-and-install.md",
    failures,
  );
  if (skillInstall) {
    failures.push(
      ...compareInstallCommands(
        "agent/skill/references/detect-and-install.md",
        extractInstallCommands(skillInstall),
      ),
    );
  }

  // 3. The call to action copies the one shared prompt, not a rewritten copy.
  // Landing is a client-rendered Vue app, so the prompt lives in the built JS
  // bundle rather than index.html; every non-empty prompt line must be there.
  if (prompt) {
    const assetsDir = path.join(distRoot, "assets");
    if (!existsSync(assetsDir)) {
      failures.push(
        "landing/dist/assets is missing — the landing build did not emit its JS bundle",
      );
    } else {
      const bundle = readdirSync(assetsDir)
        .filter((name) => name.endsWith(".js"))
        .map((name) => readFileSync(path.join(assetsDir, name), "utf8"))
        .join("\n");
      // Minifiers differ on quoting; decode the escapes they commonly emit.
      const decoded = bundle.replace(/\\n/g, "\n").replace(/\\`/g, "`").replace(/\\"/g, '"');
      const missing = prompt
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .find((line) => !bundle.includes(line) && !decoded.includes(line));
      if (missing !== undefined) {
        failures.push(
          `landing call to action does not embed the shared prompt from agent/starter-prompt.md ` +
            `(missing line: "${missing}")`,
        );
      }
    }
  }

  return failures;
}

if (import.meta.main) {
  const failures = collectLandingAgentFileFailures();
  if (failures.length > 0) {
    console.error("\nlanding agent-file check failed:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    "landing agent-file check passed: dist/llms.txt, the six install commands, and the shared prompt agree",
  );
}
