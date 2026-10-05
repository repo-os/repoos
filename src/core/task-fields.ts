/**
 * Priority and type validation for task writes (#0656).
 *
 * `PRIORITIES` and `TASK_TYPES` (src/core/types.ts) are the single source of
 * truth. Writes through `createTask` / `updateTask` / `patchTaskFile` reject an
 * out-of-set value so a typo like `--priority medium` or `--type improvement`
 * never lands in `work/*.md`; it is never silently coerced to a default, which
 * would hide the mistake.
 *
 * Reads stay permissive on purpose. The repo already carries legacy values
 * (`priority: high`, `type: ux`, …) and `parseTask` must keep loading every
 * existing file — preserving the raw value rather than crashing or rewriting
 * it. Only *new writes* are validated; a legacy value survives until a human
 * deliberately changes it through a command that supplies a valid one.
 */
import { PRIORITIES, TASK_TYPES } from "./types.js";

/** Thrown when a create/update supplies a priority or type outside the valid set. */
export class TaskFieldValidationError extends Error {}

/**
 * Error message for an invalid priority, or null when the value is unset
 * (`undefined`/`null` means "not supplied", never an error) or valid.
 */
export function taskPriorityError(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return (PRIORITIES as readonly unknown[]).includes(value)
    ? null
    : `priority '${String(value)}' is not valid; use one of ${PRIORITIES.join(", ")}`;
}

/** Error message for an invalid type, or null when the value is unset or valid. */
export function taskTypeError(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return (TASK_TYPES as readonly unknown[]).includes(value)
    ? null
    : `type '${String(value)}' is not valid; use one of ${TASK_TYPES.join(", ")}`;
}

/**
 * Reject an invalid priority or type in one shot. Both fields are optional —
 * an unset value is a no-op, so a patch that leaves one alone is never
 * rejected because of the value already on disk.
 */
export function validateTaskFields(fields: { priority?: unknown; type?: unknown }): void {
  const error = taskPriorityError(fields.priority) ?? taskTypeError(fields.type);
  if (error) throw new TaskFieldValidationError(error);
}
