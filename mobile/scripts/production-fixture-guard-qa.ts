#!/usr/bin/env bun
/**
 * Verify browser-dev fixtures are inert in a production Vite build.
 *
 * Build and preview mobile/ first, then run this script with QA_BASE_URL set to
 * the preview origin. It checks that a lock success query cannot seed servers
 * or skip the normal empty state in the production bundle.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE_URL ?? "http://localhost:5189";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 812 } });
  await page.goto(`${BASE}/?fixture=lock&auth=success&platform=android`);
  await page.getByTestId("hub-empty-state").waitFor();
  if ((await page.locator(".lock-overlay").count()) !== 0) {
    throw new Error("production lock fixture opened the lock overlay");
  }
  console.log("PASS production query fixture is ignored; no auth bypass or seeded servers");
} finally {
  await browser.close();
}
