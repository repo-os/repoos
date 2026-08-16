const { startServer } = await import("/Users/nick/code/nick/repoos-worktrees/feat/let-s-add-a-new-agent-to-build-your-team/dist/server/server.js");
const pw = await import("playwright");
const webkit = pw.webkit;

const server = await startServer({ root: "/Users/nick/code/nick/repoos-worktrees/feat/let-s-add-a-new-agent-to-build-your-team", host: "127.0.0.1", port: 0 });

try {
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrs = [];
  const failed = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrs.push(msg.text()); });
  page.on("response", (res) => { if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`); });
  page.on("requestfailed", (req) => { failed.push(`REQFAIL ${req.url()} ${req.failure()?.errorText}`); });

  await page.goto(server.url, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(1000);

  for (const label of ["Work", "Settings", "Agents", "Tasks"]) {
    await page.evaluate((lbl) => {
      const navItems = document.querySelectorAll(".nav-item");
      for (const item of Array.from(navItems)) {
        if (item.textContent?.includes(lbl)) (item).click();
      }
    }, label);
    await page.waitForTimeout(800);
  }

  console.log("TITLE:", await page.title());
  console.log("CONSOLE ERRORS:", JSON.stringify(consoleErrs, null, 2));
  console.log("FAILED REQUESTS:", JSON.stringify(failed, null, 2));
  await browser.close();
} finally {
  await server.close();
}
