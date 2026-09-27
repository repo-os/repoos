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

## Connect a repository

An administrator connects Telegram from that repository's RepoOS Settings.
The connection flow provisions or configures the repository's project bot.
The bot can only send repository notifications to chats that an authenticated
RepoOS admin explicitly binds. Adding the bot to a group by itself does not
authorize that chat or give its members access.

## Link your account

An administrator creates a Telegram link for an email already on the
repository's **Authentication & Users** allowlist. Open the resulting bot link
in Telegram to bind your Telegram account to that email. Your Telegram numeric
user ID is the identity key; your Telegram username is only a display hint and
does not prove who you are.

The link uses your current RepoOS role. RepoOS checks the role from the
allowlist on each message, so an admin changing your role or removing your
email takes effect on your next Telegram message. Removing you from a Telegram
group does not change your RepoOS account, and being in a bound group does not
grant one.

Unknown, unlinked, or no-longer-allowlisted senders receive no reply in any
chat. This avoids confirming the bot is active and flooding groups with access
errors.

For how RepoOS login, the email allowlist, and admin/member roles work, read
[Native authentication](/native-auth). The implementation decision is recorded
in [ADR 0007](../docs/adr/0007-telegram-identity-and-authorization.md).
