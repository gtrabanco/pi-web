import { expect, test } from "@playwright/test";

const lists = [
  { host: "project-list", context: "projects", second: "p2" },
  { host: "workspace-list", context: "workspaces", second: "w2" },
  { host: "session-list", context: "sessions", second: "s2" },
] as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/navigation.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
});

test("shared row hooks preserve full-width geometry, long names, and keyboard navigation", async ({ page }) => {
  for (const { host, context, second } of lists) {
    const component = page.locator(host);
    const scope = component.locator(`[data-ui-context="${context}"]`);
    const rows = scope.locator(".ui-nav-list .ui-nav-row");
    const first = rows.first();
    const next = rows.nth(1);
    await expect(first).toHaveAttribute("data-current", "true");
    const geometry = await first.evaluate((element) => {
      const main = element.querySelector(":scope > .ui-nav-row-main");
      const actions = element.querySelector(":scope > .ui-nav-row-actions");
      const label = element.querySelector(".ui-nav-row-label");
      const list = element.closest(".ui-nav-list");
      if (!main || !actions || !label || !list) throw new Error("Missing row anatomy");
      return {
        rowWidth: element.getBoundingClientRect().width, listWidth: list.clientWidth,
        mainRight: main.getBoundingClientRect().right, actionsLeft: actions.getBoundingClientRect().left,
        labelOverflow: label.scrollWidth > label.clientWidth,
        scrollerOverflow: list.scrollWidth > list.clientWidth,
      };
    });
    expect(geometry.rowWidth).toBeCloseTo(geometry.listWidth, 0);
    expect(geometry.mainRight).toBeLessThanOrEqual(geometry.actionsLeft + 1);
    expect(geometry.labelOverflow).toBe(true);
    expect(geometry.scrollerOverflow).toBe(false);
    const before = await first.boundingBox();
    await first.focus();
    await first.press("ArrowDown");
    await expect(next).toBeFocused();
    await expect(next).toHaveCSS("outline-style", "solid");
    await expect(first).toHaveAttribute("data-current", "true");
    await next.press("Enter");
    await expect(page.locator("#last-selected")).toHaveText(`${context}:${second}`);
    await expect(next).toHaveAttribute("data-current", "true");
    await expect(next).toHaveAttribute("aria-current", "true");
    await expect(first).toHaveAttribute("data-current", "false");
    expect(await first.boundingBox()).toEqual(before);
    await component.locator(".ui-nav-section-toggle").first().click();
    await expect(scope).toHaveAttribute("data-collapsed", "true");
    await expect(rows).toHaveCount(0);
    await component.locator(".ui-nav-section-toggle").first().click();
    await expect(scope).toHaveAttribute("data-collapsed", "false");
    await expect(rows.nth(1)).toHaveAttribute("data-current", "true");
  }
});

test("row action popups remain independently operable and correctly associated", async ({ page }) => {
  for (const { host } of lists) {
    const component = page.locator(host);
    const row = component.locator(".ui-nav-row").first();
    const action = row.locator(".ui-nav-row-action");
    const before = await page.locator("#last-selected").textContent();
    await action.click();
    await expect(action).toHaveAttribute("aria-expanded", "true");
    const popup = component.locator(".ui-nav-row-menu");
    await expect(popup).toBeVisible();
    await expect(popup).toHaveAttribute("id", await action.getAttribute("aria-controls") ?? "");
    expect(await page.locator("#last-selected").textContent()).toBe(before);
    await expect(row).toHaveAttribute("data-current", "true");
    if (host !== "session-list") await expect(popup.getByRole("button", { name: "Move up", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(action).toHaveAttribute("aria-expanded", "false");
  }
  const sessions = page.locator("session-list");
  const parent = sessions.locator(".ui-nav-row").first();
  const disclosure = sessions.locator(".ui-nav-row-disclosure");
  await expect(parent).toHaveAttribute("data-expanded", "false");
  await disclosure.click();
  await expect(parent).toHaveAttribute("data-expanded", "true");
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(sessions.locator(".ui-nav-row")).toHaveCount(3);
});

test("themes can override row anatomy through supported hooks without changing state", async ({ page }) => {
  const labels = lists.map(({ host }) => page.locator(host).locator(".ui-nav-row-label").first());
  const colors = await Promise.all(labels.map((label) => label.evaluate((element) => getComputedStyle(element).color)));
  await page.evaluate(() => { window.navigationFixture.setTheme(true); });
  for (const { host } of lists) {
    const component = page.locator(host);
    const row = component.locator(".ui-nav-row").first();
    await expect(row.locator(".ui-nav-row-label")).toHaveCSS("color", "rgb(200, 210, 220)");
    await expect(row.locator(".ui-nav-row-label")).toHaveCSS("white-space", "normal");
    await expect(row.locator(".ui-nav-row-main")).toHaveCSS("padding-inline-start", "24px");
    await expect(row).toHaveAttribute("data-current", "true");
    await expect(row).toHaveAttribute("aria-current", "true");
  }
  await expect(page.locator('workspace-list .ui-nav-row-label').first()).toHaveCSS("text-decoration-line", "underline");
  await expect(page.locator('session-list .ui-nav-row').first()).toHaveAttribute("data-unread", "true");
  await page.evaluate(() => { window.navigationFixture.setTheme(false); });
  for (const [index, label] of labels.entries()) {
    await expect(label).toHaveCSS("color", colors[index] ?? "");
    await expect(label).toHaveCSS("white-space", "nowrap");
  }
  const screenshot = test.info().outputPath("navigation-defaults.png");
  await page.screenshot({ path: screenshot });
  await test.info().attach("navigation-defaults", { path: screenshot, contentType: "image/png" });
});
