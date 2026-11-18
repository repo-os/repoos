/** Convert schema array values into the text used by Settings inputs. */
export function arrayFieldValueForForm(key: string, value: unknown): string {
  if (!Array.isArray(value)) return String(value ?? "");
  const items = value.map((item) => {
    if (typeof item === "string") return item;
    if (key === "uiVerification.viewportWidths" && typeof item === "number") return String(item);
    if (item && typeof item === "object" && typeof (item as { host?: unknown }).host === "string") {
      return (item as { host: string }).host;
    }
    return "";
  });
  return items.filter(Boolean).join(", ");
}
