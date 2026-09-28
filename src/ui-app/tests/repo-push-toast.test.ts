import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import { useRepoStore } from "../src/stores/repo";

describe("pushToast dedupe", () => {
  it("dedupes identical toasts by default", () => {
    setActivePinia(createPinia());
    const repo = useRepoStore();
    expect(repo.pushToast("Message copied", "success")).not.toBeNull();
    expect(repo.pushToast("Message copied", "success")).toBeNull();
  });

  it("shows every toast when dedupe is disabled", () => {
    setActivePinia(createPinia());
    const repo = useRepoStore();
    expect(repo.pushToast("Message copied", "success", { dedupe: false })).not.toBeNull();
    expect(repo.pushToast("Message copied", "success", { dedupe: false })).not.toBeNull();
    expect(repo.toasts.filter((t) => t.message === "Message copied")).toHaveLength(2);
  });
});
