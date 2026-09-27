---
name: RepoOS Telegram Bot
number: "0003"
created_at: "2026-09-27T01:02:50.454Z"
created_by: hello@repoos.org
---
# Feature Task: Telegram Notifications and RepoOS Agent Chat

## Objective

Add Telegram integration to RepoOS so each project can:

- Receive RepoOS notifications in Telegram.
- Chat with RepoOS agents from Telegram.
- Provision a dedicated Telegram bot without requiring users to manually configure BotFather.
- Keep each repository’s Telegram identity, messages, permissions, and credentials isolated.

## Recommended architecture

Use one official RepoOS manager bot to provision one dedicated Telegram bot per project.

```text
RepoOS Manager Bot
        ↓ creates/manages
Project-specific Telegram bot
        ↓ unique bot token
Project RepoOS instance
        ↓
Project Telegram group or private chat
```

The manager bot should not process every project’s messages. It should provision and manage project bots. Each project bot should communicate directly with its own RepoOS instance.

This preserves the current RepoOS decentralized architecture: one RepoOS server serves one repository and owns that repository’s configuration and state.

## Telegram capabilities to use

Telegram now supports managed bots. Enable Bot Management Mode on the RepoOS manager bot, then generate project bots using a deep link:

```text
https://t.me/newbot/RepoOSManager/ExampleRepoBot?name=Example+RepoOS
```

Relevant documentation:

- [Telegram Bot Features — Managed Bots](https://core.telegram.org/bots/features#managed-bots)
- [Telegram Managed Bots API](https://core.telegram.org/api/bots/managed-bots)
- [bots.createBot](https://core.telegram.org/method/bots.createBot)
- [Bot API](https://core.telegram.org/bots/api)
- [Bot API webhook documentation](https://core.telegram.org/bots/api#setwebhook)
- [Telegram Bot FAQ](https://core.telegram.org/bots/faq)
- [Telegram group privacy mode](https://core.telegram.org/bots/features#privacy-mode)

## Provisioning flow

1. An administrator opens RepoOS Settings and selects “Connect Telegram.”
2. RepoOS creates a short-lived signed linking request containing:
   - Repository identity.
   - Instance identity.
   - Expiration time.
   - Random nonce.
3. RepoOS opens or displays a managed-bot creation link for the RepoOS manager bot.
4. The user chooses the project bot’s display name and username.
5. Telegram creates the managed bot.
6. The manager bot receives the managed-bot update.
7. The RepoOS service retrieves the new bot token.
8. The token is securely delivered to the intended RepoOS instance.
9. RepoOS configures the project bot:
   - Bot commands.
   - Description and profile information.
   - Group permission behavior.
   - Webhook or polling mode.
10. RepoOS displays an “Add this bot to your project group” action.
11. The administrator adds the bot to a group or starts a private chat with it.
12. RepoOS verifies the chat and completes the link.

Do not rely on Telegram usernames for authorization. Store Telegram’s numeric user IDs and chat IDs.

## Instance-to-Telegram connection

For the first implementation, use one of these models:

### Preferred for hosted RepoOS

The RepoOS service receives Telegram updates centrally, then routes them to the correct project instance.

### Preferred for self-hosted RepoOS

Each RepoOS instance configures its project bot with its own webhook URL or uses long polling.

The implementation should hide this behind a provider interface so the transport can change later:

```ts
interface TelegramProvider {
  provisionBot(): Promise<ProvisionedBot>;
  configureBot(bot: ProvisionedBot): Promise<void>;
  sendMessage(chatId: string, message: TelegramMessage): Promise<void>;
  handleUpdate(update: TelegramUpdate): Promise<void>;
}
```

Do not store the manager bot token inside individual repositories. Store it only in the provisioning service or secure server environment.

Project bot tokens should be encrypted at rest and never exposed to the browser or written into ordinary repository files.

## Linking users and chats

Support both private chats and groups.

A link should associate:

```text
Telegram user ID
Telegram chat ID
RepoOS instance ID
Repository ID
RepoOS role
```

Recommended commands:

```text
/start
/link
/unlink
/status
/help
/agents
/tasks
```

A group should not automatically give every member unrestricted RepoOS access. RepoOS should authorize users individually and apply the project’s existing `admin` and `member` roles.

The initial linking flow should require an authenticated RepoOS administrator. Later, the administrator can invite or authorize additional Telegram users.

## Agent chat behavior

Telegram messages should map to existing RepoOS chat and agent APIs rather than introducing a separate agent runtime.

Initial supported interactions:

- Chat with the repository guide agent.
- List active tasks.
- View task status.
- Ask an agent about a task.
- Send follow-up messages to an active agent.
- Receive agent completion and review notifications.

Potential later interactions:

- Start or pause agents.
- Approve review transitions.
- Create tasks from free-form Telegram messages.
- Attach files, screenshots, or voice messages.
- Use Telegram inline buttons for approvals.

In groups, require one of:

- A command addressed to the bot.
- A reply to a bot message.
- A direct mention of the bot.

Keep Telegram group privacy mode enabled unless a feature explicitly requires all group messages. Telegram recommends privacy mode by default. See the [privacy mode documentation](https://core.telegram.org/bots/features#privacy-mode).

## Notifications

Create a Telegram notification provider alongside the existing notification system.

Notifications should include:

- Task created.
- Task started.
- Agent needs input.
- Agent completed.
- Task moved to review.
- Review feedback available.
- Integration or merge failure.
- Server or agent failure.

Each notification should include:

- Repository name.
- Task identifier and title, when relevant.
- Current status.
- Short summary.
- Link to the RepoOS web interface.
- Optional inline action buttons.

Notifications should be configurable by project and by Telegram chat.

## Security requirements

- Treat every bot token as a password.
- Encrypt project bot tokens at rest.
- Never return bot tokens to the browser after provisioning.
- Use short-lived, single-use linking codes.
- Bind linking requests to a specific authenticated RepoOS administrator.
- Validate Telegram webhook secrets.
- Verify that every incoming chat is linked to the expected repository.
- Check Telegram user authorization before executing commands.
- Add audit events for linking, unlinking, token rotation, and privileged commands.
- Rate-limit Telegram commands and agent messages.
- Prevent a Telegram user from selecting or accessing another repository.
- Revoke the project bot token when Telegram integration is disconnected.

Telegram explicitly warns that anyone with a bot token has full control of that bot, so token handling must be treated as credential management. See the [official bot introduction](https://core.telegram.org/bots).

## Suggested implementation phases

### Phase 1: Notifications

- Add Telegram configuration and secure token storage.
- Add project bot provisioning.
- Add chat linking.
- Send task and agent notifications.
- Add connection status and test-message controls.

### Phase 2: Read-only chat

- Implement `/status`, `/tasks`, `/agents`, and `/help`.
- Add repository-guide chat.
- Add permission checks and audit logging.

### Phase 3: Agent interaction

- Send follow-up messages to task agents.
- Support agent “needs input” conversations.
- Add inline buttons for safe actions.

### Phase 4: Project management

- Create tasks from Telegram.
- Start, pause, and review tasks.
- Support file and screenshot attachments.
- Add optional group/topic routing.

## Acceptance criteria

- An administrator can connect Telegram from RepoOS without manually using BotFather.
- A new project receives its own Telegram bot and unique token.
- Two projects can use Telegram simultaneously without message crossover.
- A project bot can be added to both a private chat and a group.
- Only linked and authorized Telegram users can access the project.
- Notifications arrive in the configured Telegram chat.
- Telegram users can chat with the repository guide agent.
- Telegram users can continue an existing task-agent conversation.
- Disconnecting Telegram revokes the project bot token and removes all chat bindings.
- The manager bot token is never stored in a repository or exposed to clients.
- All linking and privileged actions are auditable.

## Design decision

Implement “one manager bot, one project bot per repository” as the default RepoOS integration model.

Also support a manual “Bring Your Own Bot Token” configuration for self-hosted or enterprise installations where the project owner does not want RepoOS to provision or manage a Telegram bot.
