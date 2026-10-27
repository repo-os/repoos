/** Per-test-file temp directory nested under global-reap's run root. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach } from "vitest";

const runRoot = process.env.REPOOS_TEST_TMP_ROOT;
const base = runRoot ?? tmpdir();
const root = mkdtempSync(join(base, runRoot ? "file-" : "repoos-vitest-"));
const previousLocalCheckSlotHome = process.env.REPOOS_LOCAL_CHECK_SLOT_HOME;
process.env.TMPDIR = root;
process.env.TMP = root;
process.env.TEMP = root;
// Production heavy slots are machine-wide under ~/.repoos. Keep that sharing
// semantics in tests, but point each test file at its own isolated host home.
process.env.REPOOS_LOCAL_CHECK_SLOT_HOME = join(root, "local-check-slot-home");

afterEach(() => {
  // Older fixtures created a fresh repo per test, which used to imply a fresh
  // slot root. Preserve that isolation now that every repo shares one host pool.
  const slotHome = process.env.REPOOS_LOCAL_CHECK_SLOT_HOME;
  if (slotHome) rmSync(join(slotHome, "local-check-slots"), { recursive: true, force: true });
});

afterAll(() => {
  if (previousLocalCheckSlotHome === undefined) delete process.env.REPOOS_LOCAL_CHECK_SLOT_HOME;
  else process.env.REPOOS_LOCAL_CHECK_SLOT_HOME = previousLocalCheckSlotHome;
  // The next file in this worker starts from the run root. Global teardown
  // kills pids from any surviving spawns.log, then removes the run root.
  process.env.TMPDIR = base;
  process.env.TMP = base;
  process.env.TEMP = base;
  rmSync(root, { recursive: true, force: true });
});
