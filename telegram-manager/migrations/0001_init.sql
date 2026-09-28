-- Provisioning schema (#0559), migration 0001.
--
-- Run with `bun run migrate` (telegram-manager/scripts/migrate.ts), which
-- tracks applied migrations in schema_migrations and applies files in this
-- directory in filename order. See docs/telegram-manager-service.md for the
-- full migration/rollback procedure — this file's rollback is the paired
-- `-- rollback` block at the bottom, applied by `bun run migrate:down`.

CREATE TABLE IF NOT EXISTS provisioning_requests (
    id                 TEXT PRIMARY KEY,
    repository         TEXT NOT NULL,
    instance_id        TEXT NOT NULL,
    admin_email        TEXT NOT NULL,
    bot_name_hint      TEXT,
    state              TEXT NOT NULL,
    deep_link          TEXT NOT NULL,
    link_code          TEXT,
    link_code_expires_at TIMESTAMPTZ,
    creator_telegram_user_id BIGINT,
    bot_id             BIGINT,
    bot_username       TEXT,
    bot_display_name   TEXT,
    bot_can_read_all_group_messages BOOLEAN,
    -- The redeemed credential, encrypted (AES-256-GCM), retained only for the
    -- short replay grace window and then purged — see
    -- docs/telegram-manager-service.md#redemption-and-the-grace-window.
    token_envelope_iv         TEXT,
    token_envelope_tag        TEXT,
    token_envelope_ciphertext TEXT,
    redeemed_at        TIMESTAMPTZ,
    grace_until        TIMESTAMPTZ,
    error              TEXT,
    expires_at         TIMESTAMPTZ NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One in-flight (non-terminal) request per (repository, instance) keeps a
-- confused admin from piling up duplicate pending requests; terminal states
-- (redeemed/expired/failed) are excluded so history accumulates normally.
CREATE UNIQUE INDEX IF NOT EXISTS provisioning_requests_active_per_instance
    ON provisioning_requests (repository, instance_id)
    WHERE state NOT IN ('redeemed', 'expired', 'failed');

CREATE INDEX IF NOT EXISTS provisioning_requests_link_code
    ON provisioning_requests (link_code)
    WHERE link_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS provisioning_requests_creator
    ON provisioning_requests (creator_telegram_user_id)
    WHERE creator_telegram_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS telegram_update_dedup (
    update_id  BIGINT PRIMARY KEY,
    seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limit_counters (
    scope        TEXT NOT NULL,
    key          TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (scope, key, window_start)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    request_id  TEXT,
    event       TEXT NOT NULL,
    detail      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_request_id ON audit_log (request_id);

-- rollback
-- DROP TABLE IF EXISTS audit_log;
-- DROP TABLE IF EXISTS rate_limit_counters;
-- DROP TABLE IF EXISTS telegram_update_dedup;
-- DROP TABLE IF EXISTS provisioning_requests;
