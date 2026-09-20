/**
 * `repoos support` — create and inspect a redacted support bundle (#0453).
 *
 * The command holds no diagnostic logic of its own: it runs the engine in
 * `src/core/support-bundle.ts`, prints exactly what will be included and where
 * the archive will be written, and (unless `--dry-run`) writes it. It never
 * uploads, opens a browser, copies to the clipboard or creates an issue — those
 * are separate, explicit user actions.
 *
 *   repoos support bundle              write a redacted bundle under .repoos/support/
 *   repoos support bundle --dry-run    show the plan; write nothing
 *   repoos support inspect <file>      enumerate the files inside an existing bundle
 */
import { dirname, resolve } from "node:path";
import {
  buildSupportBundle,
  bundlePathWarning,
  defaultBundlePath,
  readBundleManifest,
  serializeSupportBundle,
  type SupportBundle,
  type SupportManifest,
} from "../core/support-bundle.js";
import { RedactionLeakError } from "../core/redact.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { c } from "../cli/colors.js";

interface BundleArgs {
  dryRun: boolean;
  json: boolean;
  out: string | null;
  help: boolean;
}

function parseBundleArgs(argv: string[]): BundleArgs {
  const args: BundleArgs = { dryRun: false, json: false, out: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run" || a === "-n") args.dryRun = true;
    else if (a === "--json") args.json = true;
    else if (a === "--out" || a === "-o") args.out = argv[++i] ?? null;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

const MANIFEST_DESCRIPTION =
  "Machine-readable index: files, sizes, hashes, collection time and redaction rules.";

/** Render the "what's included / what's omitted / where it goes" plan. */
function printPlan(manifest: SupportManifest, outPath: string, dryRun: boolean): void {
  console.log("");
  console.log("  " + c.bold(c.cyan("RepoOS support bundle")));
  console.log(
    c.dim(
      `  schema v${manifest.schemaVersion} · redaction rules v${manifest.redactionVersion} · ` +
        `${manifest.files.length + 1} files`,
    ),
  );
  console.log("");
  console.log("  " + c.bold("Included"));
  const rows = [
    ...manifest.files.map((f) => ({
      path: f.path,
      category: f.category,
      description: f.description,
    })),
    { path: "manifest.json", category: "manifest", description: MANIFEST_DESCRIPTION },
  ];
  for (const r of rows) {
    console.log(`    ${c.green("•")} ${r.path.padEnd(20)} ${c.dim(r.category)}`);
    console.log(`      ${c.dim(r.description)}`);
  }
  if (manifest.omitted.length) {
    console.log("");
    console.log("  " + c.bold("Omitted (with reason)"));
    for (const o of manifest.omitted) {
      console.log(`    ${c.yellow("•")} ${o.category} — ${o.reason}`);
    }
  }
  console.log("");
  console.log("  " + c.bold("Where"));
  console.log(`    ${dryRun ? c.yellow("would write to") : c.green("writes to")} ${outPath}`);
  console.log(
    c.dim(
      "    Redacted, local-only. No source, prompts, task bodies, credentials or environment values.",
    ),
  );
}

function printManifestJson(manifest: SupportManifest, outPath: string, dryRun: boolean): void {
  console.log(
    JSON.stringify(
      { ...manifest, archive: dryRun ? null : outPath, wouldWriteTo: dryRun ? outPath : null },
      null,
      2,
    ),
  );
}

/** `repoos support bundle [--dry-run] [--json] [--out <path>]` */
async function cmdBundle(argv: string[]): Promise<void> {
  const args = parseBundleArgs(argv);
  if (args.help) {
    printSupportHelp();
    return;
  }
  let bundle: SupportBundle;
  try {
    bundle = await buildSupportBundle({});
  } catch (e) {
    if (e instanceof RedactionLeakError) {
      console.error(c.red("  ✖ ") + e.message);
    } else {
      console.error(c.red("  support bundle failed: ") + (e as Error).message);
    }
    process.exitCode = 1;
    return;
  }

  const outPath = args.out
    ? resolve(args.out)
    : defaultBundlePath(bundle.root, bundle.cacheDir, new Date(bundle.report.generatedAt));

  if (args.json) printManifestJson(bundle.manifest, outPath, args.dryRun);
  else printPlan(bundle.manifest, outPath, args.dryRun);

  if (args.dryRun) {
    if (!args.json) {
      console.log("");
      console.log(c.dim("  dry run — nothing was written."));
      console.log("");
    }
    return;
  }

  const buffer = serializeSupportBundle(bundle);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buffer);
  if (!args.json) {
    console.log("");
    console.log(`  ${c.green("✔")} wrote ${c.cyan(outPath)} ${c.dim(`(${buffer.length} bytes)`)}`);
    console.log(c.dim("    Inspect before sharing: ") + c.dim(`repoos support inspect ${outPath}`));
    const warning = bundlePathWarning(outPath, bundle.root);
    if (warning) console.log("  " + c.yellow("⚠ ") + warning);
    console.log("");
  }
}

/** `repoos support inspect <archive> [--json]` */
function cmdInspect(argv: string[]): void {
  const asJson = argv.includes("--json");
  const target = argv.find((a) => !a.startsWith("-"));
  if (!target) {
    console.error(c.red("  usage: repoos support inspect <bundle.tar.gz>"));
    process.exitCode = 1;
    return;
  }
  const archive = resolve(target);
  try {
    const manifest = readBundleManifest(archive);
    if (asJson) {
      console.log(JSON.stringify(manifest, null, 2));
      return;
    }
    console.log("");
    console.log("  " + c.bold(c.cyan("Support bundle contents")) + c.dim(` — ${archive}`));
    console.log(c.dim(`  collected ${manifest.generatedAt}`));
    for (const f of manifest.files) {
      console.log(`    ${c.green("•")} ${f.path.padEnd(20)} ${c.dim(`${f.bytes} bytes`)}`);
      console.log(`      ${c.dim(f.description)}`);
    }
    console.log(`    ${c.green("•")} manifest.json        ${c.dim("(this index)")}`);
    if (manifest.omitted.length) {
      console.log("");
      console.log("  " + c.bold("Omitted (with reason)"));
      for (const o of manifest.omitted)
        console.log(`    ${c.yellow("•")} ${o.category} — ${o.reason}`);
    }
    console.log("");
  } catch (e) {
    console.error(c.red("  ✖ ") + (e as Error).message);
    process.exitCode = 1;
  }
}

function printSupportHelp(): void {
  console.log(`
  ${c.bold(c.cyan("repoos support"))} — redacted, inspectable diagnostics for failed setups

  ${c.bold("USAGE")}
    repoos support bundle [--dry-run] [--json] [--out <path>]
    repoos support inspect <bundle.tar.gz> [--json]

  ${c.bold("NOTES")}
    A bundle never leaves this machine. It excludes source code, prompts, task
    bodies, credentials, environment values and unredacted logs; home and repo
    paths are minimized. Nothing is uploaded automatically.
`);
}

/** `repoos support <subcommand>` */
export async function cmdSupport(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case undefined:
    case "bundle":
    case "create":
      await cmdBundle(rest);
      return;
    case "inspect":
    case "list":
      cmdInspect(rest);
      return;
    case "help":
    case "--help":
    case "-h":
      printSupportHelp();
      return;
    default:
      console.error(c.red(`  Unknown support subcommand: ${sub}`));
      printSupportHelp();
      process.exitCode = 1;
  }
}
