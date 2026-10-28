import { expect, test, type Page } from "@playwright/test";
import type { MachineSwitcher } from "../../src/client/src/components/MachineSwitcher";

async function addTheme(page: Page, host: string, css: string): Promise<void> {
  await page.locator(host).evaluate((element, css) => {
    const root = element.shadowRoot;
    if (!root) throw new Error("Missing themed root");
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  }, css);
}

async function ready(page: Page, fixture: string): Promise<void> {
  await page.goto(fixture);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
}

test("native action panels expose shared hooks without changing row geometry, focus or checkbox semantics", async ({ page }) => {
  await ready(page, "/navigation.html");
  for (const [host, context] of [["project-list", "project-actions"], ["workspace-list", "workspace-actions"], ["session-list", "session-actions"]] as const) {
    const owner = page.locator(host);
    const row = owner.locator(".ui-nav-row").first();
    const trigger = row.locator(".ui-popup-trigger");
    const rowBefore = await row.boundingBox();
    await trigger.focus();
    await trigger.press("Enter");
    const panel = owner.locator(`.ui-popup-panel[data-ui-context="${context}"]`);
    await expect(panel).toBeVisible();
    expect(await trigger.getAttribute("aria-controls")).toBe(await panel.getAttribute("id"));
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(panel).not.toHaveAttribute("role", "menu");
    const before = await panel.boundingBox();
    await addTheme(page, host, `
      .ui-popup-panel.ui-menu { border-radius: 0; border-style: dashed; }
      .ui-menu-item:disabled { text-decoration: line-through; }
      .ui-menu-item:has(input:checked) { text-decoration: underline; }
    `);
    await expect(panel).toHaveCSS("border-radius", "0px");
    await expect(panel).toHaveCSS("border-top-style", "dashed");
    expect(await panel.boundingBox()).toEqual(before);
    expect(await row.boundingBox()).toEqual(rowBefore);
    const disabled = panel.locator("button.ui-menu-item:disabled").first();
    if (await disabled.count()) {
      await expect(disabled).toHaveCSS("text-decoration-line", "line-through");
      await expect(disabled).toHaveCSS("height", "32px");
    }
    if (host === "workspace-list") {
      const checkbox = panel.locator('.ui-menu-item input[type="checkbox"]');
      await expect(checkbox).toBeEnabled();
      await checkbox.check();
      await expect(checkbox).toBeChecked();
      await expect(panel.locator(".ui-menu-item:has(input:checked)")).toHaveCSS("text-decoration-line", "underline");
      await expect(panel.locator(".ui-menu-item:has(input)")).toHaveAttribute("data-busy", "false");
      await expect(panel).toBeVisible();
    }
    await panel.locator("button.ui-menu-item:not(:disabled)").first().focus();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toHaveCount(0);
    await expect(row).toHaveAttribute("data-current", "true");
  }
});

test("nested popup identity and current destination remain separate from keyboard focus", async ({ page }) => {
  await ready(page, "/overlays.html");
  const owner = page.locator("machine-switcher").first();
  await owner.evaluate((element: MachineSwitcher) => { element.onSelect = (machine) => { element.selected = machine; }; });
  const trigger = owner.locator(".ui-popup-trigger").first();
  await addTheme(page, "machine-switcher", '.ui-menu-item[data-current="true"] { background-color: rgb(31, 41, 51); }');
  await trigger.focus();
  await trigger.press("ArrowDown");
  const picker = owner.locator('.ui-popup-panel[data-ui-context="machine-picker"]');
  const current = picker.locator('.ui-menu-item[data-current="true"]');
  const other = picker.locator('.ui-menu-item[data-current="false"]');
  await expect(current).toBeFocused();
  await expect(current).toHaveAttribute("aria-current", "true");
  await expect(current).toHaveCSS("background-color", "rgb(31, 41, 51)");
  await expect(current).not.toHaveAttribute("aria-pressed");
  expect(await picker.getAttribute("id")).toBe(await trigger.getAttribute("aria-controls"));
  await current.press("ArrowDown");
  await expect(other).toBeFocused();
  await expect(current).toHaveAttribute("data-current", "true");
  await expect(other).not.toHaveAttribute("aria-current");
  const nestedTrigger = owner.locator(".ui-popup-trigger").nth(1);
  await nestedTrigger.click();
  const nested = owner.locator('.ui-popup-panel[data-ui-context="machine-actions"]');
  await expect(nested).toBeVisible();
  expect(await nested.getAttribute("id")).toBe(await nestedTrigger.getAttribute("aria-controls"));
  await nested.locator(".ui-menu-item").first().focus();
  await page.keyboard.press("Escape");
  await expect(nestedTrigger).toBeFocused();
  await expect(nestedTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.press("ArrowDown");
  await picker.locator('[data-current="true"]').press("ArrowDown");
  await picker.locator('[data-current="false"]').press("Enter");
  await expect(picker).toHaveCount(0);
  await trigger.press("ArrowDown");
  await expect(picker.locator('[data-current="true"]')).toHaveAttribute("data-machine-id", "Remote");
});

test("Playground menu cues are removable, non-hue, logical-direction decorations with no added gutter", async ({ page }) => {
  await ready(page, "/overlays.html");
  const owner = page.locator("machine-switcher").first();
  await owner.locator(".ui-popup-trigger").first().click();
  const picker = owner.locator('[data-ui-context="machine-picker"]');
  const current = picker.locator('.ui-menu-item[data-current="true"]');
  const before = await current.boundingBox();
  for (const scheme of ["dark", "light"]) {
    await page.evaluate((id) => window.overlayFixture.applyTheme(id), `themes:playground-${scheme}`);
    expect(await current.evaluate((element) => {
      const cue = getComputedStyle(element, "::after");
      return { content: cue.content, border: cue.borderInlineStartWidth, height: cue.height, pointer: cue.pointerEvents };
    })).toEqual({ content: '""', border: "2px", height: "10px", pointer: "none" });
    expect(await current.boundingBox()).toEqual(before);
    await owner.locator(".ui-popup-trigger").nth(1).click();
    const nested = owner.locator('[data-ui-context="machine-actions"]');
    await expect(nested.locator(".ui-menu-item.danger")).toHaveCSS("text-decoration-line", "underline");
    await expect(nested.locator(".ui-menu-item.danger")).toHaveCSS("text-decoration-style", "dotted");
    const path = test.info().outputPath(`menus-${scheme}.png`);
    await page.screenshot({ path });
    await test.info().attach(`menus-${scheme}`, { path, contentType: "image/png" });
    await page.keyboard.press("Escape");
  }
  await owner.evaluate((element) => { element.setAttribute("dir", "rtl"); });
  expect(await current.evaluate((element) => parseFloat(getComputedStyle(element, "::after").left) > element.clientWidth - 6)).toBe(true);
  await page.emulateMedia({ forcedColors: "active" });
  expect(await current.evaluate((element) => getComputedStyle(element, "::after").borderInlineStartWidth)).toBe("2px");
  await page.emulateMedia({ forcedColors: "none" });
  await page.evaluate(() => window.overlayFixture.applyTheme("themes:pi-web-dark"));
  expect(await current.evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");
  await owner.locator(".ui-popup-trigger").nth(1).click();
  await expect(owner.locator('[data-ui-context="machine-actions"] .danger')).toHaveCSS("text-decoration-line", "none");
});

test("message action strips and completions share only popup anatomy, not menu layout or roles", async ({ page }) => {
  await ready(page, "/overlays.html");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const owner = page.locator(".clip pi-message-actions-menu");
  const trigger = owner.locator(".ui-popup-trigger");
  const before = await trigger.boundingBox();
  await addTheme(page, ".clip pi-message-actions-menu", '.ui-popup-panel { border: 1px dashed currentColor; border-radius: 3px; }');
  await trigger.click();
  const panel = owner.locator('.ui-popup-panel[data-ui-context="message-actions"]');
  await expect(panel).toHaveCSS("border-top-style", "dashed");
  await expect(panel).toHaveCSS("border-radius", "3px");
  await expect(panel).not.toHaveClass(/ui-menu/);
  await expect(panel).not.toHaveAttribute("role", "menu");
  expect(await trigger.boundingBox()).toEqual(before);
  await owner.getByRole("button", { name: "Copy fixture" }).click();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page.evaluate(() => window.overlayFixture.complete());
  const completion = page.locator('autocomplete-menu .ui-popup-panel[data-ui-context="completions"]');
  await expect(completion).toBeVisible();
  await expect(completion).not.toHaveClass(/ui-menu/);
  await expect(completion).not.toHaveAttribute("role", "menu");
  await page.locator("prompt-editor .cm-content").focus();
  await page.keyboard.press("Escape");
  await expect(completion).toHaveCount(0);
  await expect(page.locator("prompt-editor .cm-content")).toBeFocused();
});
