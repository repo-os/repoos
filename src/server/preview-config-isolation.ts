/**
 * Preview-child config writes (#0828): task previews and shot captures run
 * `repoos serve` with REPOOS_PREVIEW_CHILD=1 rooted at a worktree. Settings
 * autosave must not mutate that worktree's tracked repoos.toml — patches are
 * applied to a cache-dir overlay that loadConfig reads back for this process only.
 */
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, type LoadConfigOptions } from "../core/config.js";

const EFFECTIVE_BASENAME = "preview-effective-repoos.toml";

/** True when this server is a task preview / shot-capture child. */
export function isPreviewConfigEphemeral(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REPOOS_PREVIEW_CHILD === "1";
}

/** Overlay path: gitignored cache, never the worktree's repoos.toml. */
export function previewEffectiveTomlPath(cacheDir: string): string {
  return join(cacheDir, EFFECTIVE_BASENAME);
}

/**
 * Lazily clone repoos.toml into the overlay on first mutation so subsequent
 * patchTomlConfig calls preserve comments/formatting like a normal save.
 */
export function ensurePreviewEffectiveToml(root: string, cacheDir: string): string {
  const eff = previewEffectiveTomlPath(cacheDir);
  if (existsSync(eff)) return eff;
  const src = join(root, "repoos.toml");
  if (existsSync(src)) {
    copyFileSync(src, eff);
  } else {
    writeFileSync(eff, "", "utf8");
  }
  return eff;
}

/** Path PATCH/PUT should mutate — overlay in preview, real file otherwise. */
export function configTomlMutationPath(root: string, cacheDir: string): string {
  if (!isPreviewConfigEphemeral()) return join(root, "repoos.toml");
  return ensurePreviewEffectiveToml(root, cacheDir);
}

/** Path to parse after a write (overlay when present in preview). */
export function configTomlReadPath(root: string, cacheDir: string): string {
  if (!isPreviewConfigEphemeral()) return join(root, "repoos.toml");
  const eff = previewEffectiveTomlPath(cacheDir);
  return existsSync(eff) ? eff : join(root, "repoos.toml");
}

/** Reload in-memory config after a curated or raw save. */
export function loadConfigAfterServerWrite(
  root: string,
  cacheDir: string,
): ReturnType<typeof loadConfig> {
  const opts: LoadConfigOptions = {
    tomlPath: configTomlReadPath(root, cacheDir),
  };
  if (isPreviewConfigEphemeral()) opts.previewOverrides = true;
  return loadConfig(root, opts);
}
