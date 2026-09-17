<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import InstallBox from "./components/InstallBox.vue";

type Theme = "dark" | "light";
const THEME_KEY = "repoos-theme";
const theme = ref<Theme>("dark");

function applyTheme(next: Theme): void {
  theme.value = next;
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Private mode / blocked storage: the toggle still works for this visit.
  }
}

function toggleTheme(): void {
  applyTheme(theme.value === "dark" ? "light" : "dark");
}

// Mobile nav. The inline links need ~686px to fit beside the logo, so they're
// hidden below Tailwind's md (768px) and reachable through this menu instead.
const menuOpen = ref(false);
const DESKTOP_NAV = "(min-width: 768px)";

function closeMenu(): void {
  menuOpen.value = false;
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") closeMenu();
}

let desktopQuery: MediaQueryList | undefined;

onMounted(() => {
  // index.html resolves the theme (stored choice, else prefers-color-scheme)
  // and applies it before first paint to avoid a flash. Read it back so the
  // toggle's initial state matches what's actually on screen.
  theme.value = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";

  // An open menu must not survive a resize past the breakpoint, or it lingers
  // as a stray panel under a nav that already shows every link inline.
  desktopQuery = window.matchMedia(DESKTOP_NAV);
  desktopQuery.addEventListener("change", closeMenu);
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  desktopQuery?.removeEventListener("change", closeMenu);
  window.removeEventListener("keydown", onKeydown);
});

const steps = [
  {
    title: "Write the task",
    body: "Add a task on the board, or give the PM agent a rough idea and let it write the spec. Each task is a Markdown file in the repo, so people and agents read the same thing.",
  },
  {
    title: "An agent picks it up",
    body: "RepoOS creates a branch and worktree, then hands the task to the coding agent you configured. Active tasks never share a checkout.",
  },
  {
    title: "The checks run",
    body: "RepoOS runs the checks your project defines: build, typecheck, tests, UI smoke tests or whatever else the repo needs. Work that fails them doesn't move forward.",
  },
  {
    title: "You approve",
    body: "The agent can implement, test and review the work. It cannot approve its own merge. You decide what reaches main.",
  },
];

const choices = [
  {
    title: "Everything lives in Git",
    body: "Tasks, docs and inputs are ordinary files. You can search, edit, diff and blame them with the tools you already use. There is no second project database to keep in sync.",
  },
  {
    title: "One task, one worktree",
    body: "Each active task gets its own branch and checkout, so agents can work at the same time without overwriting each other's files. RepoOS removes the worktree once the task is done.",
  },
  {
    title: "Project-defined checks",
    body: "RepoOS runs the checks that matter for your codebase. A Go API, a Vue app and a Python library don't need the same definition of done.",
  },
  {
    title: "Zero runtime dependencies",
    body: "What you install is plain JavaScript that runs on Bun or Node. Development dependencies are fine; the package you run has none.",
  },
];

const roles = [
  ["PM", "Turns a rough idea, question or bug report into a task an engineer can act on."],
  ["Engineer", "Implements the task in its own branch and worktree."],
  ["Reviewer", "Reads the spec and the diff, and reports concrete problems before you look at it."],
  ["Debugger", "Takes failed checks and works from the evidence instead of restarting the task."],
  ["CTO", "Watches the board for stuck work, technical debt and decisions that need a human."],
];

const notList = [
  {
    title: "Not a hosted copy of your project",
    body: "The repository is the source of truth. The UI is a view of files and state you own.",
  },
  {
    title: "Not an AI layer on Jira",
    body: "RepoOS works with the things that change code: tasks, branches, worktrees, checks, reviews and merges.",
  },
  {
    title: "Not an agent demo environment",
    body: "It's built for ongoing work on real repositories, with isolation, repeatable checks and an audit trail.",
  },
  {
    title: "Not tied to one model",
    body: "Bring your own agents and providers. Run them locally or in the cloud, and change them as the tooling improves.",
  },
];

const year = new Date().getFullYear();
</script>

<template>
  <header class="site-nav">
    <div class="wrap flex h-[58px] items-center justify-between">
      <a href="#top" class="flex items-center gap-2.5">
        <img src="./assets/logo.svg" alt="" class="h-7 w-7" width="28" height="28" />
        <span class="text-[15px] font-bold tracking-tight">RepoOS</span>
      </a>
      <nav class="flex items-center gap-6">
        <a href="#why" class="nav-link hidden md:block">The problem</a>
        <a href="#how" class="nav-link hidden md:block">How it works</a>
        <a href="#team" class="nav-link hidden md:block">The team</a>
        <a href="#principles" class="nav-link hidden md:block">Design</a>
        <a href="https://docs.repoos.org" class="nav-link hidden md:block">Docs</a>
        <button
          type="button"
          class="theme-toggle"
          :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          :title="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          @click="toggleTheme"
        >
          <svg
            v-if="theme === 'dark'"
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
        <a
          href="https://github.com/repo-os/repoos"
          class="hidden items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] text-[var(--txt-dim)] transition-colors hover:border-[rgba(57,224,255,0.4)] hover:text-[var(--txt)] md:flex"
        >
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
        <a href="https://docs.repoos.org" class="nav-menu-link" @click="closeMenu">Docs</a>
        <a href="https://github.com/repo-os/repoos" class="nav-menu-link" @click="closeMenu"
          >GitHub</a
        >
      </div>
    </div>
  </header>

  <main id="top">
    <!-- ============ HERO ============ -->
    <section class="wrap pt-16 pb-14 sm:pt-24 sm:pb-20">
      <div class="grid items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div>
          <p class="eyebrow mb-5">For CTOs and builders</p>
          <h1 class="text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-[54px]">
            The repo is the<br />
            operating system.
          </h1>
          <p class="mt-6 max-w-[50ch] text-[17px] leading-relaxed text-[var(--txt)]">
            RepoOS gives coding agents a practical way to work on a real codebase: written tasks,
            isolated worktrees, project context, checks, review and human approval. It all lives in
            Git.
          </p>
          <p class="mt-4 max-w-[50ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
            Coding agents can write good code. The harder part is getting them to work for hours or
            days without losing context, duplicating work, breaking earlier decisions or getting in
            each other's way. RepoOS is the machinery around the agents that handles that.
          </p>

          <InstallBox class="mt-8" show-note />
        </div>

        <figure class="min-w-0">
          <div class="shot-frame">
            <div class="term-bar">
              <span class="term-dot" style="background: #ff6b7d"></span>
              <span class="term-dot" style="background: #ffb454"></span>
              <span class="term-dot" style="background: #4ef0a8"></span>
              <span class="term-title">RepoOS &mdash; work board</span>
            </div>
            <img
              src="/board.webp"
              alt="RepoOS work board: a kanban of task cards, with task #0338 — this landing page — active in the coding column"
              width="1200"
              height="750"
              fetchpriority="high"
            />
          </div>
          <figcaption
            class="mt-4 border-l-2 border-[rgba(157,123,255,0.4)] pl-3.5 text-[13px] leading-relaxed text-[var(--txt-dim)]"
          >
            This is the board RepoOS uses for its own development. The active task,
            <span class="text-[var(--violet)]">#0338</span>, is the one that built this page.
          </figcaption>
        </figure>
      </div>
    </section>

    <!-- ============ DOGFOODING ============ -->
    <section class="wrap pb-20 sm:pb-24">
      <div class="panel p-6 sm:p-8">
        <div class="grid items-center gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <p class="text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
            <span class="text-[var(--txt)]">RepoOS manages its own development.</span> The board,
            tasks and status shown on this page come from the same repository used to build the
            project, and every change went through the process described below.
          </p>
          <dl class="grid grid-cols-3 gap-4 text-center">
            <div>
              <dt class="text-[12px] text-[var(--txt-faint)]">tasks</dt>
              <dd class="mt-1 text-[26px] font-bold tracking-tight">306</dd>
            </div>
            <div>
              <dt class="text-[12px] text-[var(--txt-faint)]">done</dt>
              <dd class="mt-1 text-[26px] font-bold tracking-tight text-[var(--green)]">273</dd>
            </div>
            <div>
              <dt class="text-[12px] text-[var(--txt-faint)]">version</dt>
              <dd class="mt-1 text-[26px] font-bold tracking-tight">0.5.41</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

    <!-- ============ THE PROBLEM ============ -->
    <section id="why" class="wrap pb-20 sm:pb-24">
      <p class="eyebrow mb-3">The problem</p>
      <h2 class="max-w-[26ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
        The models got good. The scaffolding didn't.
      </h2>
      <div class="mt-5 grid gap-x-12 gap-y-4 lg:grid-cols-2">
        <p class="text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
          A useful engineering team is more than a group of good programmers. Work gets scoped.
          Changes happen in isolation. Builds and tests have to pass. Someone reviews the result.
          The team remembers why earlier decisions were made.
        </p>
        <p class="text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
          Most coding-agent sessions start without much of that structure. Each agent has to
          reconstruct the project from the context it receives. If several agents work at once, you
          also need a reliable way to keep their changes separate and decide what can merge.
          <span class="text-[var(--txt)]"
            >RepoOS puts those working conventions in the repository, where humans and agents can
            both use them.</span
          >
        </p>
      </div>

      <div class="mt-10 grid gap-5 lg:grid-cols-3">
        <article class="panel p-7">
          <p class="eyebrow mb-3">Structure</p>
          <h3 class="text-[17px] font-semibold">Every task has a place</h3>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            A task is a Markdown file with a status, owner and branch. Starting it creates a
            dedicated worktree.
          </p>
        </article>
        <article class="panel p-7">
          <p class="eyebrow mb-3">Process</p>
          <h3 class="text-[17px] font-semibold">Done means the checks passed</h3>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            The project defines its checks. An agent cannot skip them or decide by itself that the
            work is finished.
          </p>
        </article>
        <article class="panel p-7">
          <p class="eyebrow mb-3">Context</p>
          <h3 class="text-[17px] font-semibold">The project remembers</h3>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            Decisions and conventions live beside the code, so the next session doesn't need to
            rediscover them.
          </p>
        </article>
      </div>
    </section>

    <!-- ============ HOW IT WORKS ============ -->
    <section id="how" class="wrap pb-20 sm:pb-24">
      <p class="eyebrow mb-3">The workflow</p>
      <h2 class="max-w-[26ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
        How a task gets from an idea to main
      </h2>
      <p class="mt-4 max-w-[60ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
        No separate ticket database is required. The task, its branch and its history travel with
        the code.
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
            Different jobs benefit from different instructions, tools and models. RepoOS gives each
            role a bounded job and lets them work from the same board and repository.
          </p>
          <p class="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
            Roles aren't tied to one provider. Use OpenCode, Claude Code, Codex, GitHub Copilot CLI,
            Kiro, local models or something else. Choose them per role, or override them for a
            particular task. RepoOS coordinates the work; it doesn't replace the coding tools.
          </p>
          <p class="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
            Every agent run has a live transcript and token and cost tracking, and model lists come
            from the agent tools themselves, so new models show up without waiting on a RepoOS
            release.
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
        A few things RepoOS does deliberately
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
          RepoOS removes the mechanical work of supervising agents. It doesn't replace your
          judgment.
        </p>
        <p class="mx-auto mt-4 max-w-[62ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
          You decide what's worth building, whether the implementation is good enough and what
          reaches main. Agents can plan, code, run checks, review each other's work and fix
          failures. The final move stays with you.
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
            No. RepoOS is built around the repository rather than a hosted ticket system, so there
            is nothing to sync.
          </p>
        </details>
        <details class="panel group p-6">
          <summary
            class="cursor-pointer list-none text-[15.5px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden"
          >
            <span class="text-[var(--cyan)] font-mono text-[13px] mr-2">Q</span>What stops an agent
            from breaking main?
          </summary>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            Agents work in their own branch and worktree, never on main. Nothing merges until the
            project's checks pass and you approve it. Agents can't approve their own work.
          </p>
        </details>
        <details class="panel group p-6">
          <summary
            class="cursor-pointer list-none text-[15.5px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden"
          >
            <span class="text-[var(--cyan)] font-mono text-[13px] mr-2">Q</span>Is it stable?
          </summary>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            RepoOS has been used to build itself across 300+ tasks. Every feature and fix on its
            board went through the same checks and review you would be using.
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
            Not much. You pick your agents and define the checks your project needs. Over time the
            agents write what they learn about the project into its docs, so later sessions start
            with that context.
          </p>
        </details>
      </div>

      <!-- closing CTA -->
      <div class="panel card-glow mt-12 p-8 text-center sm:p-10">
        <h2 class="text-[24px] font-bold tracking-tight sm:text-[28px]">
          Try it on a repo you already have
        </h2>
        <p class="mx-auto mt-4 max-w-[56ch] text-[14.5px] leading-relaxed text-[var(--txt-dim)]">
          Install RepoOS, then run <span class="font-mono text-[13.5px]">repoos init</span> inside a
          repo. It sets up the project and opens the board in your browser. From there you add
          tasks, choose agents and review work in the UI.
        </p>
        <div class="mx-auto mt-6 flex justify-center">
          <InstallBox />
        </div>
        <a
          href="https://docs.repoos.org"
          class="mt-5 inline-block text-[13px] text-[var(--cyan)] hover:underline"
          >Read the docs &rarr;</a
        >
      </div>
    </section>
  </main>

  <footer class="foot">
    <div class="wrap flex flex-col items-center justify-between gap-4 py-8 sm:flex-row">
      <div class="flex items-center gap-2.5">
        <img src="./assets/logo.svg" alt="" class="h-5 w-5" width="20" height="20" />
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
