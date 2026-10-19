<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

const dialog = ref<HTMLDialogElement>();
const form = ref<HTMLFormElement>();
const name = ref("");
const email = ref("");
const problem = ref("");
const timing = ref("Exploring possibilities");
const website = ref("");
const sending = ref(false);
const sent = ref(false);
const error = ref("");
const timingOptions = [
  "Exploring possibilities",
  "Ready to start soon",
  "We have a target launch date",
];
let controller: AbortController | undefined;
let lastPayload = "";
let submissionId = "";

function open(): void {
  if (!dialog.value?.open) dialog.value?.showModal();
}
function closeOnBackdrop(event: MouseEvent): void {
  if (event.target !== dialog.value || !dialog.value) return;
  const box = dialog.value.getBoundingClientRect();
  if (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  )
    dialog.value.close();
}
function startAnother(): void {
  name.value = email.value = problem.value = website.value = "";
  timing.value = timingOptions[0]!;
  sent.value = false;
  lastPayload = submissionId = "";
}
async function submit(): Promise<void> {
  if (sending.value || sent.value || !form.value?.reportValidity()) return;
  const payload = {
    name: name.value.trim(),
    email: email.value.trim(),
    problem: problem.value.trim(),
    timing: timing.value,
    website: website.value,
  };
  if (!payload.name || !payload.problem) {
    error.value = "Please add your name and a little about your project.";
    return;
  }
  const serialized = JSON.stringify(payload);
  if (serialized !== lastPayload) {
    submissionId = crypto.randomUUID();
    lastPayload = serialized;
  }
  sending.value = true;
  error.value = "";
  controller = new AbortController();
  const timeout = setTimeout(() => controller?.abort(), 15_000);
  try {
    const response = await fetch("/api/enquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, submissionId }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) {
      error.value =
        response.status === 429
          ? "Too many attempts. Please wait a minute before trying again, or email hello@repoos.org."
          : "We couldn't send your enquiry. Your draft is still here. Please try again or email hello@repoos.org.";
      return;
    }
    sent.value = true;
  } catch {
    error.value =
      "We couldn't confirm your enquiry was sent. Your draft is still here. Please retry or email hello@repoos.org.";
  } finally {
    clearTimeout(timeout);
    sending.value = false;
  }
}
onBeforeUnmount(() => controller?.abort());
defineExpose({ open });
</script>

<template>
  <dialog
    ref="dialog"
    class="clients-dialog"
    aria-labelledby="enquiry-heading"
    @click="closeOnBackdrop"
  >
    <button
      type="button"
      class="clients-dialog-close"
      aria-label="Close enquiry"
      @click="dialog?.close()"
    >
      ×
    </button>
    <div class="clients-eyebrow">A starting point</div>
    <h2 id="enquiry-heading">Tell us what you have in mind.</h2>
    <div v-if="sent" class="clients-form-success" role="status">
      <p><strong>Thanks — your enquiry has been sent.</strong></p>
      <p>We'll reply to your work email to talk through the next step.</p>
      <button type="button" class="clients-primary" @click="dialog?.close()">Done</button>
      <button type="button" class="clients-text-link clients-another" @click="startAnother">
        Start another enquiry
      </button>
    </div>
    <form v-else ref="form" :aria-busy="sending" @submit.prevent="submit">
      <p class="clients-form-intro">A rough idea is enough. We'll take it from there.</p>
      <fieldset :disabled="sending">
        <label for="client-name">Your name / company</label>
        <input
          id="client-name"
          v-model="name"
          name="name"
          autocomplete="organization"
          required
          maxlength="160"
          placeholder="e.g. Alex at Acme"
        />
        <label for="client-email">Work email</label>
        <input
          id="client-email"
          v-model="email"
          name="email"
          type="email"
          autocomplete="email"
          required
          maxlength="254"
          placeholder="you@company.com"
        />
        <label for="client-problem">What would you like to build or improve?</label>
        <textarea
          id="client-problem"
          v-model="problem"
          name="problem"
          required
          maxlength="5000"
          placeholder="What's the problem, who is it for, and how do you handle it today?"
        ></textarea>
        <fieldset class="clients-timing">
          <legend>Timing</legend>
          <label v-for="option in timingOptions" :key="option" class="clients-radio">
            <input v-model="timing" type="radio" name="timing" :value="option" />
            <span>{{ option }}</span>
          </label>
        </fieldset>
        <div class="clients-honeypot" aria-hidden="true" inert>
          <label for="client-website">Leave this field empty</label>
          <input
            id="client-website"
            v-model="website"
            name="website"
            tabindex="-1"
            autocomplete="off"
          />
        </div>
        <p id="enquiry-privacy" class="clients-form-privacy">
          Your details and project brief will be emailed to hello@repoos.org via Resend so we can
          respond. Please leave out passwords and other sensitive information.
        </p>
        <button type="submit" class="clients-primary" aria-describedby="enquiry-privacy">
          {{ sending ? "Sending…" : "Send project enquiry ↗" }}
        </button>
      </fieldset>
      <p v-if="sending" role="status" class="clients-form-status">Sending your enquiry…</p>
      <p v-if="error" role="alert" class="clients-form-error">{{ error }}</p>
    </form>
  </dialog>
</template>
