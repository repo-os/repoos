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
  formatValidateFailedReapCaptureMarker,
  formatValidateReapedCaptureMarker,
  newlySeenValidateFailedReapCaptures,
  finishedCaptureCollectionCommand,
  killContainerCommand,
  reaperCommand,
  recordValidateStartupReapedCaptures,
  remoteEventsPath,
  runValidationContainerReaper,
} from "../remote-validation.js";

it.each([
  { code: 0, output: "removed", expected: 0 },
  {
    code: 1,
    output: "Error response from daemon: No such container: repoos-validate-test",
    expected: 0,
  },
  { code: 1, output: "permission denied", expected: 1 },
])("propagates the actual Docker removal result: $output", ({ code, output, expected }) => {
  const root = mkdtempSync(join(tmpdir(), "capture-kill-"));
  try {
    writeFileSync(
      join(root, "docker"),
      `#!/bin/sh\nprintf '%s\\n' "$DOCKER_OUTPUT" >&2\nexit "$DOCKER_CODE"\n`,
    );
    chmodSync(join(root, "docker"), 0o755);
    const result = spawnSync("sh", ["-c", killContainerCommand("repoos-validate-test")], {
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH}`,
        DOCKER_OUTPUT: output,
        DOCKER_CODE: String(code),
      },
    });
    expect(result.status).toBe(expected);
    if (expected) expect(result.stderr.toString()).toContain(output);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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

it("parses task ids from repoos-validate-<taskId>-<suffix> container names", async () => {
  const { parseTaskIdFromValidateContainerName } = await import("../remote-validation.js");
  expect(parseTaskIdFromValidateContainerName("repoos-validate-1060-deadbeef")).toBe("1060");
  expect(parseTaskIdFromValidateContainerName("/repoos-validate-0999-abc")).toBe("0999");
  expect(parseTaskIdFromValidateContainerName("repoos-validate-pre-review-abc")).toBeUndefined();
});

it("reaps a completed capture even when the Mac still tracks it as live", async () => {
  const oldCreated = new Date(Date.now() - 3 * 60_000).toISOString();
  const containerId = "0123456789ab";
  const containerName = "repoos-validate-1060-deadbeef";
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
  const root = mkdtempSync(join(tmpdir(), "capture-periodic-reap-"));
  try {
    const logger = { system: vi.fn() };
    await runValidationContainerReaper({ runRemote } as never, { ip: "100.0.0.1" } as never, {
      liveContainerNames: new Set([containerName]),
      logger: logger as never,
      hostLabel: "runner",
      root,
    });
    expect(runRemote).toHaveBeenCalledWith(
      expect.anything(),
      completedCaptureReaperCommand(containerId),
      expect.anything(),
      30_000,
    );
    expect(logger.system).toHaveBeenCalledWith(
      "info",
      expect.stringContaining(
        `reaped completed browser capture ${containerName} on runner: ${COMPLETED_CAPTURE_REAPER_IDLE_DETAIL}`,
      ),
    );
    expect(logger.system).toHaveBeenCalledWith(
      "info",
      expect.stringContaining("reason=completed-capture-idle"),
    );
    expect(existsSync(remoteEventsPath(root, "1060"))).toBe(true);
    const events = readFileSync(remoteEventsPath(root, "1060"), "utf8");
    expect(events).toContain(containerName);
    expect(events).toContain("reason=completed-capture-idle");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
    expect(readFileSync(remoteEventsPath(root, "1048"), "utf8")).toContain("repoos-validate-hung");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("parses validate.sh startup reaper failure markers with the removal reason", () => {
  const marker = formatValidateFailedReapCaptureMarker(
    "repoos-validate-hung",
    "1048",
    "Cannot kill container",
  );
  const seen = new Set<string>();
  expect(newlySeenValidateFailedReapCaptures(`${marker}\n`, seen)).toEqual([
    {
      line: marker,
      containerName: "repoos-validate-hung",
      taskId: "1048",
      reason: "Cannot kill container",
    },
  ]);
});

it("records failed validate.sh startup reaper markers separately", () => {
  const root = mkdtempSync(join(tmpdir(), "capture-startup-reap-fail-"));
  try {
    const seen = new Set<string>();
    const marker = formatValidateFailedReapCaptureMarker("repoos-validate-hung", "1048");
    const logger = { system: vi.fn() };
    recordValidateStartupReapedCaptures(root, `${marker}\n`, seen, {
      host: "100.0.0.2",
      logger: logger as never,
    });
    expect(logger.system).toHaveBeenCalledWith(
      "warn",
      "failed to reap completed browser capture repoos-validate-hung on 100.0.0.2: exit-1",
    );
    expect(existsSync(remoteEventsPath(root, "1048"))).toBe(true);
    expect(readFileSync(remoteEventsPath(root, "1048"), "utf8")).toContain("failed to reap");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
