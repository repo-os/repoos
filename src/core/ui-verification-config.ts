/**
 * Config for the UI handoff verification gate (#0680).
 */
import type { RepoOSConfig, UiVerificationConfig } from "./types.js";

export const DEFAULT_UI_VERIFICATION_VIEWPORTS = [1024, 375];

export function resolvedUiVerification(
  config: Pick<RepoOSConfig, "uiVerification">,
): Required<Pick<UiVerificationConfig, "enabled">> & UiVerificationConfig {
  const raw = config.uiVerification ?? {};
  const widths = raw.viewportWidths?.filter((n) => Number.isFinite(n) && n > 0) ?? [];
  return {
    enabled: raw.enabled !== false,
    viewportWidths: widths.length
      ? widths.map((n) => Math.floor(n))
      : DEFAULT_UI_VERIFICATION_VIEWPORTS,
  };
}
