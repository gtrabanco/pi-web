// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStatus } from "../api";
import { COMPOSER_SEND_DESKTOP, COMPOSER_SEND_MOBILE } from "../composerShortcuts";
import { installPopoverFake } from "./anchoredPopup.testSupport";
import { PromptEditor } from "./PromptEditor";

installPopoverFake();
const matchMedia = window.matchMedia.bind(window);

beforeEach(() => {
  stubPointer(false);
  // CodeMirror measurement belongs to browser tests, not the styling contract.
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubPointer(coarse: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const media = matchMedia(query);
    Object.defineProperty(media, "matches", { configurable: true, value: query.includes("pointer: coarse") && coarse });
    return media;
  });
}

function status(): SessionStatus {
  return {
    sessionId: "styling", model: { provider: "test", id: "first-model" }, thinkingLevel: "low",
    isStreaming: false, isCompacting: false, isBashRunning: false, pendingMessageCount: 0, queuedMessages: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, cost: 0,
  };
}

async function mount(shortcut: string | null = "mod+enter") {
  const editor = new PromptEditor();
  editor.shortcuts = { [COMPOSER_SEND_DESKTOP]: shortcut, [COMPOSER_SEND_MOBILE]: shortcut };
  editor.status = status();
  editor.onSend = vi.fn();
  document.body.append(editor);
  await editor.updateComplete;
  return editor;
}

function required(editor: PromptEditor, selector: string): HTMLElement {
  const element = editor.renderRoot.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`Missing composer element: ${selector}`);
  return element;
}

function action(editor: PromptEditor, name: string) {
  const button = required(editor, `button[data-composer-action="${name}"]`);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Expected native button: ${name}`);
  return button;
}

function root(editor: PromptEditor) {
  return required(editor, 'footer[data-ui-context="composer"]');
}

function expectDefault(editor: PromptEditor, expected: "send" | "queue" | "steer" | "none") {
  expect(root(editor).dataset["defaultAction"]).toBe(expected);
  const eligible = editor.renderRoot.querySelectorAll<HTMLButtonElement>(".send-button, .steer-button");
  for (const button of eligible) {
    const selected = expected !== "none" && button.dataset["composerAction"] === expected;
    expect(button.getAttribute("data-default")).toBe(String(selected));
    expect(button.classList.contains("default-send-action")).toBe(selected);
  }
  expect(editor.renderRoot.querySelectorAll(".default-send-action")).toHaveLength(expected === "none" ? 0 : 1);
  expect(action(editor, "stop").hasAttribute("data-default")).toBe(false);
}

describe("composer styling contract", () => {
  it("annotates the existing anatomy and native controls without inserting wrappers", async () => {
    const editor = await mount();
    const footer = root(editor);
    const toolbar = required(editor, ".actions");
    const settings = required(editor, ".ui-composer-settings");
    const actions = required(editor, ".ui-composer-actions");
    expect([...footer.children].map((element) => element.classList.contains("editor-wrap") ? "editor" : element === toolbar ? "toolbar" : "unexpected")).toEqual(["editor", "toolbar"]);
    expect(toolbar.classList.contains("ui-composer-toolbar")).toBe(true);
    expect(settings.classList.contains("ui-toolbar-group--bounded")).toBe(true);
    expect(settings.parentElement).toBe(required(editor, ".compact-status"));
    expect(settings.parentElement?.parentElement).toBe(toolbar);
    expect([...settings.children]).toEqual([action(editor, "model"), action(editor, "thinking")]);
    expect(actions.parentElement).toBe(toolbar);
    expect([...actions.children]).toEqual([action(editor, "send"), action(editor, "stop")]);
    expect(action(editor, "attach").parentElement).toBe(required(editor, ".editor-input"));
    for (const name of ["model", "thinking", "attach", "send", "stop"]) {
      expect(action(editor, name).classList.contains("ui-button")).toBe(true);
    }
    expect(footer.dataset["mode"]).toBe("text");
    expect(footer.dataset["busy"]).toBe("false");
    expect(footer.dataset["disabled"]).toBe("false");
    expect(footer.dataset["compacting"]).toBe("false");
    // An empty draft does not remove the configured default.
    expectDefault(editor, "send");
  });

  it.each([
    { canSteer: false, compacting: false, preference: "steer" as const, expected: "send" as const },
    { canSteer: true, compacting: false, preference: "steer" as const, expected: "steer" as const },
    { canSteer: true, compacting: false, preference: "followUp" as const, expected: "queue" as const },
    { canSteer: true, compacting: true, preference: "steer" as const, expected: "queue" as const },
  ])("synchronizes the default and preserves manual actions ($expected, compacting=$compacting)", async ({ canSteer, compacting, preference, expected }) => {
    const editor = await mount();
    editor.canSteer = canSteer;
    editor.isCompacting = compacting;
    editor.defaultStreamingBehavior = preference;
    editor.replaceText("Message");
    editor.focusInput();
    await editor.updateComplete;
    expect(root(editor).dataset["compacting"]).toBe(String(compacting));
    expectDefault(editor, expected);
    const primary = action(editor, canSteer || compacting ? "queue" : "send");
    expect(primary.classList.contains("send-button")).toBe(true);
    primary.click();
    await editor.updateComplete;
    expect(editor.onSend).toHaveBeenCalledWith("Message", canSteer || compacting ? "followUp" : undefined, undefined, undefined, undefined);
    expect(editor.view?.hasFocus).toBe(true);
    expectDefault(editor, expected);
    if (canSteer && !compacting) {
      editor.replaceText("Correction");
      const steer = action(editor, "steer");
      expect(steer.classList.contains("ui-button")).toBe(true);
      expect(steer.parentElement).toBe(primary.parentElement);
      steer.click();
      expect(editor.onSend).toHaveBeenLastCalledWith("Correction", "steer", undefined, undefined, undefined);
    } else {
      expect(editor.renderRoot.querySelector('[data-composer-action="steer"]')).toBeNull();
    }
  });

  it.each([null, "not-a-key", "mod+k mod+enter"])("does not advertise a default for %s but permits manual send", async (shortcut) => {
    const editor = await mount(shortcut);
    expectDefault(editor, "none");
    editor.replaceText("Manual message");
    action(editor, "send").click();
    expect(editor.onSend).toHaveBeenCalledOnce();
  });

  it.each(["disabled", "sending"] as const)("distinguishes native disabled controls from busy state for %s", async (property) => {
    const editor = await mount();
    editor.canSteer = true;
    editor.canStop = true;
    editor.onStop = vi.fn();
    editor[property] = true;
    await editor.updateComplete;
    expect(root(editor).dataset["busy"]).toBe(String(property === "sending"));
    expect(root(editor).dataset["disabled"]).toBe(String(property === "disabled"));
    expectDefault(editor, "none");
    for (const name of ["attach", "queue", "steer"]) expect(action(editor, name).disabled).toBe(true);
    const stop = action(editor, "stop");
    expect(stop.disabled).toBe(property === "disabled");
    stop.click();
    expect(editor.onStop).toHaveBeenCalledTimes(property === "disabled" ? 0 : 1);
    editor[property] = false;
    await editor.updateComplete;
    expectDefault(editor, "steer");
    expect(action(editor, "queue").disabled).toBe(false);
  });

  it("marks chip acknowledgment pending as busy until delivery settles", async () => {
    const editor = await mount();
    editor.promptChips = [{ id: "context", key: "context", pluginId: "test", target: { machineId: "local", sessionId: "styling" }, label: "Context", text: "Context content" }];
    let acknowledge: ((accepted: boolean) => void) | undefined;
    const pending = new Promise<boolean>((resolve) => { acknowledge = resolve; });
    editor.onSend = vi.fn(() => pending);
    await editor.updateComplete;
    action(editor, "send").click();
    await editor.updateComplete;
    expect(editor.sending).toBe(false);
    expect(root(editor).dataset["busy"]).toBe("true");
    expect(root(editor).dataset["disabled"]).toBe("false");
    expect(action(editor, "send").disabled).toBe(true);
    expectDefault(editor, "none");
    acknowledge?.(true);
    await pending;
    await editor.updateComplete;
    expect(root(editor).dataset["busy"]).toBe("false");
    expectDefault(editor, "send");
  });

  it("keeps model/thinking callbacks and focused native controls stable across status updates", async () => {
    const editor = await mount();
    editor.onSelectModel = vi.fn();
    editor.onSelectThinking = vi.fn();
    await editor.updateComplete;
    const model = action(editor, "model");
    const thinking = action(editor, "thinking");
    model.click();
    thinking.click();
    expect(editor.onSelectModel).toHaveBeenCalledOnce();
    expect(editor.onSelectThinking).toHaveBeenCalledOnce();
    for (const button of [model, thinking]) {
      button.focus();
      editor.status = { ...status(), model: { provider: "test", id: "updated-model" }, thinkingLevel: "high", cost: 1 };
      await editor.updateComplete;
      expect(action(editor, "model")).toBe(model);
      expect(action(editor, "thinking")).toBe(thinking);
      expect(editor.shadowRoot?.activeElement).toBe(button);
      expect(button.hasAttribute("aria-expanded")).toBe(false);
      expect(button.hasAttribute("aria-controls")).toBe(false);
    }
    expect(model.textContent).toContain("updated-model");
  });

  it("reports shell mode only when the shell UI actually renders", async () => {
    const editor = await mount();
    editor.replaceText("!pwd");
    await editor.updateComplete;
    expect(root(editor).dataset["mode"]).toBe("shell");
    expect(root(editor).classList.contains("shell-mode")).toBe(true);
    expect(required(editor, ".mode-hint")).toBeTruthy();
    editor.promptChips = [{ id: "context", key: "context", pluginId: "test", target: { machineId: "local", sessionId: "styling" }, label: "Context", text: "Context content" }];
    await editor.updateComplete;
    expect(root(editor).dataset["mode"]).toBe("text");
    expect(root(editor).classList.contains("shell-mode")).toBe(false);
    expect(editor.renderRoot.querySelector(".mode-hint")).toBeNull();
  });

  it.each([
    { android: false, coarse: false },
    { android: false, coarse: true },
    { android: true, coarse: false },
    { android: true, coarse: true },
  ])("annotates attachment sources for the platform, not pointer type (Android=$android, coarse=$coarse)", async ({ android, coarse }) => {
    stubPointer(coarse);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(android ? "Mozilla/5.0 (Linux; Android 14)" : "Unknown browser");
    const editor = await mount();
    const attach = action(editor, "attach");
    const panel = required(editor, ".attach-source-panel");
    expect(panel.dataset["uiContext"]).toBe("composer-attachment-sources");
    expect(panel.hasAttribute("popover")).toBe(true);
    expect(panel.parentElement).toBe(attach.parentElement);
    expect([...panel.querySelectorAll("button")]).toEqual([action(editor, "attach-photos"), action(editor, "attach-camera"), action(editor, "attach-files")]);
    for (const button of panel.querySelectorAll("button")) expect(button.classList.contains("ui-button")).toBe(true);
    expect(attach.getAttribute("aria-controls")).toBe(android ? panel.id : null);
    expect(attach.getAttribute("aria-expanded")).toBe(android ? "false" : null);
    if (android) {
      attach.click();
      await editor.updateComplete;
      expect(attach.getAttribute("aria-expanded")).toBe("true");
      panel.hidePopover();
      await editor.updateComplete;
      expect(attach.getAttribute("aria-expanded")).toBe("false");
    }
  });
});
