<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import InstallBox from "./components/InstallBox.vue";
import SiteLogo from "./components/SiteLogo.vue";
import {
  type Appearance,
  type DesignThemeId,
  type PickerDesignTheme,
  applyAppearanceToDocument,
  applyDesignThemeToDocument,
  persistThemes,
  pickerLabelForDesign,
  resolveThemes,
  syncThemeColorMeta,
  syncThemeToUrl,
  appendThemeToUrl,
} from "./theme-resolve";

const appearance = ref<Appearance>("dark");
const designTheme = ref<DesignThemeId>("classic");
const pickerOpen = ref(false);

const DESIGN_OPTIONS: { id: PickerDesignTheme; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "gruvbox", label: "Gruvbox" },
];

function applyAppearance(next: Appearance): void {
  appearance.value = next;
  applyAppearanceToDocument(next);
  persistThemes(designTheme.value, next);
  syncThemeColorMeta(designTheme.value, next);
  syncThemeToUrl(designTheme.value, next);
}

function applyDesignTheme(next: PickerDesignTheme): void {
  designTheme.value = next;
  applyDesignThemeToDocument(next);
  persistThemes(next, appearance.value);
  syncThemeColorMeta(next, appearance.value);
  syncThemeToUrl(next, appearance.value);
}

function toggleAppearance(): void {
  applyAppearance(appearance.value === "dark" ? "light" : "dark");
}

function selectDesignTheme(next: PickerDesignTheme): void {
  applyDesignTheme(next);
  pickerOpen.value = false;
}

function togglePicker(): void {
  pickerOpen.value = !pickerOpen.value;
}

function onDocumentClick(e: MouseEvent): void {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (!target.closest(".theme-picker")) {
    pickerOpen.value = false;
  }
}

// Mobile nav. The inline links need ~686px to fit beside the logo, so they're
// hidden below Tailwind's md (768px) and reachable through this menu instead.
const menuOpen = ref(false);
const DESKTOP_NAV = "(min-width: 768px)";

function closeMenu(): void {
  menuOpen.value = false;
  pickerOpen.value = false;
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    pickerOpen.value = false;
    closeMenu();
  }
}

let desktopQuery: MediaQueryList | undefined;

onMounted(() => {
  const resolved = resolveThemes();
  appearance.value = resolved.appearance;
  designTheme.value = resolved.design;

  desktopQuery = window.matchMedia(DESKTOP_NAV);
  desktopQuery.addEventListener("change", closeMenu);
  window.addEventListener("keydown", onKeydown);
  document.addEventListener("click", onDocumentClick);
});

onBeforeUnmount(() => {
  desktopQuery?.removeEventListener("change", closeMenu);
  window.removeEventListener("keydown", onKeydown);
  document.removeEventListener("click", onDocumentClick);
});

const activeDesignLabel = () => {
  const known = DESIGN_OPTIONS.find((o) => o.id === designTheme.value);
  if (known) return known.label;
  return pickerLabelForDesign(designTheme.value);
};

function docsLink(path = ""): string {
  return appendThemeToUrl(`https://docs.repoos.org${path}`, designTheme.value, appearance.value);
}

const steps = [
  {
    title: "Write the task",
    body: "Add a task on the board, or hand the PM agent a rough idea and let it write the spec. A task is a Markdown file in your repo, so you and the agents read the same thing.",
  },
  {
    title: "An agent picks it up",
    body: "RepoOS creates a branch and a worktree, then gives the task to the coding agent you picked. Two active tasks never share a checkout.",
  },
  {
    title: "The checks run",
    body: "RepoOS runs the checks your project defines: build, typecheck, tests, whatever your repo needs. If they fail, the work doesn't move forward.",
  },
  {
    title: "You approve",
    body: "Agents can write the code, run the tests and review each other. They can't approve their own merge. You decide what lands on your main branch.",
  },
];

const choices = [
  {
    title: "Everything lives in Git",
    body: "Tasks, docs and inputs are plain files. You can grep, edit, diff and blame them with the tools you already use. There's no second database to keep in sync.",
  },
  {
    title: "One task, one worktree",
    body: "Every active task gets its own branch and checkout, so agents can run side by side without stepping on each other's files. RepoOS cleans up the worktree when the task is done.",
  },
  {
    title: "Project-defined checks",
    body: 'You decide what "done" means for your codebase. A Go API, a Vue app and a Python library need different checks, and RepoOS runs whichever ones you set up.',
  },
  {
    title: "Zero runtime dependencies",
    body: "What you install is plain JavaScript that runs on Bun or Node. We use dev dependencies to build it, but the package you run has none.",
  },
];

const roles = [
  ["PM", "Turns a rough idea or bug report into a task an engineer can pick up."],
  ["Engineer", "Implements the task in its own branch and worktree."],
  ["Reviewer", "Reads the spec and the diff and points out real problems before you look."],
  ["Debugger", "Starts from a failed check and the evidence, instead of restarting the task."],
  ["CTO", "Watches the board for stuck work, tech debt and decisions that need a human."],
];

const notList = [
  {
    title: "Not a hosted copy of your project",
    body: "Your repository is the source of truth. The UI is just a view of files you own.",
  },
  {
    title: "Not an AI layer on Jira",
    body: "RepoOS deals with the things that change code: tasks, branches, worktrees, checks, reviews and merges.",
  },
  {
    title: "Not a demo",
    body: "We use it every day on a real codebase, and it's built for that: isolated work, repeatable checks and a history you can read.",
  },
  {
    title: "Not tied to one model",
    body: "Bring your own agents and providers, local or cloud. Swap them whenever something better comes along.",
  },
];

const year = new Date().getFullYear();
</script>

<template>
  <header class="site-nav">
    <div class="wrap flex h-[58px] items-center justify-between">
      <a href="#top" class="flex items-center gap-2.5">
        <SiteLogo class="h-7 w-7" :size="28" />
        <span class="text-[15px] font-bold tracking-tight">RepoOS</span>
      </a>
      <nav class="flex min-w-0 shrink items-center gap-3 md:gap-6">
        <a href="#why" class="nav-link hidden md:block">The problem</a>
        <a href="#how" class="nav-link hidden md:block">How it works</a>
        <a href="#team" class="nav-link hidden md:block">The team</a>
        <a href="#principles" class="nav-link hidden md:block">Design</a>
        <a :href="docsLink()" class="nav-link hidden md:block">Docs</a>
        <div class="theme-controls hidden md:inline-flex">
          <div class="theme-picker">
            <button
              type="button"
              class="theme-picker-trigger"
              :aria-expanded="pickerOpen"
              aria-haspopup="menu"
              aria-label="Design theme"
              :title="`Design theme: ${activeDesignLabel()}`"
              @click="togglePicker"
            >
              <span>{{ activeDesignLabel() }}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                class="theme-picker-chevron"
                :class="{ open: pickerOpen }"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div v-if="pickerOpen" class="theme-picker-menu" role="menu" aria-label="Design theme">
              <button
                v-for="opt in DESIGN_OPTIONS"
                :key="opt.id"
                type="button"
                role="menuitemradio"
                class="theme-picker-option"
                :aria-checked="designTheme === opt.id ? 'true' : 'false'"
                :aria-label="`Use ${opt.label} design theme`"
                :title="`Use ${opt.label} design theme`"
                @click="selectDesignTheme(opt.id)"
              >
                <span>{{ opt.label }}</span>
                <span v-if="designTheme === opt.id" class="theme-picker-check" aria-hidden="true"
                  >✓</span
                >
              </button>
            </div>
          </div>
          <button
            type="button"
            class="theme-toggle"
            :aria-label="
              appearance === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'
            "
            :title="
              appearance === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'
            "
            @click="toggleAppearance"
          >
            <svg
              v-if="appearance === 'dark'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
              />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          </button>
        </div>
        <a href="https://github.com/repo-os/repoos" class="nav-github">
          <svg viewBox="0 0 16 16" fill="currentColor" class="h-3.5 w-3.5" aria-hidden="true">
            <path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
            />
          </svg>
          GitHub
        </a>
        <button
          type="button"
          class="nav-burger inline-flex md:hidden"
          :aria-expanded="menuOpen"
          aria-controls="mobile-menu"
          :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
          @click="menuOpen = !menuOpen"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            class="h-4 w-4"
            aria-hidden="true"
          >
            <template v-if="menuOpen">
              <path d="M6 6l12 12M18 6 6 18" />
            </template>
            <template v-else>
              <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />
            </template>
          </svg>
        </button>
      </nav>
    </div>

    <div v-if="menuOpen" id="mobile-menu" class="nav-menu md:hidden">
      <div class="wrap flex flex-col py-2">
        <a href="#why" class="nav-menu-link" @click="closeMenu">The problem</a>
        <a href="#how" class="nav-menu-link" @click="closeMenu">How it works</a>
        <a href="#team" class="nav-menu-link" @click="closeMenu">The team</a>
        <a href="#principles" class="nav-menu-link" @click="closeMenu">Design</a>
        <a :href="docsLink()" class="nav-menu-link" @click="closeMenu">Docs</a>
        <a href="https://github.com/repo-os/repoos" class="nav-menu-link" @click="closeMenu"
          >GitHub</a
        >
        <div class="theme-menu-row">
          <span class="theme-menu-label">Design theme</span>
          <div class="theme-picker">
            <button
              type="button"
              class="theme-picker-trigger"
              :aria-expanded="pickerOpen"
              aria-haspopup="menu"
              aria-label="Design theme"
              :title="`Design theme: ${activeDesignLabel()}`"
              @click="togglePicker"
            >
              <span>{{ activeDesignLabel() }}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                class="theme-picker-chevron"
                :class="{ open: pickerOpen }"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div v-if="pickerOpen" class="theme-picker-menu" role="menu" aria-label="Design theme">
              <button
                v-for="opt in DESIGN_OPTIONS"
                :key="`m-${opt.id}`"
                type="button"
                role="menuitemradio"
                class="theme-picker-option"
                :aria-checked="designTheme === opt.id ? 'true' : 'false'"
                :aria-label="`Use ${opt.label} design theme`"
                :title="`Use ${opt.label} design theme`"
                @click="selectDesignTheme(opt.id)"
              >
                <span>{{ opt.label }}</span>
                <span v-if="designTheme === opt.id" class="theme-picker-check" aria-hidden="true"
                  >✓</span
                >
              </button>
            </div>
          </div>
          <button
            type="button"
            class="theme-toggle"
            :aria-label="
              appearance === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'
            "
            :title="
              appearance === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'
            "
            @click="toggleAppearance"
          >
            <svg
              v-if="appearance === 'dark'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
              />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </header>

  <main id="top">
    <!-- ============ HERO ============ -->
    <section class="wrap pt-16 pb-14 sm:pt-24 sm:pb-20">
      <div class="grid items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div class="min-w-0">
          <p class="eyebrow mb-5">For engineers and tech leads</p>
          <h1
            class="hero-title text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-[54px]"
          >
            The repo is the<br />
            operating system.
          </h1>
          <p class="mt-6 max-w-[50ch] text-[17px] leading-relaxed text-[var(--txt)]">
            RepoOS is how we run coding agents on a real codebase. Tasks are written down, each one
            gets its own worktree, your checks run, and a person approves the merge. All of it lives
            in Git.
          </p>
          <p class="mt-4 max-w-[50ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
            Coding agents write decent code. The hard part is keeping them useful over days of work:
            they lose context, repeat each other, undo earlier decisions and trample each other's
            changes. RepoOS is the plumbing that stops that.
          </p>

          <InstallBox class="mt-8" show-note />
          <p class="mt-3 text-[13px] text-[var(--txt-faint)]">
            Prefer a desktop app?
            <a
              href="https://github.com/repo-os/repoos/releases/latest/download/RepoOSHub.dmg"
              class="text-[var(--cyan)] hover:underline"
              >RepoOS Hub for Mac &rarr;</a
            >
          </p>
          <p class="mt-1 text-[12px] text-[var(--txt-faint)]">
            Current Mac builds are not notarized. After a blocked first launch, use System Settings
            &rarr; Privacy &amp; Security &rarr; Open Anyway.
          </p>
        </div>

        <figure class="min-w-0">
          <div class="shot-frame">
            <div class="term-bar">
              <span class="term-dot term-dot-red"></span>
              <span class="term-dot term-dot-amber"></span>
              <span class="term-dot term-dot-green"></span>
              <span class="term-title">RepoOS &mdash; work board</span>
            </div>
            <img
              src="/board.webp"
              alt="RepoOS work board from this repository, captured while task #0338 — the landing page — was active in the coding column"
              width="1200"
              height="750"
              fetchpriority="high"
            />
          </div>
          <figcaption class="shot-caption">
            This is the board from this repository, captured while
            <span class="text-[var(--violet)]">#0338</span> — the task that built this page — was
            active.
          </figcaption>
        </figure>
      </div>
    </section>

    <!-- ============ REPOOS HUB FOR MAC ============ -->
    <section class="wrap pb-20 sm:pb-24">
      <div class="panel p-6 sm:p-8">
        <div class="grid items-center gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div class="min-w-0">
            <p class="eyebrow mb-3">Mac app</p>
            <h2 class="text-[26px] font-bold leading-tight tracking-tight sm:text-[32px]">
              RepoOS Hub for Mac
            </h2>
            <p class="mt-4 max-w-[60ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
              If you run RepoOS on more than one repo, or on a remote machine, Hub puts all of those
              servers in one window. Pin tasks from different servers, see what needs you in the
              sidebar and the Dock badge, and search everything with Cmd-K. Each server gets its own
              isolated session, so cookies aren't shared. Remote access uses short-lived tokens kept
              in your Keychain.
            </p>
            <p class="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
              <a
                href="https://github.com/repo-os/repoos/releases/latest/download/RepoOSHub.dmg"
                class="text-[var(--cyan)] hover:underline"
                >Download for Mac &rarr;</a
              >
              <a :href="docsLink('/macos-hub')" class="text-[var(--cyan)] hover:underline"
                >Read the guide &rarr;</a
              >
            </p>
            <p class="mt-3 text-[12px] text-[var(--txt-faint)]">
              Current Mac builds are not notarized. After a blocked first launch, use System
              Settings &rarr; Privacy &amp; Security &rarr; Open Anyway.
            </p>
          </div>
          <ul class="grid grid-cols-2 gap-2.5 text-[13px] leading-snug text-[var(--txt-dim)]">
            <li class="rounded-lg border border-[var(--border)] px-3 py-2.5">
              Pin tasks across servers
            </li>
            <li class="rounded-lg border border-[var(--border)] px-3 py-2.5">
              Attention badges &amp; Dock badge
            </li>
            <li class="rounded-lg border border-[var(--border)] px-3 py-2.5">
              Cmd-K palette &amp; cross-server search
            </li>
            <li class="rounded-lg border border-[var(--border)] px-3 py-2.5">
              Isolated per-server sessions
            </li>
          </ul>
        </div>
        <figure class="mt-8">
          <img
            src="/hub.webp"
            alt="RepoOS Hub for Mac showing Mission Control for the RepoOS repository, with other servers listed in the sidebar"
            width="2000"
            height="1359"
            loading="lazy"
            class="block h-auto w-full"
          />
        </figure>
      </div>
    </section>

    <!-- ============ SELF-DEVELOPMENT ============ -->
    <section class="wrap pb-20 sm:pb-24">
      <div class="panel p-6 sm:p-8">
        <div class="grid items-center gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <p class="text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
            <span class="text-[var(--txt)]">We build RepoOS with RepoOS.</span> The board above is
            this repository's own. Over <span class="text-[var(--txt)]">550 tasks</span> have gone
            through the workflow described below.
          </p>
          <dl class="grid grid-cols-3 gap-2 text-center sm:gap-4">
            <div class="min-w-0">
              <dt class="text-[11px] leading-tight text-[var(--txt-faint)]">tasks completed</dt>
              <dd
                class="mt-1 whitespace-nowrap text-[22px] font-bold tracking-tight sm:text-[26px]"
              >
                550+
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-[11px] leading-tight text-[var(--txt-faint)]">built with RepoOS</dt>
              <dd
                class="mt-1 whitespace-nowrap text-[22px] font-bold tracking-tight text-[var(--green)] sm:text-[26px]"
              >
                100%
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-[11px] leading-tight text-[var(--txt-faint)]">current version</dt>
              <dd
                class="mt-1 whitespace-nowrap text-[22px] font-bold tracking-tight sm:text-[26px]"
              >
                v0.5.62
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

    <!-- ============ THE PROBLEM ============ -->
    <section id="why" class="wrap pb-20 sm:pb-24">
      <p class="eyebrow mb-3">The problem</p>
      <h2 class="max-w-[26ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
        The models got good. The process around them didn't.
      </h2>
      <div class="mt-5 grid gap-x-12 gap-y-4 lg:grid-cols-2">
        <p class="text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
          A good engineering team is more than good programmers. Work gets scoped. Changes happen on
          branches. Builds and tests have to pass. Someone reviews the result. People remember why
          decisions were made.
        </p>
        <p class="text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
          Most agent sessions start with none of that. The agent has to piece the project together
          from whatever context it's handed. Run several at once and you also have to keep their
          changes apart and decide what can merge.
          <span class="text-[var(--txt)]"
            >RepoOS keeps those working habits in the repository, where people and agents can both
            use them.</span
          >
        </p>
      </div>

      <div class="mt-10 grid gap-5 lg:grid-cols-3">
        <article class="panel p-7">
          <p class="eyebrow mb-3">Structure</p>
          <h3 class="text-[17px] font-semibold">Every task has a place</h3>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            A task is a Markdown file with a status, an owner and a branch. Starting it creates its
            own worktree.
          </p>
        </article>
        <article class="panel p-7">
          <p class="eyebrow mb-3">Process</p>
          <h3 class="text-[17px] font-semibold">Done means the checks passed</h3>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            Your project defines the checks. An agent can't skip them or declare its own work
            finished.
          </p>
        </article>
        <article class="panel p-7">
          <p class="eyebrow mb-3">Context</p>
          <h3 class="text-[17px] font-semibold">The project remembers</h3>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            Decisions and conventions live next to the code, so the next session doesn't have to
            figure them out again.
          </p>
        </article>
      </div>
    </section>

    <!-- ============ HOW IT WORKS ============ -->
    <section id="how" class="wrap pb-20 sm:pb-24">
      <p class="eyebrow mb-3">The workflow</p>
      <h2 class="max-w-[26ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
        How a task gets from an idea to merge
      </h2>
      <p class="mt-4 max-w-[60ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
        There's no ticket database. The task, its branch and its history live with the code.
      </p>

      <ol class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <li v-for="(step, i) in steps" :key="step.title" class="panel p-6">
          <span class="step-num">{{ String(i + 1).padStart(2, "0") }}</span>
          <h3 class="mt-4 text-[16.5px] font-semibold">{{ step.title }}</h3>
          <p class="mt-2 text-[13.5px] leading-relaxed text-[var(--txt-dim)]">{{ step.body }}</p>
        </li>
      </ol>
    </section>

    <!-- ============ THE TEAM ============ -->
    <section id="team" class="wrap pb-20 sm:pb-24">
      <div class="grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div>
          <p class="eyebrow mb-3">The team</p>
          <h2
            class="max-w-[22ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]"
          >
            Not one giant agent. A small engineering team.
          </h2>
          <p class="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
            Different jobs need different instructions, tools and models. RepoOS gives each role one
            job and has them all work from the same board and repository.
          </p>
          <p class="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
            Roles aren't tied to a provider. Use OpenCode, Claude Code, Codex, GitHub Copilot CLI,
            Kiro, a local model, whatever you like. Pick one per role, or override it for a single
            task. RepoOS coordinates the work. It doesn't replace your coding tools.
          </p>
          <p class="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
            Every agent run has a live transcript. If the agent's CLI reports usage, RepoOS records
            tokens and cost too. Model lists come from the agent tools themselves, so new models
            show up without a RepoOS release.
          </p>
        </div>

        <ul class="panel divide-y divide-[var(--border)] px-6 sm:px-7">
          <li
            v-for="[role, desc] in roles"
            :key="role"
            class="grid gap-1 py-5 sm:grid-cols-[110px_1fr] sm:gap-6"
          >
            <strong class="text-[15px] font-semibold">{{ role }}</strong>
            <span class="text-[14px] leading-relaxed text-[var(--txt-dim)]">{{ desc }}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- ============ DESIGN CHOICES ============ -->
    <section id="principles" class="wrap pb-20 sm:pb-24">
      <p class="eyebrow mb-3">Design choices</p>
      <h2 class="max-w-[26ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
        A few choices we made on purpose
      </h2>

      <div class="mt-10 grid gap-5 sm:grid-cols-2">
        <article v-for="choice in choices" :key="choice.title" class="panel p-7">
          <h3 class="text-[17px] font-semibold">{{ choice.title }}</h3>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">{{ choice.body }}</p>
        </article>
      </div>
    </section>

    <!-- ============ WHERE YOU FIT ============ -->
    <section class="wrap pb-20 sm:pb-24">
      <div class="panel card-glow p-8 text-center sm:p-12">
        <p class="eyebrow mb-4">Where you fit</p>
        <h2
          class="mx-auto max-w-[22ch] text-[28px] font-bold leading-tight tracking-tight sm:text-[36px]"
        >
          You still decide what ships.
        </h2>
        <p class="mx-auto mt-5 max-w-[62ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
          RepoOS takes over the tedious part of supervising agents. It doesn't replace your
          judgment.
        </p>
        <p class="mx-auto mt-4 max-w-[62ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
          You decide what's worth building, whether the result is good enough, and what lands on
          your main branch. Agents can plan, code, run checks, review each other and fix failures.
          The last step is yours.
        </p>
      </div>
    </section>

    <!-- ============ SCOPE ============ -->
    <section class="wrap pb-20 sm:pb-24">
      <p class="eyebrow mb-3">Scope</p>
      <h2 class="max-w-[26ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
        What RepoOS is not
      </h2>

      <div class="mt-8 grid gap-5 lg:grid-cols-2">
        <article v-for="item in notList" :key="item.title" class="panel p-6">
          <h3 class="text-[15.5px] font-semibold">{{ item.title }}</h3>
          <p class="mt-2.5 text-[14px] leading-relaxed text-[var(--txt-dim)]">{{ item.body }}</p>
        </article>
      </div>
    </section>

    <!-- ============ FAQ ============ -->
    <section class="wrap pb-20 sm:pb-24">
      <p class="eyebrow mb-3">FAQ</p>
      <h2 class="max-w-[24ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
        Common questions
      </h2>

      <div class="mt-8 grid gap-4 lg:grid-cols-2">
        <details class="panel group p-6">
          <summary
            class="cursor-pointer list-none text-[15.5px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden"
          >
            <span class="text-[var(--cyan)] font-mono text-[13px] mr-2">Q</span>Where does the data
            live?
          </summary>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            In your repo. Tasks are Markdown files committed alongside the code. If you can clone
            the repo, you have the whole board.
          </p>
        </details>
        <details class="panel group p-6">
          <summary
            class="cursor-pointer list-none text-[15.5px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden"
          >
            <span class="text-[var(--cyan)] font-mono text-[13px] mr-2">Q</span>Does it sync with
            Jira?
          </summary>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            No. RepoOS works from your repository, not a hosted ticket system, so there's nothing to
            sync.
          </p>
        </details>
        <details class="panel group p-6">
          <summary
            class="cursor-pointer list-none text-[15.5px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden"
          >
            <span class="text-[var(--cyan)] font-mono text-[13px] mr-2">Q</span>What stops an agent
            from breaking the primary branch?
          </summary>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            Agents work in their own branch and worktree, never in your main checkout. Nothing
            merges until your checks pass and you approve it. Agents can't approve their own work.
          </p>
        </details>
        <details class="panel group p-6">
          <summary
            class="cursor-pointer list-none text-[15.5px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden"
          >
            <span class="text-[var(--cyan)] font-mono text-[13px] mr-2">Q</span>Is it stable?
          </summary>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            We've built RepoOS with RepoOS across more than 550 tasks. Every feature and fix went
            through the same checks and review you'd be using. It's still pre-1.0 and changing
            quickly.
          </p>
        </details>
        <details class="panel group p-6">
          <summary
            class="cursor-pointer list-none text-[15.5px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden"
          >
            <span class="text-[var(--cyan)] font-mono text-[13px] mr-2">Q</span>Do I have to start a
            new project?
          </summary>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            No. Run <span class="font-mono text-[13px]">repoos init</span> in a repo you already
            have. It adds a folder for tasks, a folder for docs, an
            <span class="font-mono text-[13px]">AGENTS.md</span> file and a config file, plus a few
            <span class="font-mono text-[13px]">.gitignore</span> entries. Nothing else in the repo
            changes. It works on a new repo too.
          </p>
        </details>
        <details class="panel group p-6">
          <summary
            class="cursor-pointer list-none text-[15.5px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden"
          >
            <span class="text-[var(--cyan)] font-mono text-[13px] mr-2">Q</span>How much setup does
            it need?
          </summary>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            Not much. Pick your agents and define your checks. As they work, the agents write what
            they learn about the project into its docs, so later sessions start with that context.
          </p>
        </details>
      </div>

      <!-- closing CTA -->
      <div class="panel card-glow mt-12 p-8 text-center sm:p-10">
        <h2 class="text-[24px] font-bold tracking-tight sm:text-[28px]">
          Try it on a repo you already have
        </h2>
        <p class="mx-auto mt-4 max-w-[56ch] text-[14.5px] leading-relaxed text-[var(--txt-dim)]">
          Install RepoOS and run <span class="font-mono text-[13.5px]">repoos init</span> inside a
          repo. It sets things up and opens the board in your browser. Then add tasks, choose agents
          and review their work.
        </p>
        <div class="mx-auto mt-6 flex justify-center">
          <InstallBox />
        </div>
        <a
          :href="docsLink()"
          class="mt-5 inline-block text-[13px] text-[var(--cyan)] hover:underline"
          >Read the docs &rarr;</a
        >
      </div>
    </section>
  </main>

  <footer class="foot">
    <div class="wrap flex flex-col items-center justify-between gap-4 py-8 sm:flex-row">
      <div class="flex items-center gap-2.5">
        <SiteLogo class="h-5 w-5" :size="20" />
        <span class="text-[13.5px] font-semibold">RepoOS</span>
        <span class="text-[13px] text-[var(--txt-faint)]"
          >&mdash; the repo is the operating system</span
        >
      </div>
      <p class="text-[12px] text-[var(--txt-faint)]">
        This page was built as task
        <a href="https://github.com/repo-os/repoos" class="text-[var(--violet)] hover:underline"
          >#0338</a
        >
        on RepoOS's own board &middot; &copy; {{ year }}
      </p>
    </div>
  </footer>
</template>
