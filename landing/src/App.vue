<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

const INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/repo-os/repoos/main/install.sh | bash";

const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;

async function copyInstall(): Promise<void> {
  try {
    await navigator.clipboard.writeText(INSTALL_CMD);
  } catch {
    // Clipboard API can be denied (e.g. non-secure context). Fall back to a
    // hidden textarea so the button still works on http:// previews.
    const ta = document.createElement("textarea");
    ta.value = INSTALL_CMD;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  copied.value = true;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copied.value = false), 1600);
}

onBeforeUnmount(() => clearTimeout(copyTimer));

const year = new Date().getFullYear();
</script>

<template>
  <header class="site-nav">
    <div class="wrap flex h-[58px] items-center justify-between">
      <a href="#top" class="flex items-center gap-2.5">
        <img src="./assets/logo.svg" alt="" class="h-7 w-7" width="28" height="28" />
        <span class="text-[15px] font-bold tracking-tight">RepoOS</span>
        <span
          class="ml-1 rounded-md border border-[var(--border)] bg-[rgba(120,140,200,0.08)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--txt-dim)]"
          >v0.5.41</span
        >
      </a>
      <nav class="flex items-center gap-6">
        <a href="#how" class="nav-link hidden sm:block">How it works</a>
        <a href="#principles" class="nav-link hidden sm:block">Principles</a>
        <a href="#agents" class="nav-link hidden sm:block">Agents</a>
        <a
          href="https://github.com/repo-os/repoos"
          class="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] text-[var(--txt-dim)] transition-colors hover:border-[rgba(57,224,255,0.4)] hover:text-[var(--txt)]"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" class="h-3.5 w-3.5" aria-hidden="true">
            <path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
            />
          </svg>
          GitHub
        </a>
      </nav>
    </div>
  </header>

  <main id="top">
    <!-- ============ HERO ============ -->
    <section class="wrap pt-16 pb-14 sm:pt-24 sm:pb-20">
      <div class="grid items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div>
          <p class="eyebrow mb-5">work/*.md &middot; git worktrees &middot; agents</p>
          <h1 class="text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-[54px]">
            The repo is the<br />
            operating system.
          </h1>
          <p class="mt-6 max-w-[46ch] text-[16.5px] leading-relaxed text-[var(--txt-dim)]">
            RepoOS runs software work like an OS runs processes. Tasks are Markdown files under
            <code class="font-mono text-[14.5px] text-[var(--cyan)]">work/</code>, an AI coding
            agent works them in a git worktree, and
            <code class="font-mono text-[14.5px] text-[var(--cyan)]">repoos check</code> is the only
            bar for done.
          </p>

          <div class="install-box mt-8">
            <span class="dollar font-mono text-[13.5px]">$</span>
            <code>{{ INSTALL_CMD }}</code>
            <button
              class="copy-btn"
              :class="{ copied }"
              type="button"
              :aria-label="copied ? 'Copied' : 'Copy install command'"
              @click="copyInstall"
            >
              <svg
                v-if="!copied"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                class="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {{ copied ? "copied" : "copy" }}
            </button>
          </div>

          <p class="mt-4 font-mono text-[12px] text-[var(--txt-faint)]">
            // requires Node &ge; 20.6.0 &middot; no account, no telemetry
          </p>
        </div>

        <figure class="min-w-0">
          <div class="shot-frame">
            <div class="term-bar">
              <span class="term-dot" style="background: #ff6b7d"></span>
              <span class="term-dot" style="background: #ffb454"></span>
              <span class="term-dot" style="background: #4ef0a8"></span>
              <span class="term-title">repoos serve &mdash; work board</span>
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
            class="mt-4 border-l-2 border-[rgba(157,123,255,0.4)] pl-3.5 font-mono text-[12px] leading-relaxed text-[var(--txt-dim)]"
          >
            This is RepoOS's own board, running this repo. The active task &mdash;
            <span class="text-[var(--violet)]">#0338</span> &mdash; is the agent writing the page
            you're reading.
          </figcaption>
        </figure>
      </div>
    </section>

    <!-- ============ STAT BAR ============ -->
    <section class="wrap pb-20 sm:pb-24">
      <div class="term card-glow">
        <div class="term-bar">
          <span class="term-dot" style="background: #ff6b7d"></span>
          <span class="term-dot" style="background: #ffb454"></span>
          <span class="term-dot" style="background: #4ef0a8"></span>
          <span class="term-title">~/code/nick/repoos</span>
        </div>
        <div class="term-body">
          <div><span class="prompt">$</span> <span class="cmd">repoos status</span></div>
          <div class="out">
            board&nbsp;&nbsp;&nbsp;&nbsp;<span class="num">306</span> tasks &middot; draft
            <span class="num">5</span> &middot; inbox <span class="num">19</span> &middot; ready
            <span class="num">7</span> &middot; active <span class="num">1</span> &middot; review
            <span class="num">1</span> &middot; done <span class="ok">273</span>
          </div>
          <div class="out">
            server&nbsp;&nbsp;<span class="ok">&#9679;</span> running &middot; self-hosted on this
            repo &middot; repoos v0.5.41<span class="cursor" aria-hidden="true"></span>
          </div>
        </div>
      </div>
      <p class="mt-4 text-center text-[13px] text-[var(--txt-faint)]">
        Not testimonials. This is RepoOS managing its own development &mdash; board numbers from
        <span class="font-mono">repoos status</span>, live since task #0001.
      </p>
    </section>

    <!-- ============ HOW IT WORKS ============ -->
    <section id="how" class="wrap pb-20 sm:pb-24">
      <p class="eyebrow mb-3">The lifecycle</p>
      <h2 class="max-w-[24ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
        A task file becomes merged work. In that order.
      </h2>
      <p class="mt-4 max-w-[60ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
        No plugin, no hosted service, no second source of truth. The sequence is enforced by the
        tooling, which is why the numbers below are ordered.
      </p>

      <ol class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <li class="panel p-6">
          <div class="flex items-center justify-between">
            <span class="step-num">01</span>
            <span class="font-mono text-[11px] text-[var(--txt-faint)]">work/0338*.md</span>
          </div>
          <h3 class="mt-4 text-[16.5px] font-semibold">
            <span class="font-mono text-[var(--cyan)]">repoos new</span>
          </h3>
          <p class="mt-2 text-[13.5px] leading-relaxed text-[var(--txt-dim)]">
            A task is a Markdown file: YAML frontmatter for the machine, prose for everyone else.
            It's committed to the branch with the work.
          </p>
        </li>
        <li class="panel p-6">
          <div class="flex items-center justify-between">
            <span class="step-num">02</span>
            <span class="font-mono text-[11px] text-[var(--txt-faint)]">.worktrees/feat/…</span>
          </div>
          <h3 class="mt-4 text-[16.5px] font-semibold">An agent picks it up</h3>
          <p class="mt-2 text-[13.5px] leading-relaxed text-[var(--txt-dim)]">
            RepoOS checks out a git worktree on a task branch and hands the spec to your coding
            agent. One task, one worktree &mdash; agents never collide on main.
          </p>
        </li>
        <li class="panel p-6">
          <div class="flex items-center justify-between">
            <span class="step-num">03</span>
            <span class="font-mono text-[11px] text-[var(--txt-faint)]">build · test · smoke</span>
          </div>
          <h3 class="mt-4 text-[16.5px] font-semibold">
            <span class="font-mono text-[var(--cyan)]">repoos check</span>
          </h3>
          <p class="mt-2 text-[13.5px] leading-relaxed text-[var(--txt-dim)]">
            The gate: fresh build, typecheck, full test suite, headless UI smoke test. Not green
            &mdash; not done. There is no override flag.
          </p>
        </li>
        <li class="panel p-6">
          <div class="flex items-center justify-between">
            <span class="step-num">04</span>
            <span class="font-mono text-[11px] text-[var(--green)]">fast-forward only</span>
          </div>
          <h3 class="mt-4 text-[16.5px] font-semibold">A human signs off</h3>
          <p class="mt-2 text-[13.5px] leading-relaxed text-[var(--txt-dim)]">
            The agent reviews its own work; you decide. Moving a task to done is the only path to
            <span class="font-mono text-[var(--txt)]">main</span> &mdash; the agent never merges
            itself.
          </p>
        </li>
      </ol>
    </section>

    <!-- ============ PRINCIPLES ============ -->
    <section id="principles" class="wrap pb-20 sm:pb-24">
      <p class="eyebrow mb-3">Design constraints</p>
      <h2 class="max-w-[26ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
        Three decisions that shape everything else
      </h2>

      <div class="mt-10 grid gap-5 lg:grid-cols-3">
        <article class="panel p-7">
          <h3 class="text-[17px] font-semibold">The data lives in your repo</h3>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            Tasks, docs, and inputs are files under version control. Grep works, editors work, git
            blame works. Backups are pushes; data models by committee don't happen.
          </p>
          <p class="mt-4 font-mono text-[12px] text-[var(--txt-faint)]">
            $ grep -r "status: ready" work/
          </p>
        </article>
        <article class="panel p-7">
          <h3 class="text-[17px] font-semibold">One task, one worktree</h3>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            Agents never share a checkout, so they can't clobber each other. Every task gets its own
            branch and worktree; RepoOS reaps them when the task is done.
          </p>
          <p class="mt-4 font-mono text-[12px] text-[var(--txt-faint)]">
            git worktree add .worktrees/feat/…
          </p>
        </article>
        <article class="panel p-7">
          <h3 class="text-[17px] font-semibold">Zero runtime dependencies</h3>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            A hard constraint, not a preference. Dev dependencies are fine; the built product is
            plain Node &mdash; install, run, done. The supply chain you ship is the one you read.
          </p>
          <p class="mt-4 font-mono text-[12px] text-[var(--txt-faint)]">$ ls package.json</p>
        </article>
      </div>
    </section>

    <!-- ============ AGENTS ============ -->
    <section id="agents" class="wrap pb-20 sm:pb-24">
      <div class="grid items-center gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <div class="order-2 lg:order-1">
          <div class="file-card">
            <div class="term-bar">
              <span class="term-dot" style="background: #ff6b7d"></span>
              <span class="term-dot" style="background: #ffb454"></span>
              <span class="term-dot" style="background: #4ef0a8"></span>
              <span class="term-title">work/0338-build-repoos-org-landing-page-cloudflare.md</span>
            </div>
            <pre><span class="text-[var(--txt-faint)]">---</span>
<span class="text-[var(--txt-dim)]">id:</span> <span class="text-[var(--green)]">"0338"</span>
<span class="text-[var(--txt-dim)]">title:</span> <span class="text-[var(--green)]">Build repoos.org landing page (Cloudflare Pages)</span>
<span class="text-[var(--txt-dim)]">type:</span> <span class="text-[var(--green)]">feature</span>
<span class="text-[var(--txt-dim)]">status:</span> <span class="text-[var(--cyan)]">active</span>
<span class="text-[var(--txt-dim)]">priority:</span> <span class="text-[var(--amber)]">p2</span>
<span class="text-[var(--txt-dim)]">area:</span> <span class="text-[var(--green)]">web</span>
<span class="text-[var(--txt-dim)]">assigned_to:</span> <span class="text-[var(--green)]">ai</span>
<span class="text-[var(--txt-dim)]">branch:</span> <span class="text-[var(--green)]">feat/build-repoos-org-landing-page-cloudflare</span>
<span class="text-[var(--txt-faint)]">---</span>
<span class="text-[var(--txt-faint)]">Build a static marketing site for repoos.org&hellip;</span></pre>
          </div>
          <p class="mt-4 text-center font-mono text-[12px] text-[var(--txt-faint)]">
            // this page's own task file, verbatim frontmatter
          </p>
        </div>

        <div class="order-1 lg:order-2">
          <p class="eyebrow mb-3">Agents</p>
          <h2
            class="max-w-[22ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]"
          >
            Bring your own coding agent
          </h2>
          <p class="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-[var(--txt-dim)]">
            RepoOS orchestrates the CLIs you already have &mdash; opencode, codex, Claude Code,
            GitHub Copilot CLI, kiro &mdash; per task. Model catalogs are read from the agents
            themselves, not hardcoded into a wrapper.
          </p>
          <ul class="mt-6 space-y-2.5">
            <li
              v-for="line in [
                ['Per-task agent and model override', 'pm_model_override: opencode-go/…'],
                ['Live transcripts and spend tracking', 'tokens + $, per session'],
                ['Status moves are API calls, not vibes', 'PATCH /api/tasks/:id'],
              ]"
              :key="line[0]"
              class="flex items-start gap-3 text-[14px] text-[var(--txt-dim)]"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                class="mt-0.5 h-4 w-4 flex-none text-[var(--green)]"
                aria-hidden="true"
              >
                <path
                  d="m5 10.5 3.2 3.2L15 7"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span
                >{{ line[0] }}
                <span class="font-mono text-[11.5px] text-[var(--txt-faint)]">{{
                  line[1]
                }}</span></span
              >
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- ============ FAQ ============ -->
    <section class="wrap pb-20 sm:pb-24">
      <p class="eyebrow mb-3">FAQ</p>
      <h2 class="max-w-[24ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
        Questions, answered directly
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
            In your repo. <span class="font-mono text-[13px]">work/*.md</span> for tasks, committed
            to the branch. If you can clone it, you can read the board.
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
            No. The board is a directory of files, not a hosted service to integrate with. Teams
            that want Jira already have Jira.
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
            Work happens in a worktree, not on main. Nothing merges until
            <span class="font-mono text-[13px]">repoos check</span> is green and a human signs off
            &mdash; the agent physically can't do it itself.
          </p>
        </details>
        <details class="panel group p-6">
          <summary
            class="cursor-pointer list-none text-[15.5px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden"
          >
            <span class="text-[var(--cyan)] font-mono text-[13px] mr-2">Q</span>Is it stable?
          </summary>
          <p class="mt-3 text-[14px] leading-relaxed text-[var(--txt-dim)]">
            It's v0.5.x and it runs its own development &mdash; 306 tasks and counting. Early,
            moving fast, and the dogfooding is not a metaphor.
          </p>
        </details>
      </div>

      <!-- closing CTA -->
      <div class="panel card-glow mt-12 p-8 text-center sm:p-10">
        <h2 class="text-[24px] font-bold tracking-tight sm:text-[28px]">Run your repo like one.</h2>
        <div class="install-box mx-auto mt-6">
          <span class="dollar font-mono text-[13.5px]">$</span>
          <code>{{ INSTALL_CMD }}</code>
          <button
            class="copy-btn"
            :class="{ copied }"
            type="button"
            :aria-label="copied ? 'Copied' : 'Copy install command'"
            @click="copyInstall"
          >
            <svg
              v-if="!copied"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              class="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {{ copied ? "copied" : "copy" }}
          </button>
        </div>
        <p class="mt-5 font-mono text-[12px] text-[var(--txt-faint)]">
          then: <span class="text-[var(--txt-dim)]">repoos init</span> &middot;
          <span class="text-[var(--txt-dim)]">repoos new</span> &middot;
          <span class="text-[var(--txt-dim)]">repoos check</span>
        </p>
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
      <p class="font-mono text-[11.5px] text-[var(--txt-faint)]">
        this page is task
        <a href="https://github.com/repo-os/repoos" class="text-[var(--violet)] hover:underline"
          >#0338</a
        >
        on this repo's board &middot; &copy; {{ year }}
      </p>
    </div>
  </footer>
</template>
