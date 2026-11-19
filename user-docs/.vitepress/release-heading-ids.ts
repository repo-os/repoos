/**
 * Scope the headings of one embedded release note to that release.
 *
 * The changelog page holds many releases, and most repeat the same section
 * headings ("Highlights", "Fixes"). Each heading id is therefore prefixed with
 * the release tag. The heading's own header-anchor link (`href="#highlights"`)
 * must be rewritten with it, or it points at an id that does not exist.
 */
export function scopeHeadingIds(html: string, tag: string): string {
  const prefix = tag.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return html.replace(
    /<h([1-6]) id="([^"]*)"([^>]*)>([\s\S]*?)<\/h\1>/g,
    (_heading, level: string, id: string, attrs: string, inner: string) => {
      const scoped = `${prefix}--${id}`;
      const body = inner.replaceAll(`href="#${id}"`, `href="#${scoped}"`);
      return `<h${level} id="${scoped}"${attrs}>${body}</h${level}>`;
    },
  );
}
