/**
 * The one-time report-layout migration (#1013): pre-existing engineering rounds
 * move from `work/engineering-reports/<id>/` to the shared
 * `work/reports/<id>/`, where the review passes live. Idempotent, best-effort,
 * and committed on main by the boot pass so no feature branch has to carry
 * another task's report files.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types.js";
import {
  clearReportLayoutMigrationPending,
  migrateLegacyReportLayout,
  readReportLayoutMigrationPending,
  reportLayoutMigrationPendingPath,
  runReportLayoutMigrationPass,
} from "../../server/report-layout-migration.js";

const config = (root: string): RepoOSConfig =>
  ({ root, workDir: "work", cacheDir: ".repoos" }) as RepoOSConfig;

function writeLegacy(root: string, taskId: string, name: string, content: string): string {
  const dir = join(root, "work", "engineering-reports", taskId);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, content);
  return file;
}

describe("migrateLegacyReportLayout (#1013)", () => {
  it("moves legacy rounds into the shared reports directory and removes empty dirs", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-report-layout-"));
    try {
      writeLegacy(root, "0997", "round-1.json", '{"round":1}\n');
      writeLegacy(root, "0997", "round-2.json", '{"round":2}\n');

      const result = migrateLegacyReportLayout(config(root));

      expect(result.scanned).toBe(2);
      expect(result.moved.sort()).toEqual([
        "work/reports/0997/round-1.json",
        "work/reports/0997/round-2.json",
      ]);
      expect(result.removed).toEqual([]);
      expect(readFileSync(join(root, "work", "reports", "0997", "round-1.json"), "utf8")).toBe(
        '{"round":1}\n',
      );
      expect(existsSync(join(root, "work", "engineering-reports"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("drops an identical legacy copy and keeps a differing one", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-report-layout-"));
    try {
      // The canonical copy already exists for round 1 and matches.
      mkdirSync(join(root, "work", "reports", "0997"), { recursive: true });
      writeFileSync(join(root, "work", "reports", "0997", "round-1.json"), '{"round":1}\n');
      writeFileSync(join(root, "work", "reports", "0997", "round-2.json"), '{"round":2,"new":1}\n');
      writeLegacy(root, "0997", "round-1.json", '{"round":1}\n');
      writeLegacy(root, "0997", "round-2.json", '{"round":2}\n');

      const result = migrateLegacyReportLayout(config(root));

      expect(result.moved).toEqual([]);
      expect(result.removed).toEqual(["work/engineering-reports/0997/round-1.json"]);
      // The differing round stays readable in its legacy home; nothing is lost.
      expect(
        readFileSync(join(root, "work", "engineering-reports", "0997", "round-2.json"), "utf8"),
      ).toBe('{"round":2}\n');
      expect(readFileSync(join(root, "work", "reports", "0997", "round-2.json"), "utf8")).toBe(
        '{"round":2,"new":1}\n',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is a no-op when the legacy directory is absent, and on a second run", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-report-layout-"));
    try {
      expect(migrateLegacyReportLayout(config(root))).toEqual({
        moved: [],
        removed: [],
        absPaths: [],
        scanned: 0,
      });

      writeLegacy(root, "T1", "round-1.json", '{"round":1}\n');
      migrateLegacyReportLayout(config(root));
      expect(migrateLegacyReportLayout(config(root))).toEqual({
        moved: [],
        removed: [],
        absPaths: [],
        scanned: 0,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("runReportLayoutMigrationPass (#1013)", () => {
  it("commits the move once and clears the pending marker", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-report-layout-pass-"));
    try {
      writeLegacy(root, "T1", "round-1.json", '{"round":1}\n');
      const committed: string[][] = [];

      const outcome = runReportLayoutMigrationPass(config(root), (absPaths) => {
        committed.push(absPaths);
        return true;
      });

      expect(outcome).toMatchObject({ moved: 1, removed: 0, attempted: true, committed: true });
      expect(committed).toHaveLength(1);
      expect(committed[0]!.map((p) => p.split("\\").join("/"))).toEqual(
        expect.arrayContaining([
          join(root, "work", "reports", "T1", "round-1.json").split("\\").join("/"),
          join(root, "work", "engineering-reports", "T1", "round-1.json").split("\\").join("/"),
        ]),
      );
      expect(existsSync(reportLayoutMigrationPendingPath(config(root)))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records the changed paths and retries them on the next pass after a failed commit", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-report-layout-pass-"));
    try {
      writeLegacy(root, "T1", "round-1.json", '{"round":1}\n');

      const failed = runReportLayoutMigrationPass(config(root), () => false);

      expect(failed).toMatchObject({ moved: 1, attempted: true, committed: false });
      const pending = readReportLayoutMigrationPending(config(root));
      expect(pending).toEqual(
        expect.arrayContaining([
          "work/reports/T1/round-1.json",
          "work/engineering-reports/T1/round-1.json",
        ]),
      );

      const retriedPaths: string[][] = [];
      const retried = runReportLayoutMigrationPass(config(root), (absPaths) => {
        retriedPaths.push(absPaths);
        return true;
      });

      expect(retried).toMatchObject({ moved: 0, attempted: true, retried: true, committed: true });
      expect(retriedPaths).toHaveLength(1);
      expect(existsSync(reportLayoutMigrationPendingPath(config(root)))).toBe(false);
    } finally {
      clearReportLayoutMigrationPending(config(root));
      rmSync(root, { recursive: true, force: true });
    }
  });
});
