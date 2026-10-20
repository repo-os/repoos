<script setup lang="ts">
import { ref } from "vue";
import EnquiryForm from "./EnquiryForm.vue";
import "../clients.css";
defineProps<{ homeLink: string }>();
const enquiry = ref<InstanceType<typeof EnquiryForm>>();
</script>
<template>
  <main id="top" class="wrap clients-page">
    <section class="clients-hero">
      <div>
        <div class="clients-eyebrow">Custom software · Personally led</div>
        <h1>Your software.<br />Built with <span>RepoOS.</span></h1>
        <p class="clients-lead">
          You bring the business problem. We turn it into working software — using RepoOS to
          coordinate the AI team, with us accountable for the result.
        </p>
        <div class="clients-actions">
          <button class="clients-primary" type="button" @click="enquiry?.open()">
            Tell us about your project <span>↗</span></button
          ><a class="clients-text-link" href="#process">See how we'll work ↓</a>
        </div>
        <div class="clients-small-note">
          Start with a conversation. No technical brief required.
        </div>
      </div>
      <div>
        <div class="clients-demo" aria-label="Illustrative client project board">
          <div class="clients-window-bar">
            <i class="clients-dot"></i><i class="clients-dot"></i><i class="clients-dot"></i
            ><span class="clients-label">RepoOS / your project</span>
          </div>
          <div class="clients-demo-content">
            <div class="clients-project-top">
              <strong>Customer operations portal</strong><span class="clients-tag">SPRINT 02</span>
            </div>
            <div class="clients-project-desc">A shared view of what's being built, and why.</div>
            <div class="clients-board">
              <div>
                <div class="clients-col-title"><i class="clients-status-dot"></i>Planned</div>
                <div class="clients-card">
                  <span class="clients-id">#012</span>
                  <p>Monthly reporting dashboard</p>
                  <small>Scoped & ready</small>
                </div>
                <div class="clients-card">
                  <span class="clients-id">#014</span>
                  <p>Customer notifications</p>
                  <small>Next up</small>
                </div>
              </div>
              <div>
                <div class="clients-col-title">
                  <i class="clients-status-dot clients-cyan"></i>Building
                </div>
                <div class="clients-card clients-highlight">
                  <span class="clients-id">#009</span>
                  <p>Customer self-service portal</p>
                  <small>◌ Engineer working</small>
                </div>
              </div>
              <div>
                <div class="clients-col-title">
                  <i class="clients-status-dot clients-green"></i>Reviewed
                </div>
                <div class="clients-card">
                  <span class="clients-id">#006</span>
                  <p>Team access & permissions</p>
                  <small>✓ Checks passed</small>
                </div>
                <div class="clients-card">
                  <span class="clients-id">#007</span>
                  <p>Import existing customer data</p>
                  <small>✓ Checks passed</small>
                </div>
              </div>
            </div>
            <div class="clients-review">
              <span class="clients-avatar" aria-hidden="true">R</span>
              <div>
                <strong>Human direction. Every step.</strong
                ><small>We scope the work, review the changes, and own delivery.</small>
              </div>
            </div>
          </div>
        </div>
        <div class="clients-demo-caption">ILLUSTRATIVE PROJECT · REAL VISIBILITY INTO THE WORK</div>
      </div>
    </section>
    <div class="clients-assurances">
      <span>One person accountable</span><span>Clear scope & milestones</span
      ><span>Visible progress</span><span>Your code, your project</span>
    </div>
    <section class="clients-section" id="projects">
      <div class="clients-section-intro">
        <div>
          <div class="clients-eyebrow">What we can build</div>
          <h2>Software that fits<br />the way you work.</h2>
        </div>
        <p>When spreadsheets, disconnected tools, or off-the-shelf software stop being enough.</p>
      </div>
      <div class="clients-usecases">
        <article class="clients-usecase">
          <div class="clients-icon">⌘</div>
          <h3>Tools for your team</h3>
          <p>
            Replace the manual work and awkward workarounds with a system built around your
            operations.
          </p>
          <div class="clients-examples">DASHBOARDS / WORKFLOWS / INTERNAL APPS</div>
        </article>
        <article class="clients-usecase">
          <div class="clients-icon">↗</div>
          <h3>Products for your customers</h3>
          <p>
            Turn an idea into a focused first version, or give your customers a better way to work
            with you.
          </p>
          <div class="clients-examples">WEB APPS / CLIENT PORTALS / MVPs</div>
        </article>
        <article class="clients-usecase">
          <div class="clients-icon">⇄</div>
          <h3>Systems that work together</h3>
          <p>
            Connect the tools you already use, reduce duplicate entry, and make your data more
            useful.
          </p>
          <div class="clients-examples">INTEGRATIONS / AUTOMATION / REPORTING</div>
        </article>
      </div>
    </section>
    <section class="clients-section" id="process">
      <div class="clients-section-intro">
        <div>
          <div class="clients-eyebrow">The engagement</div>
          <h2>A direct line from<br />your idea to working software.</h2>
        </div>
        <p>
          You work directly with us. RepoOS gives the project structure; we bring the judgment and
          keep things moving.
        </p>
      </div>
      <div class="clients-process">
        <article class="clients-step">
          <span class="clients-number">01 / UNDERSTAND</span>
          <h3>Start with the problem</h3>
          <p>
            We talk through your business, your users, and what success looks like. We'll help
            identify a useful first release.
          </p>
        </article>
        <article class="clients-step">
          <span class="clients-number">02 / AGREE</span>
          <h3>Make the scope clear</h3>
          <p>
            We agree on deliverables, milestones, budget, and responsibilities before the build
            begins.
          </p>
        </article>
        <article class="clients-step">
          <span class="clients-number">03 / BUILD</span>
          <h3>See it take shape</h3>
          <p>
            We direct the work in RepoOS, review changes, and share working demos so your feedback
            can guide the next step.
          </p>
        </article>
        <article class="clients-step">
          <span class="clients-number">04 / LAUNCH</span>
          <h3>Put it to work</h3>
          <p>
            We prepare for launch, hand over the code and documentation, and agree on any ongoing
            support you need.
          </p>
        </article>
      </div>
    </section>
    <section class="clients-section clients-ownership">
      <div>
        <div class="clients-eyebrow">A service, built on an open platform</div>
        <h2>Hire the person.<br />Get the system behind them.</h2>
        <p class="clients-lead">
          RepoOS is the platform we use to organize development. This service is us using it to
          deliver your project — so you don't have to manage the tooling or coordinate AI agents
          yourself.
        </p>
        <a class="clients-text-link" :href="homeLink"
          >Curious about the platform? Explore RepoOS ↗</a
        >
      </div>
      <div class="clients-deliverables">
        <div class="clients-deliverable">
          <span class="clients-check">✓</span>
          <div>
            <strong>A named person responsible</strong>
            <p>Product decisions, technical direction, and a direct point of contact.</p>
          </div>
        </div>
        <div class="clients-deliverable">
          <span class="clients-check">✓</span>
          <div>
            <strong>Work you can follow</strong>
            <p>Agreed milestones, regular demos, and a clear record of decisions.</p>
          </div>
        </div>
        <div class="clients-deliverable">
          <span class="clients-check">✓</span>
          <div>
            <strong>A project you can take forward</strong>
            <p>Source code, documentation, and a practical handover plan.</p>
          </div>
        </div>
        <div class="clients-deliverable">
          <span class="clients-check">✓</span>
          <div>
            <strong>Support agreed up front</strong>
            <p>Hosting, maintenance, and further development scoped to your needs.</p>
          </div>
        </div>
      </div>
    </section>
    <section class="clients-section clients-faq">
      <div>
        <div class="clients-eyebrow">Good questions</div>
        <h2>Before we talk.</h2>
      </div>
      <div>
        <details open>
          <summary>Do we need to be technical?</summary>
          <p>
            No. Start with what you're trying to achieve and how you work today. We'll turn that
            into a practical plan together.
          </p>
        </details>
        <details>
          <summary>How much does a project cost?</summary>
          <p>
            Pricing depends on the scope, integrations, and level of support. After an initial
            conversation, we'll propose a first phase with clear deliverables and a budget to agree
            before work starts.
          </p>
        </details>
        <details>
          <summary>Is this fully automated development?</summary>
          <p>
            We use AI agents through RepoOS to help do the work. We remain responsible for scoping,
            technical decisions, reviewing changes, and coordinating delivery. Your project still
            needs human judgment.
          </p>
        </details>
        <details>
          <summary>Who owns the finished software?</summary>
          <p>
            The engagement includes handing over your project source code and documentation.
            Ownership, third-party licenses, hosting, and access are made explicit in the project
            agreement.
          </p>
        </details>
        <details>
          <summary>What happens after launch?</summary>
          <p>
            We can scope ongoing maintenance and improvements, or prepare a handover to you or
            another developer. The support arrangement is agreed as part of the project.
          </p>
        </details>
      </div>
    </section>
    <section class="clients-closing">
      <div>
        <div class="clients-eyebrow">Let's build something useful</div>
        <h2>What would you like to build?</h2>
        <p>
          A rough idea, a recurring headache, or a workflow you've outgrown.<br />That's enough to
          start a conversation.
        </p>
      </div>
      <button class="clients-primary" type="button" @click="enquiry?.open()">
        Let's talk about it <span>↗</span>
      </button>
    </section>
  </main>
  <EnquiryForm ref="enquiry" />
</template>
