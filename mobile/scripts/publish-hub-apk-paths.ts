import { join } from "node:path";

export function publishHubApkPaths(repoRoot: string) {
  return {
    apk: join(repoRoot, "mobile/app-release.apk"),
    verifier: join(repoRoot, "mobile/scripts/verify-release-apk.ts"),
  };
}
