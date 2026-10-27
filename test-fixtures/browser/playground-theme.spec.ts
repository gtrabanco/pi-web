import { expect, test } from "@playwright/test";
import type { ChatView } from "../../src/client/src/components/ChatView";

for (const scheme of ["dark", "light"] as const) {
  test(`Playground ${scheme} is isolated, readable, and adds restrained geometric cues`, async ({ page }) => {
    await page.goto("/overlays.html");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.evaluate(async (scheme) => {
      await window.overlayFixture.applyTheme(`themes:playground-${scheme}`);
      const chat = document.querySelector<ChatView>("chat-view");
      if (!chat) throw new Error("Missing chat fixture");
      chat.messages = [
        { role: "user", parts: [{ type: "text", text: "Please update the retry limit to three and show me the change. Keep the existing timeout and connection settings unchanged. Explain what you changed and how you checked it so I can review the result before we move on." }] },
        { role: "assistant", parts: [{ type: "text", text: "Updated **retries** to **3**. The request now retries up to three times before reporting an error." }] },
      ];
      await chat.updateComplete;
    }, scheme);
    const chat = page.locator("chat-view");
    const request = chat.locator('.chat-message[data-speaker="user"]');
    const reply = chat.locator('.chat-message[data-speaker="assistant"]');
    await expect(request).toHaveCSS("border-inline-start-width", "3px");
    await expect(reply).toHaveCSS("border-inline-start-width", "3px");
    await expect(request).toHaveCSS("margin-inline-start", "0px");
    await expect(reply).toHaveCSS("margin-inline-start", "0px");
    const requestBorder = await request.evaluate((element) => getComputedStyle(element).borderInlineStartColor);
    const replyBorder = await reply.evaluate((element) => getComputedStyle(element).borderInlineStartColor);
    expect(requestBorder).not.toBe(replyBorder);
    const cue = (element: Element) => {
      const style = getComputedStyle(element, "::before");
      return {
        content: style.content, width: style.width, height: style.height,
        mask: style.maskImage, clip: style.clipPath, start: style.insetInlineStart, float: style.cssFloat,
        background: style.backgroundColor, pointerEvents: style.pointerEvents,
      };
    };
    const requestCue = await request.locator(".chat-message-content").evaluate(cue);
    const replyCue = await reply.locator(".chat-message-content").evaluate(cue);
    expect(requestCue).toMatchObject({
      content: '""', width: "6px", height: "10px", start: "0px",
      mask: "none", float: "none", pointerEvents: "none",
      clip: "polygon(0% 0%, 25% 0%, 100% 50%, 25% 100%, 0% 100%, 75% 50%)",
    });
    expect(replyCue.clip).toBe("polygon(100% 0%, 75% 0%, 0% 50%, 75% 100%, 100% 100%, 25% 50%)");
    for (const bubble of [request, reply]) {
      await expect(bubble.locator("formatted-text p").first()).toBeVisible();
      const geometry = await bubble.evaluate((element) => {
        const content = element.querySelector(".chat-message-content");
        const paragraph = element.querySelector("formatted-text")?.shadowRoot?.querySelector("p");
        if (!content || !paragraph) throw new Error("Missing message anatomy");
        const box = content.getBoundingClientRect();
        const marker = getComputedStyle(content, "::before");
        const left = box.left + Number.parseFloat(marker.insetInlineStart);
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        const lines = [...range.getClientRects()].filter((rect) => rect.width > 0).sort((a, b) => a.top - b.top || a.left - b.left);
        return {
          markerLeft: left, markerRight: left + Number.parseFloat(marker.width),
          firstLineLeft: lines[0]?.left, lastLineLeft: lines.at(-1)?.left,
          normalTextLeft: box.left + 12,
          markerBottom: box.top + Number.parseFloat(marker.top) + Number.parseFloat(marker.height),
          contentBottom: box.bottom,
        };
      });
      expect(geometry.markerLeft).toBeGreaterThanOrEqual(3);
      expect(geometry.markerRight - geometry.markerLeft).toBe(6);
      expect(geometry.firstLineLeft).toBeGreaterThanOrEqual(geometry.markerRight + 6);
      expect(geometry.markerBottom).toBeLessThanOrEqual(geometry.contentBottom);
      if (bubble === request) {
        // The small cue fits the existing inset; no line needs an extra text column.
        expect(geometry.firstLineLeft).toBeCloseTo(geometry.normalTextLeft, 0);
        expect(geometry.lastLineLeft).toBeCloseTo(geometry.normalTextLeft, 0);
      }
    }
    await request.getByRole("button", { name: "Message actions", exact: true }).click();
    await request.getByRole("button", { name: "Message information" }).click();
    await expect(request.locator(".chat-message-meta")).toBeVisible();
    await request.getByRole("button", { name: "Message actions", exact: true }).click();
    await request.getByRole("button", { name: "Message information" }).click();
    await expect(request.locator(".chat-message-meta")).toBeHidden();
    await expect(request.locator(".chat-message-header .label")).toHaveCount(0);
    await expect(reply.locator(".chat-message-header .label")).toHaveCount(0);

    // Resolve the real CSS custom properties, including color-mix, in the browser.
    // These are the small-text foreground/background pairs used by chat, code,
    // shared controls, and diff metadata; this is not a whole-app certification.
    const contrasts = await page.evaluate(() => {
      const probe = document.createElement("span");
      document.body.append(probe);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Missing color conversion canvas");
      const luminance = (value: string): number => {
        probe.style.color = value;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = getComputedStyle(probe).color;
        context.fillRect(0, 0, 1, 1);
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
        const linear = (channel: number): number => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        };
        return linear(red ?? 0) * 0.2126 + linear(green ?? 0) * 0.7152 + linear(blue ?? 0) * 0.0722;
      };
      const ratio = (foreground: string, background: string): number => {
        const a = luminance(`var(--pi-${foreground})`);
        const b = luminance(`var(--pi-${background})`);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      const result: Record<string, number> = {};
      for (const foreground of ["text", "text-secondary", "muted", "dim", "accent", "success", "warning", "danger", "syntax-keyword", "syntax-title", "syntax-string", "syntax-number", "syntax-comment"]) {
        for (const background of ["bg", "surface", "surface-hover", "selection-bg"]) {
          result[`${foreground}/${background}`] = ratio(foreground, background);
        }
      }
      probe.remove();
      return result;
    });
    for (const [pair, ratio] of Object.entries(contrasts)) expect(ratio, `${scheme}: ${pair}`).toBeGreaterThanOrEqual(4.5);

    const input = page.locator("prompt-editor .cm-content");
    await input.pressSequentially("/");
    const candidate = page.locator('autocomplete-menu .ui-choice[data-selected="true"]');
    await expect(candidate).toBeVisible();
    expect(await candidate.evaluate((element) => getComputedStyle(element, "::after").borderInlineStartWidth)).toBe("2px");
    await input.press("Escape");
    await page.evaluate(() => window.overlayFixture.mountRenderer());
    const renderer = page.locator("#theme-renderer");
    await renderer.scrollIntoViewIfNeeded();
    const highlighted = renderer.getByRole("button", { name: "Highlighted", exact: true });
    const raw = renderer.getByRole("button", { name: "Raw", exact: true });
    await expect(highlighted).toHaveAttribute("data-selected", "true");
    expect(await highlighted.evaluate((element) => getComputedStyle(element, "::after").borderBlockEndWidth)).toBe("2px");
    await raw.click();
    await expect(raw).toHaveAttribute("data-selected", "true");
    expect(await raw.evaluate((element) => getComputedStyle(element, "::after").borderBlockEndWidth)).toBe("2px");
    expect(await highlighted.evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");

    // Use the user's system foreground for chevrons when forced colours discard fills.
    await page.emulateMedia({ forcedColors: "active" });
    const forcedCue = await request.locator(".chat-message-content").evaluate(cue);
    expect(forcedCue.clip).toBe(requestCue.clip);
    expect(forcedCue.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(await raw.evaluate((element) => getComputedStyle(element, "::after").borderBlockEndStyle)).toBe("solid");
    await page.emulateMedia({ forcedColors: "none" });
    await chat.scrollIntoViewIfNeeded();
    const screenshot = test.info().outputPath(`playground-${scheme}.png`);
    await page.screenshot({ path: screenshot });
    await test.info().attach(`playground-${scheme}`, { path: screenshot, contentType: "image/png" });

    // Placement follows the inline edge in RTL; sent/received directions stay fixed.
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    expect((await request.locator(".chat-message-content").evaluate(cue)).clip).toBe(requestCue.clip);
    expect(await chat.evaluate((element) => {
      const scroller = element.shadowRoot?.querySelector(".chat");
      return scroller !== null && scroller !== undefined && scroller.scrollWidth <= scroller.clientWidth;
    })).toBe(true);
    await page.evaluate(() => { document.documentElement.dir = "ltr"; });

    // Real stylesheet switching must remove experiments, not leak into existing themes.
    await page.evaluate((scheme) => window.overlayFixture.applyTheme(`themes:pi-web-${scheme}`), scheme);
    expect((await request.locator(".chat-message-content").evaluate(cue)).content).toBe("none");
    await expect(request).toHaveCSS("border-inline-start-width", "3px");
    await expect(request).toHaveCSS("margin-inline-start", "0px");
    expect(await raw.evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");
  });
}
