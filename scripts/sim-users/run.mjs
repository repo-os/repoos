#!/usr/bin/env bun
// Simulated first-time users: run AI coding harnesses against RepoOS with a bare
// "build an app with RepoOS" prompt and capture transcripts for triage.
// See scripts/sim-users/README.md.
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  statSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
  createWriteStream,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GLOBAL_INSTRUCTION_FILES, HARNESSES } from "./harnesses.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "prompts", p), "utf8");

function parseArgs(argv) {
  const o = {
    harnesses: Object.keys(HARNESSES),
    apps: null,
    mode: "assigned",
    reps: 1,
    concurrency: 1,
    timeoutMin: 45,
    out: null,
    repoosBin: null,
    gitInit: false,
    dryRun: false,
    smoke: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--harness") o.harnesses = next().split(",");
    else if (a === "--app") o.apps = next().split(",");
    else if (a === "--mode") o.mode = next();
    else if (a === "--reps") o.reps = Number(next());
    else if (a === "--concurrency") o.concurrency = Number(next());
    else if (a === "--timeout-min") o.timeoutMin = Number(next());
    else if (a === "--out") o.out = resolve(next());
    else if (a === "--repoos-bin") o.repoosBin = resolve(next());
    else if (a === "--git-init") o.gitInit = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--smoke") o.smoke = true;
    else throw new Error(`unknown flag ${a}`);
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
const appFiles = readdirSync(join(here, "prompts/apps"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => basename(f, ".md"));
const apps = opts.apps ?? appFiles;
for (const h of opts.harnesses) if (!HARNESSES[h]) throw new Error(`unknown harness ${h}`);
for (const a of apps) if (!appFiles.includes(a)) throw new Error(`unknown app ${a}`);

// Scratch space must be outside any git repo so no parent AGENTS.md/CLAUDE.md is picked up.
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outRoot = opts.out ?? join(homedir(), "repoos-sim-users", stamp);
const toolsDir = join(outRoot, "_tools");

function buildPrompt(app) {
  const idea = read(`apps/${app}.md`).trim();
  const all = appFiles.map((f) => `- ${read(`apps/${f}.md`).trim()}`).join("\n\n");
  const ideas =
    opts.mode === "choose"
      ? read("ideas-choose.md").replace("{{ALL_IDEAS}}", all)
      : read("ideas-assigned.md").replace("{{IDEA}}", idea);
  return read("base.md").replace("{{IDEAS}}", ideas.trim()) + read("friction-log.md");
}

function installRepoos() {
  if (opts.repoosBin) return dirname(opts.repoosBin);
  mkdirSync(toolsDir, { recursive: true });
  writeFileSync(join(toolsDir, "package.json"), "{}\n");
  console.log("installing @repo-os/repoos from npm into", toolsDir);
  const r = spawnSync("bun", ["add", "@repo-os/repoos"], { cwd: toolsDir, stdio: "inherit" });
  if (r.status !== 0) throw new Error("install of @repo-os/repoos failed");
  return join(toolsDir, "node_modules", ".bin");
}

function preflight() {
  const problems = [];
  for (const h of opts.harnesses) {
    const bin = HARNESSES[h].bin;
    if (spawnSync("which", [bin]).status !== 0) problems.push(`${h}: \`${bin}\` not on PATH`);
  }
  const leaks = GLOBAL_INSTRUCTION_FILES.map((f) => f.replace("~", homedir())).filter(
    (f) => existsSync(f) && statSync(f).size > 0,
  );
  if (leaks.length) {
    console.warn(
      "WARNING: global instruction files exist and will leak into the simulated users:\n  " +
        leaks.join("\n  ") +
        "\n  (see README: Contamination)\n",
    );
  }
  if (problems.length) throw new Error(problems.join("\n"));
}

function runOne(job, repoosBinDir) {
  return new Promise((done) => {
    const runDir = join(outRoot, job.id);
    const project = join(runDir, "project");
    mkdirSync(project, { recursive: true });
    if (opts.gitInit) {
      spawnSync("git", ["init", "-q"], { cwd: project });
      spawnSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], { cwd: project });
    }
    const prompt = job.prompt;
    writeFileSync(join(runDir, "prompt.md"), prompt);
    const h = HARNESSES[job.harness];
    const { cmd, args } = h.build(prompt, { model: h.model, cwd: project });
    const env = { ...process.env, PATH: `${repoosBinDir}:${process.env.PATH}` };
    const started = Date.now();
    const transcript = createWriteStream(join(runDir, "transcript.jsonl"));
    const stderr = createWriteStream(join(runDir, "stderr.log"));
    const child = spawn(cmd, args, {
      cwd: project,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(transcript);
    child.stderr.pipe(stderr);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }, job.timeoutMin * 60_000);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      // Kill anything the agent left running (dev servers, repoos serve) in its process group.
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
      const meta = {
        id: job.id,
        harness: job.harness,
        model: h.model,
        app: job.app,
        mode: opts.mode,
        exitCode: code,
        signal,
        timedOut,
        durationSec: Math.round((Date.now() - started) / 1000),
        outcome: collectOutcome(project, runDir, env),
      };
      writeFileSync(join(runDir, "meta.json"), JSON.stringify(meta, null, 2));
      console.log(
        `[${job.id}] done in ${meta.durationSec}s exit=${code}${timedOut ? " TIMEOUT" : ""} ` +
          `tasks=${meta.outcome.taskCount} friction=${meta.outcome.frictionLog}`,
      );
      done(meta);
    });
  });
}

function sh(cmd, args, cwd, env, timeout = 120_000) {
  return spawnSync(cmd, args, { cwd, env, encoding: "utf8", timeout });
}

// Cheap, harness-independent facts about how the run ended. Judging quality is the triage step's job.
function collectOutcome(project, runDir, env) {
  const out = { frictionLog: false, taskCount: 0, gitCommits: 0, repoosCheck: null };
  const log = join(project, "FRICTION-LOG.md");
  if (existsSync(log)) {
    renameSync(log, join(runDir, "FRICTION-LOG.md"));
    out.frictionLog = true;
  }
  const list = sh("repoos", ["list"], project, env, 30_000);
  writeFileSync(join(runDir, "board.txt"), (list.stdout ?? "") + (list.stderr ?? ""));
  out.taskCount = existsSync(join(project, "work"))
    ? readdirSync(join(project, "work")).filter((f) => f.endsWith(".md")).length
    : 0;
  const git = sh("git", ["rev-list", "--count", "HEAD"], project, env, 10_000);
  out.gitCommits = git.status === 0 ? Number(git.stdout.trim()) : 0;
  const check = sh("repoos", ["check"], project, env);
  out.repoosCheck = check.status === 0 ? "pass" : `fail(${check.status})`;
  writeFileSync(join(runDir, "check.txt"), (check.stdout ?? "") + (check.stderr ?? ""));
  return out;
}

async function pool(jobs, n, fn) {
  const queue = [...jobs];
  const workers = Array.from({ length: n }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) await fn(j);
  });
  await Promise.all(workers);
}

async function main() {
  preflight();
  if (opts.smoke) {
    // Verify each harness + model resolves and can answer, with no RepoOS involved.
    for (const h of opts.harnesses) {
      const dir = join(outRoot, "_smoke", h);
      mkdirSync(dir, { recursive: true });
      const { cmd, args } = HARNESSES[h].build(
        "Reply with the single word OK and do nothing else.",
        {
          model: HARNESSES[h].model,
          cwd: dir,
        },
      );
      const r = spawnSync(cmd, args, { cwd: dir, encoding: "utf8", timeout: 180_000 });
      const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      writeFileSync(join(dir, "smoke.log"), text);
      const ok = r.status === 0 && /\bOK\b/.test(text);
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${h} (${HARNESSES[h].model}) exit=${r.status} -> ${join(dir, "smoke.log")}`,
      );
    }
    return;
  }
  const jobs = [];
  for (const harness of opts.harnesses)
    for (const app of apps)
      for (let rep = 1; rep <= opts.reps; rep++)
        jobs.push({
          id: `${harness}__${app}__r${rep}`,
          harness,
          app,
          prompt: buildPrompt(app),
          timeoutMin: opts.timeoutMin,
        });
  if (opts.dryRun) {
    for (const j of jobs) {
      const h = HARNESSES[j.harness];
      const { cmd, args } = h.build("<prompt>", {
        model: h.model,
        cwd: `${outRoot}/${j.id}/project`,
      });
      console.log(`${j.id}\n  ${cmd} ${args.join(" ")}`);
    }
    console.log(`\n--- sample prompt (${jobs[0]?.app}) ---\n${jobs[0]?.prompt}`);
    return;
  }
  mkdirSync(outRoot, { recursive: true });
  const bin = installRepoos();
  console.log(`${jobs.length} runs -> ${outRoot}`);
  await pool(jobs, opts.concurrency, (j) => runOne(j, bin));
  console.log(`\nAll runs finished. Triage with: bun scripts/sim-users/triage.mjs ${outRoot}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
