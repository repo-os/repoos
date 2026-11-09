import type { PipelineStage } from "../../../core/pipeline-view.js";
import type { SharedTaskCardStatus } from "./task-card-status.js";

export type CardActivityMotion = "coding" | "reviewing" | "agent";

export interface CardActivityIndicatorProps {
  variant?: "working" | "reviewing";
  activity?: CardActivityMotion;
  label: string;
}

/** When the board or pipeline card should show a live activity indicator (not the plain dot). */
export function resolveCardActivityIndicator(input: {
  shared: SharedTaskCardStatus | null;
  stage: PipelineStage | null;
  reviewRunning: boolean;
  closeoutActive: boolean;
  chipText: string | null;
  showCheckBar: boolean;
}): CardActivityIndicatorProps | null {
  if (input.chipText || input.showCheckBar) return null;

  if (input.shared) {
    if (input.shared.stuck || !input.shared.inFlight) return null;
    if (
      input.shared.kind === "queued" ||
      input.shared.kind === "needs-input" ||
      input.shared.kind === "paused"
    ) {
      return null;
    }
    if (input.shared.kind === "pm-working") {
      return { activity: "agent", label: input.shared.label };
    }
    if (input.shared.kind === "checks") {
      return { variant: "reviewing", label: input.shared.label };
    }
    return { label: input.shared.label };
  }

  if (input.stage === "review" && input.reviewRunning) {
    return { variant: "reviewing", label: "Reviewing…" };
  }
  if (input.stage === "closeout" && input.closeoutActive) {
    return { label: "Integrating…" };
  }

  return null;
}
