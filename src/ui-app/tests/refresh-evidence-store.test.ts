/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";

const json = async (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

describe("refreshEvidence store (#0766)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reloads shots and verification after a 200 body with ok: false", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.endsWith("/verify")) {
          return json({
            ok: false,
            headIdentity: "abc1234",
            detail: "ui verification failed (1 issue(s)): boom",
            issues: [{ message: "boom" }],
          });
        }
        if (url.endsWith("/shots")) return json({ ok: true, shots: [{ label: "one" }] });
        if (url.includes("/ui-verification")) {
          return json({
            ok: true,
            evidence: { sourceIdentity: "abc1234", issues: [{ message: "boom" }] },
          });
        }
        return json({ ok: true });
      }),
    );

    const result = await repo.refreshEvidence("0766");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ui verification failed");
    expect(calls.some((u) => u.endsWith("/verify"))).toBe(true);
    expect(calls.some((u) => u.endsWith("/shots"))).toBe(true);
    expect(calls.some((u) => u.includes("/ui-verification"))).toBe(true);
    expect(repo.shotsFor("0766")).toEqual([{ label: "one" }]);
    expect(repo.uiVerificationFor("0766")?.sourceIdentity).toBe("abc1234");
  });
});
