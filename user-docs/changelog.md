---
title: Changelog
description: Every RepoOS release, with the notes that ship with it.
---

# Changelog

Every RepoOS release and the notes that ship with it. The most recent releases
are embedded below when the docs are built; the full history lives on GitHub.

## Recent releases

<script setup>
import { data as changelog } from "./changelog.data";
</script>

<div v-if="changelog.error" class="release-notice">
  <p>
    <strong>Release notes could not be fetched</strong> when this page was
    built ({{ changelog.error }}). The full history is on GitHub.
  </p>
  <p>
    <a :href="changelog.githubUrl">Browse all releases on GitHub →</a>
  </p>
</div>

<template v-else>
  <ol class="release-list">
    <li v-for="release in changelog.releases" :key="release.tag" class="release">
      <div class="release__head">
        <h2 :id="release.tag" class="release__tag">{{ release.name }}</h2>
        <div class="release__meta">
          <time :datetime="release.iso">{{ release.date }}</time>
          <span v-if="release.prerelease" class="release__badge">pre-release</span>
          <a class="release__source" :href="release.url">GitHub ↗</a>
        </div>
      </div>
      <div class="release__notes" v-html="release.html"></div>
    </li>
  </ol>
</template>

## Older releases

This page embeds the most recent releases only. For anything older — or if
these notes are out of date between docs deploys — the
[full release history on GitHub](https://github.com/repo-os/repoos/releases)
is the authoritative source.
