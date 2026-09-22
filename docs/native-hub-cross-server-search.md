# Native Hub cross-server task search

The macOS Hub command palette can query **opt-in servers directly** for matching
tasks. This is not a central index, a WebView scrape, or a cookie bridge.

## Privacy and security model

- **Opt-in per server** — `crossServerTaskSearchEnabled` on the Hub registry
  entry must be turned on in that server's attention settings sheet.
- **Explicit API** — each query is a `GET` to that server's
  `/api/hub/v1/tasks/search` with the same Keychain-stored Hub bearer token used
  for summaries. The Hub never reads the WebView DOM or `repoos_session`.
- **No cross-server data mixing** — the Mac merges results locally for display
  only. Server A never sees Server B's query or results.
- **Bounded payload** — responses include task id, title, status, `updatedAt`,
  and a `routePath` deep link (`/work?task=<id>`). Task bodies, activity, and
  attachments are not returned.
- **Scoped capabilities** — search requires the `search:read` scope on the Hub
  token. Newly issued capabilities include `summary:read search:read`. Older
  summary-only tokens keep working for badges but receive `401` on search until
  rotated.
- **Independent failures** — offline, unauthorized, or rate-limited servers
  surface their own status line in the palette footer; other servers still
  return results.

## Server contract

```http
GET /api/hub/v1/tasks/search?q=privacy&limit=8
Authorization: Bearer roh_…
```

Successful responses:

```json
{
  "apiVersion": "v1",
  "generatedAt": "2026-09-22T00:00:00.000Z",
  "query": "privacy",
  "results": [
    {
      "id": "0476",
      "title": "Add privacy-preserving cross-server task search",
      "status": "active",
      "updatedAt": "2026-09-22T02:07:22Z",
      "routePath": "/work?task=0476"
    }
  ]
}
```

Queries must be 2–80 characters. Results are capped at eight per server. The
endpoint is rate-limited separately from `/api/hub/v1/summary`.

## Hub client behavior

- Palette input is **debounced** (~350ms) and **cancellable** when the palette
  closes or the query shortens below two characters.
- Selecting a hit switches to that server and navigates to the returned
  `routePath` through the normal `HubNavigationRequest` path.
- Freshness in subtitles compares the server's `generatedAt` to the local clock
  (fresh ≤ 90s, otherwise stale).

See also [Native Hub capabilities](native-hub-capabilities.md) and
[macOS Hub navigation](macos-hub-navigation-retention.md).
