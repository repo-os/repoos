/**
 * Synthetic fixtures for the polyglot adoption matrix (#0452).
 *
 * Every fixture is a handful of real, minimal files for one stack, written to
 * a temporary directory at test time — never committed into RepoOS's own tree.
 * That is deliberate: a checked-in `go.mod`/`Cargo.toml`/`gradlew`/`.ts` under
 * `tests/` would be picked up by this repo's own build, formatter and linter,
 * and a fixture whose whole point is "an unfamiliar project" must not be
 * shaped by RepoOS's tooling. Materializing keeps the fixtures hermetic and the
 * repository clean.
 *
 * The intent and the expected behaviour live in `matrix.json`; this module owns
 * only the file contents, keyed by the same ids, plus the materializer. Keeping
 * metadata machine-readable in JSON is what makes "add a stack" a reviewable
 * diff: a new row in the manifest and one entry here.
 *
 * Fixtures contain no proprietary code, credentials, remote endpoints or model
 * provider calls — a test enforces that.
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import matrix from "./matrix.json";

export interface ToolchainCheck {
  /** Human label used in the failure message (e.g. "build"). */
  label: string;
  /** Binary that must be on PATH for this check to run. */
  tool: string;
  /** Command run in the fixture root. */
  command: string;
}

export interface ExpectedPlan {
  source: "declared" | "legacy" | "inferred" | "empty";
  /** Step names, in declaration order. */
  steps: string[];
  /** `command` values of the steps that declare one, in order. */
  commands: string[];
  /** Per-step `requires` lists that must be non-empty. */
  requires: Record<string, string[]>;
}

export interface AdoptionFixture {
  id: string;
  stack: string;
  intent: string;
  /** Which starter task `repoos init` should seed. */
  kind: "new" | "existing";
  /** Whether the fixture already ships an AGENTS.md that must be preserved. */
  hasAgentsMd: boolean;
  /** Real binaries the fixture's stack needs (informational). */
  toolchain: string[];
  /** Cost to run the real stack: always, in CI, or only on a scheduled job. */
  toolchainTier: "local" | "ci" | "scheduled";
  toolchainChecks: ToolchainCheck[];
  expectedPlan: ExpectedPlan;
}

export const ADOPTION_FIXTURES: AdoptionFixture[] = (
  matrix.fixtures as unknown as AdoptionFixture[]
).slice();

export const MATRIX_VERSION: number = matrix.version;

export function fixtureById(id: string): AdoptionFixture {
  const fixture = ADOPTION_FIXTURES.find((f) => f.id === id);
  if (!fixture) throw new Error(`no adoption fixture with id "${id}"`);
  return fixture;
}

/** Repo-relative path -> file contents. The manifest's file list is the keys. */
type FixtureFiles = Record<string, string>;

const TS_CONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true
  },
  "include": ["src", "build.ts", "test.ts", "lint.ts", "fmt-check.ts"]
}
`;

const FIXTURE_FILES: Record<string, FixtureFiles> = {
  "ts-bun-web": {
    "package.json": `{
  "name": "acme-web",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "bun run build.ts",
    "test": "bun run test.ts",
    "lint": "bun run lint.ts",
    "fmt:check": "bun run fmt-check.ts"
  }
}
`,
    "bun.lock": "",
    "tsconfig.json": TS_CONFIG,
    "src/index.ts": `export const version = "1.0.0";
`,
    "build.ts": `import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.js", 'export const version = "1.0.0";\\n');
console.log("built acme-web");
`,
    "test.ts": `import { version } from "./src/index.ts";

if (version !== "1.0.0") {
  throw new Error("expected version 1.0.0, got " + version);
}
console.log("acme-web tests passed");
`,
    "lint.ts": `console.log("lint ok");
`,
    "fmt-check.ts": `console.log("format ok");
`,
    "README.md":
      "# acme-web\n\nA minimal Bun + TypeScript web app used as a RepoOS adoption fixture.\n",
  },

  "ts-node-web": {
    "package.json": `{
  "name": "acme-node-web",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "test": "node test.mjs"
  }
}
`,
    "src/index.js": `export const version = "1.0.0";
`,
    "build.mjs": `import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.js", 'export const version = "1.0.0";\\n');
console.log("built acme-node-web");
`,
    "test.mjs": `import { version } from "./src/index.js";

if (version !== "1.0.0") {
  throw new Error("expected version 1.0.0, got " + version);
}
console.log("acme-node-web tests passed");
`,
    "README.md":
      "# acme-node-web\n\nA minimal Node/npm web app used as a RepoOS adoption fixture.\n",
  },

  "go-service": {
    "go.mod": `module example.com/acme/service

go 1.22
`,
    "cmd/server/main.go": `package main

import (
	"fmt"

	"example.com/acme/service/internal/greeting"
)

func main() {
	fmt.Println(greeting.Hello("world"))
}
`,
    "internal/greeting/greeting.go": `package greeting

import "fmt"

// Hello returns a greeting for name.
func Hello(name string) string {
	return fmt.Sprintf("hello, %s", name)
}
`,
    "internal/greeting/greeting_test.go": `package greeting

import "testing"

func TestHello(t *testing.T) {
	if got := Hello("repoos"); got != "hello, repoos" {
		t.Fatalf("Hello() = %q, want %q", got, "hello, repoos")
	}
}
`,
    ".gitignore": "/bin/\n",
    "README.md": "# acme-service\n\nA minimal Go service used as a RepoOS adoption fixture.\n",
  },

  "rust-cargo": {
    "Cargo.toml": `[package]
name = "acme-crate"
version = "0.1.0"
edition = "2021"

[dependencies]
`,
    "src/lib.rs": `pub fn add(left: i64, right: i64) -> i64 {
    left + right
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds() {
        assert_eq!(add(2, 3), 5);
    }
}
`,
    "src/main.rs": `fn main() {
    println!("acme-crate {}", acme_crate::add(1, 2));
}
`,
    "rustfmt.toml": `edition = "2021"
`,
    ".gitignore": "/target\n",
    "README.md": "# acme-crate\n\nA minimal Rust crate used as a RepoOS adoption fixture.\n",
  },

  "android-gradle": {
    "settings.gradle.kts": `rootProject.name = "acme-android"
include(":app")
`,
    "build.gradle.kts": `// Root build script. Intentionally no external plugins: the fixture's point
// is RepoOS adoption on a Gradle-shaped project, not a full Android SDK build.
plugins {
    base
}
`,
    gradlew: `#!/bin/sh
# Synthetic wrapper: delegates to a Gradle installed on PATH. A real project
# commits the wrapper jar; a fixture cannot, so CI installs Gradle for the
# scheduled toolchain job and this shim points at it.
exec gradle "$@"
`,
    "gradle/wrapper/gradle-wrapper.properties": `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip
`,
    "app/build.gradle.kts": `plugins {
    base
}
`,
    "app/src/main/AndroidManifest.xml": `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.acme.app">
    <application android:label="Acme" />
</manifest>
`,
    "app/src/main/kotlin/com/acme/app/MainActivity.kt": `package com.acme.app

class MainActivity {
    fun greeting(): String = "hello from Acme"
}
`,
    "app/src/test/kotlin/com/acme/app/MainActivityTest.kt": `package com.acme.app

import kotlin.test.Test
import kotlin.test.assertEquals

class MainActivityTest {
    @Test
    fun greetingIsStable() {
        assertEquals("hello from Acme", MainActivity().greeting())
    }
}
`,
    "README.md":
      "# acme-android\n\nA Gradle/Kotlin project shaped like an Android app, used as a RepoOS adoption fixture.\n",
  },

  "vue-go-mixed": {
    "go.mod": `module example.com/acme/mixed

go 1.22
`,
    "cmd/api/main.go": `package main

import (
	"fmt"

	"example.com/acme/mixed/internal/greeting"
)

func main() {
	fmt.Println(greeting.Hello("api"))
}
`,
    "internal/greeting/greeting.go": `package greeting

import "fmt"

// Hello returns a greeting for name.
func Hello(name string) string {
	return fmt.Sprintf("hello, %s", name)
}
`,
    "internal/greeting/greeting_test.go": `package greeting

import "testing"

func TestHello(t *testing.T) {
	if got := Hello("api"); got != "hello, api" {
		t.Fatalf("Hello() = %q, want %q", got, "hello, api")
	}
}
`,
    "package.json": `{
  "name": "acme-mixed-web",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "test": "vitest run"
  }
}
`,
    "bun.lock": "",
    "web/index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Acme</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
    "web/src/main.ts": `import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
`,
    "web/src/App.vue": `<template>
  <h1>Acme</h1>
</template>

<script setup lang="ts">
const name = "Acme";
</script>
`,
    "web/vite.config.ts": `import { defineConfig } from "vite";

export default defineConfig({
  build: { outDir: "dist" },
});
`,
    "README.md":
      "# acme-mixed\n\nA Vue frontend plus a Go backend in one repository, used as a RepoOS adoption fixture.\n",
  },

  "existing-agents-docs": {
    "AGENTS.md": `# Acme service instructions

These instructions are owned by the Acme team and must not be replaced.

- Run make verify before opening a pull request.
- Never rewrite files under docs/ without review.
`,
    "README.md": "# Acme\n\nAn existing project that already documents its own conventions.\n",
    "docs/README.md": "# Acme docs\n\nArchitecture and operations notes live here.\n",
    "docs/architecture.md": `# Architecture

The service is a single long-running process backed by an append-only log.
`,
    "package.json": `{
  "name": "acme-docs",
  "private": true,
  "scripts": {
    "test": "node test.mjs"
  }
}
`,
    "test.mjs": `console.log("acme-docs tests passed");
`,
  },

  "empty-repo": {},

  "existing-git-repo": {
    "AGENTS.md": `# Platform repository instructions

Owned by the platform team.

- Keep migrations backwards compatible.
`,
    "go.mod": `module example.com/acme/platform

go 1.22
`,
    "main.go": `package main

import "fmt"

func main() {
	fmt.Println("acme platform")
}
`,
    "internal/greeting/greeting.go": `package greeting

// Hello returns a greeting for name.
func Hello(name string) string {
	return "hello, " + name
}
`,
    "internal/greeting/greeting_test.go": `package greeting

import "testing"

func TestHello(t *testing.T) {
	if got := Hello("platform"); got != "hello, platform" {
		t.Fatalf("Hello() = %q", got)
	}
}
`,
    ".gitignore": "/bin/\n",
    "README.md":
      "# acme-platform\n\nAn existing Git repository used as a RepoOS adoption fixture.\n",
    "docs/README.md": "# Platform docs\n",
  },
};

/** The declared files for a fixture, for manifest-integrity checks. */
export function fixtureFilePaths(id: string): string[] {
  return Object.keys(FIXTURE_FILES[id] ?? {}).sort();
}

function safeJoin(root: string, rel: string): string {
  const abs = resolve(root, rel);
  const relToRoot = relative(root, abs);
  if (relToRoot.startsWith("..") || relToRoot.includes(`..${sep}`)) {
    throw new Error(`fixture path escapes the fixture root: ${rel}`);
  }
  return abs;
}

/**
 * Write a fixture's files into `dest`. `gradlew` is made executable so a
 * Gradle-shaped fixture can actually be invoked. The empty fixture still gets
 * its directory created.
 */
export function materializeFixture(id: string, dest: string): void {
  const files = FIXTURE_FILES[id];
  if (!files) throw new Error(`no file set for adoption fixture "${id}"`);
  mkdirSync(dest, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = safeJoin(dest, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    if (rel.endsWith("gradlew")) chmodSync(abs, 0o755);
  }
}
