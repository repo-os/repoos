import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it, vi } from "vitest";
import {
  COMPLETED_CAPTURE_REAPER_IDLE_DETAIL,
  completedCaptureReaperCommand,
  formatValidateReapedCaptureMarker,
  finishedCaptureCollectionCommand,
  reaperCommand,
  recordValidateStartupReapedCaptures,
  remoteEventsPath,
  runValidationContainerReaper,
} from "../remote-validation.js";

it("removes only the run's container when its result is present", () => {
  const root = mkdtempSync(join(tmpdir(), "capture-collect-"));
  try {
    const bin = join(root, "bin");
    const artifacts = join(root, "artifacts");
    mkdirSync(bin);
    mkdirSync(join(artifacts, "browser-capture"), { recursive: true });
    const calls = join(root, "calls");
    writeFileSync(join(bin, "docker"), `#!/bin/sh\necho "$*" >> "$CALLS"\n`);
    chmodSync(join(bin, "docker"), 0o755);
    const command = finishedCaptureCollectionCommand(
      { bundle: "unused", artifacts },
      "repoos-validate-test",
    );
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CALLS: calls };
    expect(spawnSync("bash", ["-c", command], { env }).status).not.toBe(0);
    writeFileSync(join(artifacts, "browser-capture", "result.json"), '{"ok":true}');
    expect(spawnSync("bash", ["-c", command], { env }).status).toBe(0);
    expect(readFileSync(calls, "utf8")).toContain("rm -f repoos-validate-test");
    expect(readFileSync(join(artifacts, "browser-capture", "result.json"), "utf8")).toBe(
      '{"ok":true}',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.each([
  { recent: "", cpu: "0.3%", removed: true },
  { recent: "still working", cpu: "0.3%", removed: false },
  { recent: "", cpu: "15.0%", removed: false },
])(
  "reaps completed capture only when quiet and idle: $recent $cpu",
  async ({ recent, cpu, removed }) => {
    const { completedCaptureReaperCommand } = await import("../remote-validation.js");
    const root = mkdtempSync(join(tmpdir(), "capture-reaper-"));
    try {
      const calls = join(root, "calls");
      writeFileSync(
        join(root, "docker"),
        `#!/bin/sh
case "$1 $2" in
  'inspect -f') case "$3" in *Name*) echo /repoos-validate-123;; *) echo REPOOS_BROWSER_CAPTURE_MODE=shots;; esac;;
  'logs --since') printf "%s" "$RECENT";;
  'logs '*) echo '[browser-capture] runner browser capture completed';;
  'stats --no-stream') echo "$CPU";;
  'rm -f') echo removed >> "$CALLS";;
esac
`,
      );
      chmodSync(join(root, "docker"), 0o755);
      const result = spawnSync("bash", ["-c", completedCaptureReaperCommand("abcdefabcdef")], {
        env: {
          ...process.env,
          PATH: `${root}:${process.env.PATH}`,
          CALLS: calls,
          RECENT: recent,
          CPU: cpu,
        },
      });
      expect(result.status === 0, result.stderr.toString()).toBe(removed);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it("reaps a completed capture even when the Mac still tracks it as live", async () => {
  const oldCreated = new Date(Date.now() - 3 * 60_000).toISOString();
  const containerId = "0123456789ab";
  const containerName = "repoos-validate-hung";
  const runRemote = vi.fn(async (_host, cmd) => {
    if (cmd === reaperCommand()) {
      return {
        code: 0,
        output: `${containerId}\t/${containerName}\t${oldCreated}`,
        timedOut: false,
      };
    }
    if (cmd === completedCaptureReaperCommand(containerId)) {
      return { code: 0, output: "", timedOut: false };
    }
    return { code: 1, output: "", timedOut: false };
  });
  const logger = { system: vi.fn() };
  await runValidationContainerReaper({ runRemote } as never, { ip: "100.0.0.1" } as never, {
    liveContainerNames: new Set([containerName]),
    logger: logger as never,
    hostLabel: "runner",
  });
  expect(runRemote).toHaveBeenCalledWith(
    expect.anything(),
    completedCaptureReaperCommand(containerId),
    expect.anything(),
    30_000,
  );
  expect(logger.system).toHaveBeenCalledWith(
    "info",
    `reaped completed browser capture ${containerName} on runner: ${COMPLETED_CAPTURE_REAPER_IDLE_DETAIL}`,
  );
});

it("records validate.sh startup reaper markers on the capture task", () => {
  const root = mkdtempSync(join(tmpdir(), "capture-startup-reap-"));
  try {
    const seen = new Set<string>();
    const marker = formatValidateReapedCaptureMarker("repoos-validate-hung", "1048");
    const logger = { system: vi.fn() };
    recordValidateStartupReapedCaptures(root, `${marker}\n`, seen, {
      host: "100.0.0.2",
      logger: logger as never,
    });
    expect(logger.system).toHaveBeenCalledWith(
      "info",
      `reaped completed browser capture repoos-validate-hung on 100.0.0.2: ${COMPLETED_CAPTURE_REAPER_IDLE_DETAIL}`,
    );
    expect(existsSync(remoteEventsPath(root, "1048"))).toBe(true);
    expect(readFileSync(remoteEventsPath(root, "1048"), "utf8")).toContain(
      "repoos-validate-hung",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
