<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";

type ConfirmationState = "confirmed" | "expired" | "used" | "failed";
type SignupState = "idle" | "pending" | "success" | "duplicate-pending" | "active" | "failure";

const REQUEST_TIMEOUT_MS = 15_000;
const endpointOrigin = parseEndpointOrigin(import.meta.env.VITE_PROJECT_UPDATES_ENDPOINT);
const email = ref("");
const signupState = ref<SignupState>("idle");
const confirmationState = ref<ConfirmationState | "">(readConfirmationState());
const failureMessage = ref("We couldn’t request updates just now. Please try again in a moment.");
const busy = computed(() => signupState.value === "pending");
let controller: AbortController | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;
let mounted = true;

function parseEndpointOrigin(value: string | undefined): string {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return "";
    return url.origin;
  } catch {
    return "";
  }
}

function readConfirmationState(): ConfirmationState | "" {
  const value = new URLSearchParams(window.location.search).get("updates");
  return value === "confirmed" || value === "expired" || value === "used" || value === "failed"
    ? value
    : "";
}

async function submit(): Promise<void> {
  if (busy.value || !endpointOrigin) return;
  signupState.value = "pending";
  failureMessage.value = "We couldn’t request updates just now. Please try again in a moment.";
  controller = new AbortController();
  timeout = setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(new URL("/updates/subscribe", endpointOrigin).href, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.value.trim() }),
      signal: controller.signal,
    });
    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      status?: string;
      code?: string;
    };
    const outcome = result.status ?? result.code;
    const duplicateResponse = response.status === 409;
    if (outcome === "already_active" || outcome === "duplicate_active") {
      if (response.ok || duplicateResponse) signupState.value = "active";
      else signupState.value = "failure";
    } else if (outcome === "already_pending" || outcome === "duplicate_pending") {
      if (response.ok || duplicateResponse) signupState.value = "duplicate-pending";
      else signupState.value = "failure";
    } else if (response.ok && result.ok === true && outcome === "pending") {
      signupState.value = "success";
    } else {
      signupState.value = "failure";
      if (response.status === 429) {
        failureMessage.value = "Too many attempts. Please wait a minute before trying again.";
      }
    }
  } catch {
    if (!mounted) return;
    signupState.value = "failure";
    if (controller?.signal.aborted) {
      failureMessage.value = "This request took too long. Please try again.";
    }
  } finally {
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
    controller = undefined;
    if (mounted && signupState.value === "pending") signupState.value = "failure";
  }
}

function returnToSignup(): void {
  confirmationState.value = "";
  const url = new URL(window.location.href);
  url.searchParams.delete("updates");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

onBeforeUnmount(() => {
  mounted = false;
  if (timeout) clearTimeout(timeout);
  controller?.abort();
});

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
        <div v-if="confirmationState" class="updates-result">
          <p
            class="updates-message"
            :class="`updates-message--${confirmationState}`"
            role="status"
            aria-live="polite"
          >
            {{ confirmationCopy[confirmationState] }}
          </p>
          <button type="button" class="updates-back" @click="returnToSignup">Sign up again</button>
        </div>
        <p v-else-if="!endpointOrigin" class="updates-hint" role="status">
          Project updates signup is temporarily unavailable. Please check back later.
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
          <p id="updates-hint" class="updates-hint">
            We’ll send a confirmation link before adding you.
          </p>
          <p v-if="signupState === 'failure'" id="updates-error" class="updates-error" role="alert">
            {{ failureMessage }}
          </p>
          <p v-if="busy" class="updates-hint" role="status" aria-live="polite">
            Requesting your confirmation email…
          </p>
        </form>
      </div>
    </div>
  </section>
</template>
