import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

export interface ProjectEnvironmentSource {
  id: string;
  path: string;
  examplePath?: string;
}
export interface ProjectEnvironment {
  id: string;
  sources: ProjectEnvironmentSource[];
}
export interface ProjectEnvironmentRegistry {
  environments: ProjectEnvironment[];
}
export interface EnvironmentFileSnapshot {
  source: string;
  keys: string[];
  expectedKeys: string[];
  sha256: string;
}

const identifier = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const keyName = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateEnvironmentRegistry(value: unknown): ProjectEnvironmentRegistry {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as ProjectEnvironmentRegistry).environments)
  ) {
    throw new Error("Environment registry must contain an environments array");
  }
  const environments = (value as ProjectEnvironmentRegistry).environments;
  const envIds = new Set<string>();
  for (const env of environments) {
    if (!env || !identifier.test(env.id) || envIds.has(env.id))
      throw new Error("Invalid or duplicate environment identifier");
    envIds.add(env.id);
    if (!Array.isArray(env.sources) || !env.sources.length)
      throw new Error(`Environment ${env.id} must map at least one source`);
    const sourceIds = new Set<string>();
    for (const source of env.sources) {
      if (!source || !identifier.test(source.id) || sourceIds.has(source.id))
        throw new Error(`Invalid or duplicate source identifier in ${env.id}`);
      sourceIds.add(source.id);
      validateRelativeSource(source.path);
      if (source.examplePath) validateRelativeSource(source.examplePath);
    }
  }
  return value as ProjectEnvironmentRegistry;
}

function validateRelativeSource(path: string): void {
  if (
    typeof path !== "string" ||
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Environment source must be a safe repository-relative path");
  }
}

function resolveRepoPath(root: string, relative: string): string {
  validateRelativeSource(relative);
  const base = resolve(root);
  const destination = resolve(base, relative);
  if (!destination.startsWith(base + sep))
    throw new Error("Environment source escapes project root");
  let current = base;
  for (const part of relative.split("/")) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      throw new Error("Environment source path contains a symlink");
  }
  return destination;
}

function resolveWritablePath(root: string, relative: string): string {
  const destination = resolveRepoPath(root, relative);
  const base = resolve(root);
  try {
    const tracked = execFileSync(
      "git",
      ["-C", base, "ls-files", "--error-unmatch", "--", relative],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    void tracked;
    throw new Error("Tracked environment destinations are not allowed");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Tracked environment destinations are not allowed"
    )
      throw error;
  }
  try {
    execFileSync("git", ["-C", base, "check-ignore", "-q", "--", relative], { stdio: "ignore" });
  } catch {
    throw new Error("Environment destination must be gitignored");
  }
  return destination;
}

function parseDocument(text: string): { keys: Map<string, string>; lines: string[] } {
  const values = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) throw new Error("Unsupported dotenv syntax; use one KEY=value assignment per line");
    const [, key, raw] = match;
    if (values.has(key)) throw new Error(`Duplicate dotenv key: ${key}`);
    if (/^(export\s)|\$\{|`/.test(trimmed) || /[\r\n]/.test(raw))
      throw new Error("Unsupported dotenv syntax");
    let value = raw;
    if (raw.startsWith('"')) {
      if (!raw.endsWith('"') || raw.length < 2)
        throw new Error(`Unterminated quoted value for ${key}`);
      value = raw.slice(1, -1).replace(/\\(["\\])/g, "$1");
      if (value.includes("\n") || value.includes("\r"))
        throw new Error("Multiline dotenv values are not supported");
    } else if (raw.startsWith("'")) {
      if (!raw.endsWith("'") || raw.length < 2)
        throw new Error(`Unterminated quoted value for ${key}`);
      value = raw.slice(1, -1);
    } else if (/[#'"\s]/.test(raw)) {
      throw new Error(`Quote dotenv value for ${key} when it contains spaces, quotes, or #`);
    }
    values.set(key, value);
  }
  return { keys: values, lines };
}

export function readProjectEnvironment(
  root: string,
  env: ProjectEnvironment,
): EnvironmentFileSnapshot {
  validateEnvironmentRegistry({ environments: [env] });
  const merged = new Map<string, string>();
  const expected = new Set<string>();
  for (const source of env.sources) {
    const path = resolveRepoPath(root, source.path);
    if (existsSync(path))
      for (const [key, value] of parseDocument(readFileSync(path, "utf8")).keys)
        merged.set(key, value);
    if (source.examplePath) {
      const examplePath = resolveRepoPath(root, source.examplePath);
      if (existsSync(examplePath))
        for (const key of parseDocument(readFileSync(examplePath, "utf8")).keys.keys())
          expected.add(key);
    }
  }
  const last = env.sources[env.sources.length - 1];
  const file = resolveRepoPath(root, last.path);
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  return {
    source: env.sources.map((s) => s.path).join(", "),
    keys: [...merged.keys()],
    expectedKeys: [...expected],
    sha256: createHash("sha256").update(text).digest("hex"),
  };
}

function encodeValue(value: string): string {
  if (value.includes("\n") || value.includes("\r"))
    throw new Error("Multiline dotenv values are not supported");
  if (!/[\s#'"=]/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function writeProjectEnvironmentValue(
  root: string,
  sourcePath: string,
  key: string,
  value: string | null,
  expectedSha256: string,
): string {
  if (!keyName.test(key)) throw new Error("Invalid environment key name");
  const file = resolveWritablePath(root, sourcePath);
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  const currentHash = createHash("sha256").update(current).digest("hex");
  if (currentHash !== expectedSha256)
    throw new Error("Environment source changed since it was read; reload before writing");
  const { lines } = parseDocument(current);
  const next: string[] = [];
  let replaced = false;
  for (const line of lines) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match?.[1] === key) {
      if (value !== null) next.push(`${key}=${encodeValue(value)}`);
      replaced = true;
    } else next.push(line);
  }
  if (!replaced && value !== null) next.push(`${key}=${encodeValue(value)}`);
  const output = next.join("\n").replace(/\n*$/, "\n");
  const temporary = join(dirname(file), `.${key}.${randomUUID()}.tmp`);
  writeFileSync(temporary, output, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(temporary, 0o600);
  renameSync(temporary, file);
  return createHash("sha256").update(output).digest("hex");
}
