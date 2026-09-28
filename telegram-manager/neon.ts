/**
 * Neon Functions deployment config (`neon deploy`). Declares one function:
 * the provisioning HTTP service. Postgres must be enabled on the target Neon
 * project/branch for `DATABASE_URL` to be injected automatically — see
 * docs/telegram-manager-service.md#deploying for the full walkthrough
 * (creating the project, running migrations, setting secrets, and wiring
 * the Telegram webhook and the maintenance-sweep trigger).
 *
 * Every value below that is a secret is read from `process.env` at deploy
 * time (`neon deploy --env .env.production`), never hardcoded — the file
 * itself is committed, the secrets never are.
 */
import { defineConfig } from "@neon/config/v1";

function requireDeployEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} must be set in the environment neon.ts is evaluated in (e.g. via ` +
        `\`neon deploy --env .env.production\`) — it is never hardcoded here.`,
    );
  }
  return value;
}

export default defineConfig({
  functions: {
    manager: {
      name: "RepoOS Telegram manager-bot provisioning service",
      source: "./src/index.ts",
      env: {
        TELEGRAM_MANAGER_BOT_TOKEN: requireDeployEnv("TELEGRAM_MANAGER_BOT_TOKEN"),
        TELEGRAM_MANAGER_BOT_USERNAME: requireDeployEnv("TELEGRAM_MANAGER_BOT_USERNAME"),
        TELEGRAM_MANAGER_WEBHOOK_SECRET: requireDeployEnv("TELEGRAM_MANAGER_WEBHOOK_SECRET"),
        TELEGRAM_MANAGER_INSTANCE_AUTH_KEY: requireDeployEnv("TELEGRAM_MANAGER_INSTANCE_AUTH_KEY"),
        TELEGRAM_MANAGER_ENCRYPTION_KEY: requireDeployEnv("TELEGRAM_MANAGER_ENCRYPTION_KEY"),
      },
    },
  },
});
