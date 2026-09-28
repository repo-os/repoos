import { describe, expect, it } from "vitest";
import {
  answeringQuestionsMatchTask,
  wrapPmMessageWithQuestionContext,
} from "../../core/pm-question-context.js";

describe("wrapPmMessageWithQuestionContext", () => {
  it("wraps the human answer with numbered questions", () => {
    const wrapped = wrapPmMessageWithQuestionContext(
      ["Which API?", "Ship now or later?"],
      "Use REST; ship next week.",
    );
    expect(wrapped).toContain("1. Which API?");
    expect(wrapped).toContain("2. Ship now or later?");
    expect(wrapped).toContain("Human's answer:");
    expect(wrapped).toContain("Use REST; ship next week.");
  });
});

describe("answeringQuestionsMatchTask", () => {
  it("requires an exact match to the task open questions", () => {
    expect(answeringQuestionsMatchTask(["A?"], ["A?"])).toBe(true);
    expect(answeringQuestionsMatchTask(["A?"], ["B?"])).toBe(false);
    expect(answeringQuestionsMatchTask(["A?", "B?"], ["A?"])).toBe(false);
  });
});
