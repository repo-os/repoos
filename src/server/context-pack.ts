import type { BootstrapResult } from "../core/bootstrap.js";
import { generateContextPack, resumePreamble, type ContextPack } from "../core/context-pack.js";
import type { RepoOSConfig, Task } from "../core/types.js";
import { getGitWorker } from "./git-worker.js";

export async function generateServerContext(
  config: RepoOSConfig,
  task: Task,
  branch: string,
  cwd: string,
  bootstrapResult: BootstrapResult | null,
): Promise<{ pack: ContextPack; resumePreamble: string }> {
  const gitFacts = await getGitWorker(config.root).contextPackFacts(config.root, cwd);
  return {
    pack: generateContextPack(config, task, branch, cwd, bootstrapResult, gitFacts),
    resumePreamble: resumePreamble(config, task, branch, cwd, gitFacts),
  };
}

export async function serverResumePreamble(
  config: RepoOSConfig,
  task: Task,
  branch: string,
  cwd: string,
): Promise<string> {
  const gitFacts = await getGitWorker(config.root).contextPackFacts(config.root, cwd);
  return resumePreamble(config, task, branch, cwd, gitFacts);
}
