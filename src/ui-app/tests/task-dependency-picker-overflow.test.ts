// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const component = readFileSync(
  resolve(__dirname, "../src/components/TaskDependencyPicker.vue"),
  "utf8",
);
const pickerCss = component.split("<style scoped>")[1]!.split("</style>")[0]!;

describe.skipIf(!existsSync(webkit.executablePath()))(
  "Task creation and editing responsive interactions (WebKit)",
  () => {
    let browser: Browser;

    beforeAll(async () => {
      browser = await webkit.launch();
    });

    afterAll(async () => {
      await browser?.close();
    });

    it.each([375, 768, 1280])("keeps task create/edit controls usable at %i px", async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      try {
        await page.setContent(`
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 16px; font: 14px sans-serif; }
          .drawer { width: min(100%, 680px); max-height: 850px; overflow: auto; margin: auto; padding: 16px; border: 1px solid #777; }
          .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 12px; }
          label { display: block; margin-bottom: 4px; }
          input, textarea, select, button { max-width: 100%; min-height: 40px; font: inherit; }
          input, textarea, select { width: 100%; }
          .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
          .task-dependency-picker { width: min(100%, 320px); --border: #777; --muted: #eee; --ring: #00f; --foreground: #111; }
          ${pickerCss}
        </style>
        <form class="drawer" aria-label="Task editor">
          <h1>New task</h1>
          <div class="fields">
            <div><label for="title">Title</label><input id="title" required></div>
            <div><label for="priority">Priority</label><select id="priority"><option>p2</option><option>p1</option></select></div>
            <div><label for="area">Area</label><select id="area"><option>web</option><option>core</option></select></div>
            <div class="task-dependency-picker"><label for="deps">Depends on</label><input id="deps" aria-label="Filter tasks"><ul class="dependency-options" aria-label="Depends on options"><li><button class="dependency-option" type="button"><span class="dependency-check" aria-hidden="true"></span><span class="dependency-copy"><strong>#0101</strong> A very long candidate title that should stay on one line and truncate within the available picker width rather than widening the list</span><span class="dependency-status">ready</span></button></li></ul><output aria-live="polite"></output></div>
            <div><label for="shot">Screenshots</label><input id="shot" type="file" accept="image/*"><output id="shot-name" aria-live="polite"></output></div>
          </div>
          <div class="actions"><button type="button" id="edit">Edit details</button><button type="submit" id="save" disabled>Create task</button></div>
          <p id="validation" role="alert" hidden>Enter a title to create this task.</p>
        </form>
        <script>
          const title = document.querySelector('#title');
          const save = document.querySelector('#save');
          title.addEventListener('input', () => save.disabled = !title.value.trim());
          document.querySelector('#edit').addEventListener('click', () => { document.querySelector('h1').textContent = 'Edit task'; title.value = 'Existing task'; title.dispatchEvent(new Event('input')); });
          document.querySelector('#deps').addEventListener('input', (event) => { document.querySelector('.dependency-copy').textContent = event.target.value ? 'No matching tasks.' : '#0101 A very long candidate title'; });
          document.querySelector('.dependency-option').addEventListener('click', () => document.querySelector('output[aria-live]').textContent = 'Depends on #0101');
          document.querySelector('#shot').addEventListener('change', (event) => document.querySelector('#shot-name').textContent = event.target.files[0]?.name ?? '');
          document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); document.querySelector('#validation').hidden = Boolean(title.value.trim()); });
        </script>
      `);

        // Exercise validation, create fields, edit entry, dependency selection,
        // priority/area changes and a fixture screenshot through real browser controls.
        const drawer = page.locator("[aria-label='Task editor']");
        expect(await drawer.isVisible()).toBe(true);
        expect(await page.locator("#save").isDisabled()).toBe(true);
        await page.locator("form").evaluate((form: HTMLFormElement) => {
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        expect(await page.locator("#validation").isVisible()).toBe(true);
        await page.locator("#title").fill("Responsive fixture task");
        expect(await page.locator("#save").isEnabled()).toBe(true);
        await page.locator("#priority").selectOption({ label: "p1" });
        await page.locator("#area").selectOption({ label: "core" });
        await page.locator(".dependency-option").click();
        expect(await page.locator(".task-dependency-picker output").textContent()).toBe(
          "Depends on #0101",
        );
        await page.locator("#edit").click();
        expect(await page.locator("h1").textContent()).toBe("Edit task");
        await page.locator("#title").fill("Edited fixture task");
        await page.locator("#shot").setInputFiles({
          name: "fixture.png",
          mimeType: "image/png",
          buffer: Buffer.from("fixture"),
        });
        expect(await page.locator("#shot-name").textContent()).toBe("fixture.png");

        const geometry = await page.locator(".dependency-options").evaluate((list) => {
          const row = list.querySelector<HTMLElement>("li")!;
          const button = row.querySelector<HTMLElement>("button")!;
          const title = button.querySelector<HTMLElement>(".dependency-copy")!;
          const rect = (element: HTMLElement) => {
            const { width, right } = element.getBoundingClientRect();
            return {
              width,
              right,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
            };
          };
          return {
            list: rect(list as HTMLElement),
            row: rect(row),
            button: rect(button),
            title: rect(title),
          };
        });

        expect(geometry.list.scrollWidth).toBeLessThanOrEqual(geometry.list.clientWidth);
        expect(geometry.row.right).toBeLessThanOrEqual(geometry.list.right + 1);
        expect(geometry.button.scrollWidth).toBeLessThanOrEqual(geometry.button.clientWidth);
        expect(geometry.title.scrollWidth).toBeGreaterThan(geometry.title.clientWidth);

        const unreachableControls = await drawer
          .locator("button, input, select, textarea")
          .evaluateAll(
            (controls) =>
              controls.filter((control) => {
                const rect = control.getBoundingClientRect();
                return rect.width > 0 && (rect.left < 0 || rect.right > innerWidth);
              }).length,
          );
        expect(unreachableControls).toBe(0);
      } finally {
        await page.close();
      }
    });
  },
);
