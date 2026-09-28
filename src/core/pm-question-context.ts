/**
 * Wrap a human PM reply so the agent sees which open task questions were being answered.
 */
export function wrapPmMessageWithQuestionContext(questions: string[], answer: string): string {
  const trimmedAnswer = answer.trim();
  const numbered = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  return [
    "The human is answering the following open questions on this task:",
    "",
    numbered,
    "",
    "Human's answer:",
    trimmedAnswer,
  ].join("\n");
}

/** Client-supplied questions must match the task's current open list exactly. */
export function answeringQuestionsMatchTask(
  answeringQuestions: string[],
  taskQuestions: string[] | undefined,
): boolean {
  const open = taskQuestions ?? [];
  return (
    answeringQuestions.length === open.length && answeringQuestions.every((q, i) => q === open[i])
  );
}
