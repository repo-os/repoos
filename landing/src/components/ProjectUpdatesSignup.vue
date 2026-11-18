<script setup lang="ts">
import { computed, ref } from "vue";

type ConfirmationState = "confirmed" | "expired" | "used" | "failed";
type SignupState = "idle" | "pending" | "success" | "duplicate-pending" | "active" | "failure";

const endpointOrigin = import.meta.env.VITE_PROJECT_UPDATES_ENDPOINT?.trim() ?? "";
const email = ref("");
const signupState = ref<SignupState>("idle");
const confirmationState = ref<ConfirmationState | "">(readConfirmationState());
const busy = computed(() => signupState.value === "pending");

function readConfirmationState(): ConfirmationState | "" {
  const value = new URLSearchParams(window.location.search).get("updates");
  return value === "confirmed" || value === "expired" || value === "used" || value === "failed"
    ? value
    : "";
}

function endpoint(path: string): string {
  const origin = new URL(endpointOrigin);
  if (origin.protocol !== "https:" && origin.hostname !== "localhost") {
    throw new Error("invalid endpoint origin");
  }
  return new URL(path, origin.origin).href;
}

async function submit(): Promise<void> {
  if (busy.value) return;
  signupState.value = "pending";
  try {
    const response = await fetch(endpoint("/updates/subscribe"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.value.trim() }),
    });
    const result = (await response.json().catch(() => ({}))) as { status?: string; code?: string };
    const outcome = result.status ?? result.code;
    if (response.ok && (outcome === "already_active" || outcome === "active")) {
      signupState.value = "active";
    } else if (response.ok && (outcome === "already_pending" || outcome === "pending")) {
      signupState.value = "duplicate-pending";
    } else if (response.ok && outcome !== "error") {
      signupState.value = "success";
    } else if (response.status === 409 && (outcome === "already_active" || outcome === "active")) {
      signupState.value = "active";
    } else if (response.status === 409 && (outcome === "already_pending" || outcome === "pending")) {
      signupState.value = "duplicate-pending";
    } else {
      signupState.value = "failure";
    }
  } catch {
    signupState.value = "failure";
  }
}

const confirmationCopy: Record<ConfirmationState, string> = {
  confirmed: "Your email is confirmed. You’re on the RepoOS project updates list.",
  expired: "That confirmation link has expired. Request a new one by signing up again.",
  used: "That confirmation link has already been used. Your address is confirmed.",
  failed: "We couldn’t confirm that address. The link may be invalid; try signing up again.",
};
</script>

<template>
  <section id="project-updates" class="wrap pb-20 sm:pb-24" aria-labelledby="updates-heading">
    <div class="updates-panel">
      <div class="updates-copy">
        <p class="eyebrow">Project updates</p>
        <h2 id="updates-heading">A note when RepoOS moves forward.</h2>
        <p class="updates-promise">
          Occasional RepoOS product and release updates. We’ll include an unsubscribe link in every
          email.
        </p>
      </div>

      <div class="updates-form-wrap">
        <p v-if="confirmationState" class="updates-message" role="status" aria-live="polite">
          {{ confirmationCopy[confirmationState] }}
        </p>
        <template v-else-if="signupState === 'success'">
          <p class="updates-message" role="status" aria-live="polite">
            Check your inbox for a confirmation link. You’ll be subscribed after you confirm.
          </p>
        </template>
        <template v-else-if="signupState === 'duplicate-pending'">
          <p class="updates-message" role="status" aria-live="polite">
            That address is awaiting confirmation. Check your inbox for the link.
          </p>
        </template>
        <template v-else-if="signupState === 'active'">
          <p class="updates-message" role="status" aria-live="polite">
            That address is already subscribed to RepoOS project updates.
          </p>
        </template>
        <form v-else class="updates-form" :aria-busy="busy" @submit.prevent="submit">
          <label for="updates-email">Email address</label>
          <div class="updates-controls">
            <input
              id="updates-email"
              v-model="email"
              name="email"
              type="email"
              autocomplete="email"
              maxlength="254"
              placeholder="you@example.com"
              required
              :disabled="busy"
              :aria-describedby="signupState === 'failure' ? 'updates-error' : 'updates-hint'"
            />
            <button type="submit" :disabled="busy">
              {{ busy ? "Sending…" : "Get updates" }}
            </button>
          </div>
          <p id="updates-hint" class="updates-hint">We’ll send a confirmation link before adding you.</p>
          <p v-if="signupState === 'failure'" id="updates-error" class="updates-error" role="alert">
            We couldn’t request updates just now. Please try again in a moment.
          </p>
          <p v-if="busy" class="updates-hint" role="status" aria-live="polite">Requesting your confirmation email…</p>
        </form>
      </div>
    </div>
  </section>
</template>
