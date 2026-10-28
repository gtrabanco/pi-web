import { expect, test, type Page } from "@playwright/test";
import type { PromptEditor } from "../../src/client/src/components/PromptEditor";

type ComposerState = Partial<Pick<PromptEditor, "canSteer" | "isCompacting" | "canStop" | "defaultStreamingBehavior" | "disabled" | "sending" | "shortcuts">>;

async function setState(page: Page, state: ComposerState): Promise<void> {
  await page.locator("prompt-editor").evaluate(async (element: PromptEditor, state) => {
    Object.assign(element, state);
    await element.updateComplete;
  }, state);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/overlays.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await page.locator("prompt-editor").evaluate(async (editor: PromptEditor) => {
    editor.status = {
      sessionId: "browser-fixture", isStreaming: false, isCompacting: false, isBashRunning: false,
      pendingMessageCount: 0, queuedMessages: [], cost: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      model: { provider: "example", id: "a-long-model-name-that-must-not-hide-composer-actions" }, thinkingLevel: "medium",
    };
    editor.shortcuts = { "composer.send.desktop": "mod+enter", "composer.send.mobile": "mod+enter" };
    editor.canStop = true;
    editor.onSelectModel = () => { document.body.dataset["lastPicker"] = "model"; };
    editor.onSelectThinking = () => { document.body.dataset["lastPicker"] = "thinking"; };
    editor.onStop = () => { document.body.dataset["lastStop"] = "stopped"; };
    editor.onSend = (_text, behavior) => { document.body.dataset["lastSend"] = behavior ?? "send"; };
    await editor.updateComplete;
    editor.replaceText("Review the configuration");
  });
});

test("purpose hooks preserve compact geometry and independently operable settings/actions", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  const editor = page.locator("prompt-editor");
  const root = editor.locator('[data-ui-context="composer"]');
  const toolbar = root.locator(".ui-composer-toolbar");
  const model = toolbar.locator('[data-composer-action="model"]');
  const thinking = toolbar.locator('[data-composer-action="thinking"]');
  const commands = toolbar.locator(".ui-composer-actions");
  const send = commands.locator('[data-composer-action="send"]');
  const stop = commands.locator('[data-composer-action="stop"]');
  await expect(send).toHaveCSS("width", "44px");
  await expect(stop).toHaveCSS("width", "44px");
  await expect(root.locator('[data-composer-action="attach"]')).toHaveCSS("width", "28px");
  await expect(thinking).toHaveCSS("height", "44px");
  expect(await model.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  const settingsBox = await toolbar.locator(".ui-composer-settings").boundingBox();
  const actionsBox = await commands.boundingBox();
  if (!settingsBox || !actionsBox) throw new Error("Missing toolbar geometry");
  expect(settingsBox.x + settingsBox.width).toBeLessThanOrEqual(actionsBox.x + 1);
  const before = await send.boundingBox();
  await model.click();
  await expect(page.locator("body")).toHaveAttribute("data-last-picker", "model");
  await expect(model).not.toHaveAttribute("aria-expanded");
  await thinking.click();
  await expect(page.locator("body")).toHaveAttribute("data-last-picker", "thinking");
  await expect(thinking).not.toHaveAttribute("aria-expanded");
  await send.focus();
  await send.press("Tab");
  await expect(stop).toBeFocused();
  await expect(stop).toHaveCSS("outline-style", "solid");
  await stop.press("Enter");
  await expect(page.locator("body")).toHaveAttribute("data-last-stop", "stopped");
  expect(await send.boundingBox()).toEqual(before);
});

test("configured defaults follow queue/steer/compaction while preserving editor focus and keyboard behavior", async ({ page }) => {
  const editor = page.locator("prompt-editor");
  const root = editor.locator('[data-ui-context="composer"]');
  const input = editor.locator(".cm-content");
  // CodeMirror's Android path delays Enter and can drop its modifiers before
  // public key handlers. Keep that existing editor issue outside this UI contract:
  // a modified letter chord exercises submission ownership on every browser.
  await setState(page, { shortcuts: { "composer.send.desktop": "mod+k", "composer.send.mobile": "mod+k" } });
  await input.focus();
  await expect(root).toHaveAttribute("data-default-action", "send");
  await setState(page, { canSteer: true });
  await expect(root).toHaveAttribute("data-default-action", "steer");
  await expect(root.locator('[data-composer-action="steer"]')).toHaveAttribute("data-default", "true");
  await expect(input).toBeFocused();
  await input.press("ControlOrMeta+k");
  await expect(page.locator("body")).toHaveAttribute("data-last-send", "steer");
  await editor.evaluate((element: PromptEditor) => { element.replaceText("Queue another request"); });
  await setState(page, { defaultStreamingBehavior: "followUp" });
  await expect(root).toHaveAttribute("data-default-action", "queue");
  await expect(root.locator('[data-composer-action="queue"]')).toHaveAttribute("data-default", "true");
  await expect(input).toBeFocused();
  await input.press("ControlOrMeta+k");
  await expect(page.locator("body")).toHaveAttribute("data-last-send", "followUp");
  await setState(page, { defaultStreamingBehavior: "steer", isCompacting: true });
  await expect(root).toHaveAttribute("data-compacting", "true");
  await expect(root).toHaveAttribute("data-default-action", "queue");
  await expect(root.locator('[data-composer-action="steer"]')).toHaveCount(0);
  await expect(input).toBeFocused();
});

test("None and media-dependent preferences expose the same submission default as the keyboard", async ({ page }) => {
  const root = page.locator('prompt-editor [data-ui-context="composer"]');
  await setState(page, { shortcuts: { "composer.send.desktop": null, "composer.send.mobile": null } });
  await expect(root).toHaveAttribute("data-default-action", "none");
  await expect(root.locator('[data-default="true"]')).toHaveCount(0);
  const send = root.locator('[data-composer-action="send"]');
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.locator("body")).toHaveAttribute("data-last-send", "send");
  await setState(page, { shortcuts: { "composer.send.desktop": null, "composer.send.mobile": "mod+enter" } });
  await page.setViewportSize({ width: 1200, height: 800 });
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  await expect(root).toHaveAttribute("data-default-action", coarse ? "send" : "none");
  await page.setViewportSize({ width: 700, height: 800 });
  await expect(root).toHaveAttribute("data-default-action", "send");
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(root).toHaveAttribute("data-default-action", coarse ? "send" : "none");
});

test("Playground decorates only the enabled default; popup and Stop availability remain independent", async ({ page }) => {
  const editor = page.locator("prompt-editor");
  const root = editor.locator('[data-ui-context="composer"]');
  const send = root.locator('[data-composer-action="send"]');
  const stop = root.locator('[data-composer-action="stop"]');
  const decoration = (element: Element) => {
    const style = getComputedStyle(element, "::after");
    return { content: style.content, width: style.width, border: style.borderBlockEndWidth };
  };
  const before = await send.boundingBox();
  await page.evaluate(() => window.overlayFixture.applyTheme("themes:playground-dark"));
  expect(await send.evaluate(decoration)).toEqual({ content: '""', width: "10px", border: "2px" });
  expect(await send.boundingBox()).toEqual(before);
  const attach = root.locator('[data-composer-action="attach"]');
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) {
    await attach.click();
    await expect(attach).toHaveAttribute("aria-expanded", "true");
    const sources = root.locator('[data-ui-context="composer-attachment-sources"]');
    await expect(sources).toBeVisible();
    await expect(sources).toHaveAttribute("id", await attach.getAttribute("aria-controls") ?? "");
    for (const action of ["attach-photos", "attach-camera", "attach-files"]) await expect(sources.locator(`[data-composer-action="${action}"]`)).toBeVisible();
  } else {
    await expect(attach).not.toHaveAttribute("aria-expanded");
  }
  await setState(page, { sending: true });
  await expect(root).toHaveAttribute("data-busy", "true");
  await expect(root).toHaveAttribute("data-disabled", "false");
  await expect(root).toHaveAttribute("data-default-action", "none");
  await expect(send).toBeDisabled();
  await expect(attach).toBeDisabled();
  await expect(stop).toBeEnabled();
  await expect(root.locator('[data-ui-context="composer-attachment-sources"]')).toBeHidden();
  expect((await send.evaluate(decoration)).content).toBe("none");
  await setState(page, { sending: false, disabled: true });
  await expect(root).toHaveAttribute("data-busy", "false");
  await expect(root).toHaveAttribute("data-disabled", "true");
  await expect(stop).toBeDisabled();
  await setState(page, { disabled: false, canSteer: true });
  const steer = root.locator('[data-composer-action="steer"]');
  await expect(steer).toHaveAttribute("data-default", "true");
  expect((await steer.evaluate(decoration)).border).toBe("2px");
  await page.emulateMedia({ forcedColors: "active" });
  expect((await steer.evaluate(decoration)).border).toBe("2px");
  await page.emulateMedia({ forcedColors: "none" });
  const screenshot = test.info().outputPath("composer-default.png");
  await editor.screenshot({ path: screenshot });
  await test.info().attach("composer-default", { path: screenshot, contentType: "image/png" });
  await page.evaluate(() => window.overlayFixture.applyTheme("themes:pi-web-dark"));
  expect((await steer.evaluate(decoration)).content).toBe("none");
});
