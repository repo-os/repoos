/**
 * Attachment-storage copy for Settings (#0659). Kept out of the SFC so the
 * "is cloud actually active?" wording is unit-testable: the UI must show the
 * provider the server reports as effective and explain a fallback to local
 * honestly, never implying a cloud provider is in use when it isn't.
 */
import type { ConfigField, StorageStatus } from "../types";

/** One selectable provider, mirroring a `storage.provider` schema option. */
export interface StorageProviderOption {
  value: string;
  label: string;
}

/** Fallback options when the schema has not loaded yet — matches the server. */
export const DEFAULT_STORAGE_PROVIDER_OPTIONS: readonly StorageProviderOption[] = [
  { value: "local", label: "Local filesystem" },
  { value: "neon", label: "Neon Object Storage" },
];

/** Options for the provider select: the schema's when present, else the fallback. */
export function storageProviderOptions(
  field?: Pick<ConfigField, "options">,
): StorageProviderOption[] {
  return field?.options ?? [...DEFAULT_STORAGE_PROVIDER_OPTIONS];
}

function labelFor(options: readonly StorageProviderOption[], id: string): string {
  return options.find((o) => o.value === id)?.label ?? id;
}

/**
 * Short status chip: the provider actually in effect. Uses the server's
 * `effective` id, so a configured-but-unavailable cloud provider reads as
 * "Local filesystem in effect" rather than claiming cloud is active.
 */
export function storageStatusChip(
  status: StorageStatus | null | undefined,
  options: readonly StorageProviderOption[] = DEFAULT_STORAGE_PROVIDER_OPTIONS,
): string {
  const effective = status?.effective ?? "local";
  const label = labelFor(options, effective);
  return effective === "local" ? `${label} in effect` : label;
}

/**
 * One-line explanation under the select, for the *selected* provider:
 * - local: where files live, always accurate and the unchanged default;
 * - cloud available and in effect: states it plainly;
 * - cloud selected but unavailable: a non-alarming reason plus the fallback to
 *   local, echoing the server's `reason` when it reports one.
 */
export function storageExplanation(
  selected: string,
  status: StorageStatus | null | undefined,
  options: readonly StorageProviderOption[] = DEFAULT_STORAGE_PROVIDER_OPTIONS,
): string {
  if (selected === "local") {
    return (
      "Attachments are stored in gitignored .attachments/ folders on this machine — " +
      "work/.attachments/<taskId>/ for tasks and inputs/.attachments/<id>/ for inputs. " +
      "Nothing is committed to git."
    );
  }

  if (status?.available === true && status.effective === selected) {
    return `${labelFor(options, selected)} is configured and in effect. Attachments are stored there.`;
  }

  const reason = status?.reason?.trim();
  if (status?.configured === selected && reason) {
    return `${reason} Local filesystem storage is currently in effect.`;
  }
  return (
    `${labelFor(options, selected)} isn't configured yet. Add credentials to enable it; ` +
    "until then attachments continue to use local storage."
  );
}
