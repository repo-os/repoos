/** Re-export from core so server and UI share one mapping (#0595). */
export {
  classifyFailure,
  describeCloseOutFailure,
  extractConflicts,
  stripAnsi,
  type CloseOutFailure,
  type CloseOutFailureKind,
} from "../../../core/close-out-failure.js";
