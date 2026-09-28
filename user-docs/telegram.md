# Telegram

Telegram connects a bot to an existing RepoOS repository. It is a second way
for allowlisted users to reach RepoOS; it does not create new RepoOS accounts
or grant access based on group membership.

Bot credentials must be stored through RepoOS's authenticated secret store. Set
`REPOOS_SECRET_STORE_KEY` in the server process environment to a 32-byte key
encoded as 64 hexadecimal characters or base64. RepoOS refuses to encrypt or
decrypt secrets when the key is absent or invalid; it never stores them in
plaintext. Keep the key outside `repoos.toml` and out of task worktrees. Losing
the key makes existing encrypted credentials unrecoverable; changing it
requires rewrapping existing records with the old key still available.
Repositories that set `worktrees.inheritEnv = true` expose this key to their
task worktrees along with the rest of `.env`; use `false` when worktree agents
must not be able to decrypt repository credentials.

### The `telegram.enabled` master switch

`[telegram] enabled` (Settings → **Telegram bot**) gates every active
Telegram surface; Settings flips it live — no restart needed. While it is
off, connection-management calls that arm or change the integration are
refused ("the Telegram integration is disabled"), and any polling loop that
already exists goes quiet: it makes no Telegram calls and resumes on its own
when the switch returns. Two safe-direction calls stay available while off —
`transport {mode: "off"}` and `disconnect` — so stopping delivery or
forgetting the credential never requires re-enabling anything. A stored
connection and its encrypted credential are untouched by the switch, so
re-enabling restores the previous transport state.

## Connect a repository

An administrator connects Telegram from that repository's RepoOS Settings.
The connection flow provisions or configures the repository's project bot.
The bot can only send repository notifications to chats that an authenticated
RepoOS admin explicitly binds. Adding the bot to a group by itself does not
authorize that chat or give its members access.

### Bring Your Own Bot Token

You can connect without any hosted service. Create a project bot for your
repository with [@BotFather](https://t.me/BotFather), copy its token, and send
it to your RepoOS instance once, server-side, over the admin API
(`POST /api/telegram/connect`; the Settings connection panel builds on the
same routes). RepoOS validates the bot identity with Telegram, stores the
token encrypted at rest, and returns the bot's non-secret identity. The token
is never echoed back — not to the browser, not into logs, `.env`,
`repoos.toml`, or a support bundle — and it is not readable through the API
after it is stored. Disconnect first removes and confirms the webhook. For a
BYO bot, Telegram does not provide a Bot API method to revoke its token: when
prompted, revoke it in @BotFather and retry disconnect. RepoOS confirms
revocation by checking that the old token returns 401, then removes the
encrypted credential and this instance's user links and chat bindings. A
failed step is reported as incomplete and leaves the credential and bindings
available for a retry; webhook-removal progress is retained safely.

The same connection procedure registers the bot's supported profile with
Telegram: its command list (starting with `/help`), and name/description text
that mentions the repository. Command *behavior* beyond authorization and
account binding ships with later intake tasks; unauthorized senders get
silence, by design.

### Update transport

RepoOS can receive updates two ways, and switching between them requires no
code change above the adapter:

- **Long polling** — the instance pulls updates from Telegram at run time.
  Works anywhere, including machines with no public inbound network, and is
  the recommended default. A connection starts with the transport **off** —
  the bot receives nothing until you switch polling (or webhook) on; the
  choice persists and is re-applied automatically when the server restarts.
- **Webhook** — Telegram POSTs updates to your instance's `webhookUrl`. The
  public Bot API accepts HTTPS URLs on ports 443, 80, 88, and 8443 only; a
  Cloudflare Tunnel in front of your instance satisfies this. Telegram validates
  each delivery with a secret token RepoOS generates and stores encrypted.

Incoming updates are normalized identically under both transports and
delivered to the intake/authorization pipeline. The intake handler
(`src/server/telegram/intake.ts`) resolves each sender against the allowlist
on every message, rate-limits per user and per chat (in-memory, per-process),
audits privileged intake, and silently drops unauthorized traffic per ADR 0007.
Later tasks register work on the authorized callback; until then nothing
replies on the bot's behalf beyond binding via `/start`.

### The bot's Telegram settings are the operator's to set

Telegram's Bot API cannot change several bot profile settings; the operations
below can only be done in BotFather, and RepoOS deliberately neither performs
nor claims them:

- **Group privacy mode** — BotFather-only. Keep it **on** (the default!): your
  bot then receives exactly the messages it needs — commands addressed to it,
  replies, and all private chats — and does not read bystanders' group
  messages. The API offers no toggling method; `getMe` only reports the current
  state (`can_read_all_group_messages`), which the connection status shows.
  Changing privacy mode in BotFather requires re-adding the bot to groups.
- **Profile photo** — upload it in BotFather; the Bot API method here accepts
  file uploads, which the connection flow does not perform.
- **Inline mode** — leave off unless a later task opts in.

## Bind a chat

Notifications and commands only flow through chats an administrator explicitly
binds. Adding the bot to a group — or opening a private chat — does **not**
bind that chat.

An administrator binds chats through the authenticated admin API (a Settings
panel for chat management ships in a later task):

- `POST /api/auth/telegram/chats/bind-codes` — create a short-lived bind code.
  An **allowlisted admin** who is also linked on Telegram runs `/bind <code>` in
  the target group or chat; only that live admin role can redeem the code.
- `POST /api/auth/telegram/chats` — bind a chat directly by `telegram_chat_id`
  when the id is already known (`chatType` is required for group/channel ids).

When a user completes account linking in a private chat (`/start <invite>`),
that 1:1 chat is bound automatically as a side effect of their own link.

## Chat with the repository guide (Ross)

Once your Telegram account is linked and the chat is bound, send any plain
message to the bot: in a private chat, or in a bound group by @-mentioning the
bot or replying to one of its messages. The message becomes a question for
**Ross**, the repository guide — the same agent the board UI's guide chat
uses — and the answer comes back to the chat you asked in. Ross is read-only:
it answers questions about the repository, tasks, and docs; it cannot edit
files or change task status.

- **Your conversation is yours.** State is kept per Telegram user, not per
  chat: two members of the same group never share a transcript. Your context
  follows you between the private chat and a group you both use.
- **Conversations expire.** After 24 hours of inactivity a conversation ends;
  your next message starts a fresh one and the bot tells you it did. Send
  `/new` to start a fresh conversation yourself at any time.
- **Pace yourself.** Telegram agent turns are metered per user and per chat
  (a small number per minute). When the limit applies you get a clear
  "too many questions per minute" message instead of silence, and no turn is
  started until you try again.
- Every turn books its tokens and cost to the guide role on the board's AI
  usage panel, so Telegram-driven spend is visible like every other AI role.
## Link your account

An administrator creates a Telegram link from **Settings → Authentication &
Users** for an email already on the repository's allowlist. Open the resulting
bot start payload (or `https://t.me/<projectBot>?start=<payload>` when the
project bot username is known) in Telegram to bind your Telegram account to
that email. Your Telegram numeric user ID is the identity key; your Telegram
username is only a display hint and does not prove who you are.

The link uses your current RepoOS role. RepoOS checks the role from the
allowlist on each message, so an admin changing your role or removing your
email takes effect on your next Telegram message. Removing you from a Telegram
group does not change your RepoOS account, and being in a bound group does not
grant one.

Unknown, unlinked, or no-longer-allowlisted senders receive no reply in any
chat. This avoids confirming the bot is active and flooding groups with access
errors.

### Verify the connection

The Settings connection panel (**Settings → Notifications → Telegram**) shows
whether a bot is connected — its display name, username, and transport — and
lists the private chats currently bound (one per linked Telegram account),
with a **Send test message** control for each so an admin can confirm
delivery before relying on the integration for real notifications: any
failure (blocked bot, chat left, rate limit) surfaces Telegram's own error
text instead of a generic "failed." Unbinding a chat from this panel and from
**Settings → Authentication & Users** are the same action against the same
underlying links — either one immediately reflects on both.

## Managed provisioning (the official service)

Managed provisioning lets RepoOS create and hand over a project bot without
touching BotFather. The local instance only ever asks the provisioning service
to *begin* a request, *observe* its state, and *redeem* the new bot's
credential server-to-server — a narrow client boundary documented in
`docs/telegram-adapter.md`, tested locally against a service fake. Until that
service is deployed and configured (point `[telegram] provisioningUrl` at it
and set `REPOOS_TELEGRAM_PROVISIONING_KEY` in the environment), connect reports
"managed provisioning is not configured" honestly and Bring Your Own Bot Token
keeps working. A repository instance never holds or accepts a manager-bot
credential of any kind.

For how RepoOS login, the email allowlist, and admin/member roles work, read
[Native authentication](/native-auth). The implementation decision is recorded
in [ADR 0007](../docs/adr/0007-telegram-identity-and-authorization.md), and the
adapter's implementation notes (including the full provisioning contract) are
in [docs/telegram-adapter.md](../docs/telegram-adapter.md).
