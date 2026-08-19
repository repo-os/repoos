<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

// Auth status
const authEnabled = ref(false);
const bootstrapNeeded = ref(false);
const hasGoogle = ref(false);
const hasEmailProvider = ref(false);
const loading = ref(true);

// OTP flow
const step = ref<"email" | "otp" | "error">("email");
const email = ref("");
const otpCode = ref("");
const sending = ref(false);
const verifying = ref(false);
const errorMsg = ref("");
const resendTimer = ref(0);
let resendInterval: ReturnType<typeof setInterval> | undefined;

// Bootstrap flow
const bootstrapEmail = ref("");
const bootstrapping = ref(false);

async function checkStatus(): Promise<void> {
  try {
    const res = await fetch("/api/auth/status");
    const data = await res.json();
    authEnabled.value = data.enabled;
    bootstrapNeeded.value = data.bootstrapNeeded;
    hasGoogle.value = data.hasGoogle;
    hasEmailProvider.value = data.hasEmailProvider;
    if (!data.enabled) {
      // Auth not enabled, go to dashboard
      router.replace("/");
      return;
    }
    // Check if already logged in
    const meRes = await fetch("/api/auth/me");
    const meData = await meRes.json();
    if (meData.authenticated) {
      const redirect = (route.query.redirect as string) || "/";
      router.replace(redirect);
      return;
    }
  } catch {
    // Auth status endpoint might not be reachable yet
  } finally {
    loading.value = false;
  }
}

onMounted(checkStatus);

function startResendTimer(): void {
  resendTimer.value = 60;
  clearInterval(resendInterval);
  resendInterval = setInterval(() => {
    resendTimer.value--;
    if (resendTimer.value <= 0) {
      clearInterval(resendInterval);
    }
  }, 1000);
}

async function requestOtp(): Promise<void> {
  if (!email.value.trim()) return;
  sending.value = true;
  errorMsg.value = "";
  try {
    const res = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.value.trim().toLowerCase() }),
    });
    if (res.ok) {
      step.value = "otp";
      startResendTimer();
    } else {
      const data = await res.json();
      errorMsg.value = data.error || "Failed to send code";
    }
  } catch {
    errorMsg.value = "Network error — try again";
  } finally {
    sending.value = false;
  }
}

async function verifyOtp(): Promise<void> {
  if (!otpCode.value.trim()) return;
  verifying.value = true;
  errorMsg.value = "";
  try {
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.value.trim().toLowerCase(),
        code: otpCode.value.trim(),
      }),
    });
    if (res.ok) {
      const redirect = (route.query.redirect as string) || "/";
      router.replace(redirect);
    } else {
      const data = await res.json();
      errorMsg.value = data.error || "Invalid code";
      otpCode.value = "";
    }
  } catch {
    errorMsg.value = "Network error — try again";
  } finally {
    verifying.value = false;
  }
}

async function doBootstrap(): Promise<void> {
  if (!bootstrapEmail.value.trim()) return;
  bootstrapping.value = true;
  errorMsg.value = "";
  try {
    const res = await fetch("/api/auth/bootstrap-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: bootstrapEmail.value.trim().toLowerCase() }),
    });
    if (res.ok) {
      router.replace("/");
    } else {
      const data = await res.json();
      errorMsg.value = data.error || "Failed to create admin";
    }
  } catch {
    errorMsg.value = "Network error — try again";
  } finally {
    bootstrapping.value = false;
  }
}

function googleLogin(): void {
  window.location.href = "/api/auth/login/google";
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="login-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" stroke="var(--cyan)" stroke-width="2" stroke-linejoin="round" />
            <path d="M12 7v10M8 9.5v5M16 9.5v5" stroke="var(--violet)" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </div>
        <div>
          <h1>RepoOS</h1>
          <span class="login-tagline mono">repo is the os</span>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="login-loading">
        <div class="spinner"></div>
      </div>

      <!-- Bootstrap admin -->
      <div v-else-if="bootstrapNeeded" class="login-body">
        <h2>Welcome — Set up your admin account</h2>
        <p class="login-subtitle">Enter the email for the first administrator.</p>
        <div class="login-form">
          <input
            v-model="bootstrapEmail"
            type="email"
            placeholder="admin@example.com"
            class="login-input"
            @keyup.enter="doBootstrap"
          />
          <button class="login-btn primary" :disabled="bootstrapping || !bootstrapEmail.trim()" @click="doBootstrap">
            {{ bootstrapping ? "Setting up..." : "Create Admin" }}
          </button>
        </div>
        <p v-if="errorMsg" class="login-error">{{ errorMsg }}</p>
      </div>

      <!-- Login form -->
      <div v-else class="login-body">
        <h2>Sign in</h2>

        <!-- Step: email -->
        <div v-if="step === 'email'" class="login-form">
          <div v-if="hasEmailProvider">
            <p class="login-subtitle">Enter your email to receive a one-time code.</p>
            <input
              v-model="email"
              type="email"
              placeholder="you@example.com"
              class="login-input"
              @keyup.enter="requestOtp"
            />
            <button class="login-btn primary" :disabled="sending || !email.trim()" @click="requestOtp">
              {{ sending ? "Sending..." : "Send code" }}
            </button>
          </div>
          <div v-else class="login-no-provider">
            <p>Email provider not configured. Contact your administrator.</p>
          </div>

          <div v-if="hasGoogle" class="login-divider">
            <span>or</span>
          </div>
          <button v-if="hasGoogle" class="login-btn google" @click="googleLogin">
            <svg viewBox="0 0 24 24" width="18" height="18" style="margin-right: 8px;">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>

        <!-- Step: OTP verification -->
        <div v-if="step === 'otp'" class="login-form">
          <p class="login-subtitle">Enter the 6-digit code sent to <strong>{{ email }}</strong></p>
          <input
            v-model="otpCode"
            type="text"
            inputmode="numeric"
            maxlength="6"
            placeholder="000000"
            class="login-input otp-input"
            autocomplete="one-time-code"
            @keyup.enter="verifyOtp"
          />
          <button class="login-btn primary" :disabled="verifying || otpCode.length !== 6" @click="verifyOtp">
            {{ verifying ? "Verifying..." : "Verify" }}
          </button>
          <div class="login-actions">
            <button class="login-link" :disabled="resendTimer > 0" @click="requestOtp">
              {{ resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend code" }}
            </button>
            <button class="login-link" @click="step = 'email'">Use a different email</button>
          </div>
        </div>

        <p v-if="errorMsg" class="login-error">{{ errorMsg }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background: var(--body-gradient), var(--bg);
  padding: 24px;
  font-family: var(--font-sans);
}

/* soft ambient glow behind the card, echoing the app's neon/glass look */
.login-page::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(680px 420px at 15% 12%, rgba(57, 224, 255, 0.14), transparent 60%),
    radial-gradient(720px 480px at 88% 92%, rgba(157, 123, 255, 0.16), transparent 55%);
}

.login-card {
  position: relative;
  background: var(--panel-solid);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: var(--card-glow), 0 24px 60px -20px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(14px);
  padding: 48px 44px;
  max-width: 460px;
  width: 100%;
}

.login-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 36px;
}

.login-logo {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 13px;
  position: relative;
  display: grid;
  place-items: center;
  background: conic-gradient(from 200deg, var(--cyan), var(--violet), var(--cyan));
  box-shadow: var(--logo-shadow);
}

.login-logo::after {
  content: "";
  position: absolute;
  inset: 4px;
  border-radius: 9px;
  background: var(--bg-2);
}

.login-logo svg {
  position: relative;
  z-index: 1;
}

.login-header h1 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--txt);
}

.login-tagline {
  display: block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--txt-faint);
  margin-top: 3px;
}

.login-body h2 {
  font-size: 21px;
  font-weight: 700;
  margin: 0 0 8px 0;
  color: var(--txt);
}

.login-subtitle {
  color: var(--txt-dim);
  font-size: 14px;
  line-height: 1.5;
  margin: 0 0 22px 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-input {
  padding: 12px 15px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 15px;
  background: var(--panel);
  color: var(--txt);
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s, background-color 0.15s;
}

.login-input::placeholder {
  color: var(--txt-faint);
}

.login-input:focus {
  border-color: var(--border-bright);
  background: var(--panel-solid);
}

.otp-input {
  font-size: 26px;
  text-align: center;
  letter-spacing: 10px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
}

.login-btn {
  padding: 12px 18px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: filter 0.15s, opacity 0.15s, background-color 0.15s, border-color 0.15s;
}

.login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.login-btn.primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-color);
  border: 1px solid var(--border-bright);
}

.login-btn.primary:hover:not(:disabled) {
  filter: brightness(1.12);
}

.login-btn.google {
  background: var(--panel);
  color: var(--txt);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-btn.google:hover:not(:disabled) {
  border-color: var(--border-bright);
  background: var(--panel-solid);
}

.login-divider {
  text-align: center;
  position: relative;
  margin: 6px 0;
}

.login-divider::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border);
}

.login-divider span {
  background: var(--panel-solid);
  padding: 0 12px;
  position: relative;
  color: var(--txt-faint);
  font-size: 13px;
}

.login-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 4px;
}

.login-link {
  background: none;
  border: none;
  color: var(--cyan);
  cursor: pointer;
  font-size: 13px;
  padding: 4px;
  font-family: inherit;
}

.login-link:disabled {
  color: var(--txt-faint);
  cursor: not-allowed;
}

.login-error {
  color: var(--red);
  font-size: 13px;
  margin-top: 8px;
  text-align: center;
}

.login-loading {
  display: flex;
  justify-content: center;
  padding: 32px;
}

.spinner {
  width: 26px;
  height: 26px;
  border: 3px solid var(--border);
  border-top-color: var(--cyan);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.login-no-provider {
  text-align: center;
  padding: 24px;
  color: var(--txt-dim);
}

@media (max-width: 520px) {
  .login-card {
    padding: 36px 26px;
  }
}
</style>
