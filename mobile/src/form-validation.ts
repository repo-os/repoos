export function errorAfterServerUrlInput(error: string, url: string): string {
  return url.trim() ? "" : error;
}
