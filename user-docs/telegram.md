# Telegram

Telegram connects a bot to an existing RepoOS repository. It is a second way
for allowlisted users to reach RepoOS; it does not create new RepoOS accounts
or grant access based on group membership.

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
