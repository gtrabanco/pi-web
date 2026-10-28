// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Machine } from "../api";
import { installPopoverFake } from "./anchoredPopup.testSupport";
installPopoverFake();
import { MachineList } from "./MachineList";
import { MachineSwitcher } from "./MachineSwitcher";

beforeEach(() => {
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined);
});
afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

const local = machine("local", "local");
const remote = machine("remote / ?%雪");
const other = machine("remote---?%雪");

function machine(id: string, kind: Machine["kind"] = "remote"): Machine {
  return { id, name: id, kind, createdAt: "2026-06-04", updatedAt: "2026-06-04" };
}

type MachineComponent = MachineList | MachineSwitcher;

async function settle(component: MachineComponent): Promise<void> {
  await component.updateComplete;
  await component.updateComplete;
}

async function mount(component: MachineComponent, machines = [local, remote, other]): Promise<void> {
  component.machines = machines;
  component.onSelect = vi.fn();
  component.onEdit = vi.fn();
  component.onRemove = vi.fn();
  document.body.append(component);
  await settle(component);
}

function button(root: ParentNode, selector: string): HTMLButtonElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing native button: ${selector}`);
  return found;
}

function option(component: MachineSwitcher, id: string): HTMLButtonElement {
  const found = [...component.renderRoot.querySelectorAll<HTMLButtonElement>(".machine-option-main")]
    .find((candidate) => candidate.dataset["machineId"] === id);
  if (!found) throw new Error(`Missing machine option: ${id}`);
  return found;
}

function actionTrigger(component: MachineComponent, id: string): HTMLButtonElement {
  if (component instanceof MachineSwitcher) {
    const row = option(component, id).parentElement;
    if (!row) throw new Error("Missing option row");
    return button(row, ".machine-option-actions-toggle");
  }
  const row = [...component.renderRoot.querySelectorAll<HTMLElement>(".machine-row")]
    .find((candidate) => candidate.dataset["machineId"] === id);
  if (!row) throw new Error(`Missing machine row: ${id}`);
  return button(row, ".action-menu-toggle");
}

function linkedPanel(component: MachineComponent, trigger: HTMLButtonElement, context: string): HTMLElement {
  expect(trigger.classList.contains("ui-popup-trigger")).toBe(true);
  expect(trigger.getAttribute("role")).toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  const id = trigger.getAttribute("aria-controls");
  expect(id).toBeTruthy();
  const panel = component.shadowRoot?.getElementById(id ?? "");
  if (!(panel instanceof HTMLElement)) throw new Error(`Missing linked panel: ${String(id)}`);
  expect(panel.tagName).toBe("DIV");
  expect(panel.matches(".ui-menu.ui-popup-panel[popover=auto]")).toBe(true);
  expect(panel.dataset["uiContext"]).toBe(context);
  expect(panel.getAttribute("role")).toBeNull();
  expect(panel.getRootNode()).toBe(component.shadowRoot);
  expect(panel.hasAttribute("data-tone")).toBe(false);
  return panel;
}

async function openPicker(component: MachineComponent): Promise<HTMLButtonElement | undefined> {
  if (!(component instanceof MachineSwitcher)) return undefined;
  const trigger = button(component.renderRoot, ".machine-switcher-button");
  trigger.focus();
  trigger.click();
  await settle(component);
  linkedPanel(component, trigger, "machine-picker");
  expect(component.shadowRoot?.activeElement).toBe(trigger);
  return trigger;
}

function key(target: HTMLElement, value: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, composed: true, cancelable: true }));
}

describe.each([
  { name: "MachineList", Component: MachineList },
  { name: "MachineSwitcher", Component: MachineSwitcher },
])("$name menu styling contract", ({ Component }) => {
  it("links native action triggers to distinct encoded panels without changing roles", async () => {
    const component = new Component();
    // These identities collided under the old lossy replacement.
    const first = machine("remote/a");
    const second = machine("remote?a");
    await mount(component, [local, first, second, remote]);
    await openPicker(component);
    const ids = new Set<string>();
    for (const target of [first, second, remote]) {
      const trigger = actionTrigger(component, target.id);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      trigger.focus();
      trigger.click();
      await settle(component);
      const panel = linkedPanel(component, trigger, "machine-actions");
      expect(panel.id).toContain(encodeURIComponent(target.id));
      ids.add(panel.id);
      expect(component.shadowRoot?.activeElement).toBe(trigger);
      expect(component.onSelect).not.toHaveBeenCalled();
      trigger.click();
      await settle(component);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(component.shadowRoot?.getElementById(panel.id)).toBeNull();
    }
    expect(ids.size).toBe(3);
    const localRow = component.renderRoot.querySelector(component instanceof MachineSwitcher ? ".machine-option.no-actions" : ".machine-row.no-actions");
    expect(localRow?.querySelector(".ui-popup-trigger")).toBeNull();
  });

  it.each(["edit", "remove"] as const)("keeps native %s actions, callbacks and dismissal", async (action) => {
    const component = new Component();
    await mount(component);
    await openPicker(component);
    const trigger = actionTrigger(component, remote.id);
    trigger.click();
    await settle(component);
    const panel = linkedPanel(component, trigger, "machine-actions");
    const actions = [...panel.querySelectorAll<HTMLButtonElement>("button.ui-menu-item")];
    expect(actions).toHaveLength(2);
    const edit = actions.find((item) => !item.classList.contains("danger"));
    const remove = actions.find((item) => item.classList.contains("danger"));
    expect(edit?.textContent).toBe("Edit display name");
    expect(remove?.textContent).toBe("Remove");
    expect(remove?.title).toContain(remote.name);
    for (const item of actions) {
      expect(item.matches(".ui-button.ui-menu-item")).toBe(true);
      for (const attribute of ["role", "data-tone", "data-selected", "data-disabled", "aria-disabled"]) {
        expect(item.hasAttribute(attribute)).toBe(false);
      }
      expect(item.disabled).toBe(false);
    }
    const target = action === "edit" ? edit : remove;
    if (!target) throw new Error(`Missing ${action} action`);
    target.click();
    await settle(component);
    expect(action === "edit" ? component.onEdit : component.onRemove).toHaveBeenCalledExactlyOnceWith(remote);
    expect(action === "edit" ? component.onRemove : component.onEdit).not.toHaveBeenCalled();
    expect(component.onSelect).not.toHaveBeenCalled();
    expect(component.renderRoot.querySelector(".ui-popup-panel")).toBeNull();
    const remainingTrigger = component instanceof MachineSwitcher ? button(component.renderRoot, ".machine-switcher-button") : trigger;
    expect(remainingTrigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("restores action-trigger focus on Escape and retains outside focus on light dismissal", async () => {
    const component = new Component();
    await mount(component);
    await openPicker(component);
    const trigger = actionTrigger(component, remote.id);
    trigger.click();
    await settle(component);
    const panel = linkedPanel(component, trigger, "machine-actions");
    const edit = button(panel, "button");
    edit.focus();
    key(edit, "Escape");
    await settle(component);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(component.shadowRoot?.activeElement).toBe(trigger);
    trigger.click();
    await settle(component);
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    outside.click();
    await settle(component);
    expect(component.renderRoot.querySelector(".ui-popup-panel")).toBeNull();
    expect(document.activeElement).toBe(outside);
    const remainingTrigger = component instanceof MachineSwitcher ? button(component.renderRoot, ".machine-switcher-button") : trigger;
    expect(remainingTrigger.getAttribute("aria-expanded")).toBe("false");
  });
});

it.each([
  { machines: [remote, local, other], current: local },
  { machines: [remote, other], current: remote },
])("keeps fallback current identity separate from keyboard focus", async ({ machines, current }) => {
  const component = new MachineSwitcher();
  await mount(component, machines);
  expect(component.renderRoot.querySelector(".machine-switcher-label")?.textContent).toBe(current.name);
  expect(await component.focusSelectedOrFirst()).toBe(true);
  await settle(component);
  const currentOption = option(component, current.id);
  expect(component.shadowRoot?.activeElement).toBe(currentOption);
  const next = machines.find((candidate) => candidate.id !== current.id);
  if (!next) throw new Error("Missing second machine");
  key(currentOption, "Home");
  key(option(component, machines[0]?.id ?? ""), "End");
  const last = machines.at(-1);
  if (!last) throw new Error("Missing last machine");
  expect(component.shadowRoot?.activeElement).toBe(option(component, last.id));
  for (const candidate of machines) {
    const item = option(component, candidate.id);
    const isCurrent = candidate.id === current.id;
    expect(item.matches("button.ui-menu-item")).toBe(true);
    expect(item.dataset["current"]).toBe(String(isCurrent));
    expect(item.getAttribute("aria-current")).toBe(isCurrent ? "true" : null);
    expect(item.parentElement?.classList.contains("selected")).toBe(isCurrent);
    for (const attribute of ["role", "data-selected", "data-disabled", "data-tone"]) expect(item.hasAttribute(attribute)).toBe(false);
  }
  expect(component.onSelect).not.toHaveBeenCalled();
  component.selected = next;
  await settle(component);
  expect(currentOption.getAttribute("aria-current")).toBeNull();
  expect(currentOption.dataset["current"]).toBe("false");
  expect(currentOption.parentElement?.classList.contains("selected")).toBe(false);
  expect(option(component, next.id).getAttribute("aria-current")).toBe("true");
  expect(option(component, next.id).parentElement?.classList.contains("selected")).toBe(true);
  currentOption.click();
  await settle(component);
  expect(component.onSelect).toHaveBeenCalledExactlyOnceWith(current);
  expect(component.renderRoot.querySelector(".ui-popup-panel")).toBeNull();
});

it("dismisses nested actions before the picker and restores each trigger in order", async () => {
  const component = new MachineSwitcher();
  await mount(component);
  const pickerTrigger = await openPicker(component);
  if (!pickerTrigger) throw new Error("Missing picker trigger");
  const trigger = actionTrigger(component, remote.id);
  trigger.click();
  await settle(component);
  const picker = linkedPanel(component, pickerTrigger, "machine-picker");
  const actions = linkedPanel(component, trigger, "machine-actions");
  expect(picker.contains(actions)).toBe(true);
  const edit = button(actions, "button");
  edit.focus();
  key(edit, "Escape");
  await settle(component);
  expect(component.renderRoot.querySelector('[data-ui-context="machine-actions"]')).toBeNull();
  expect(linkedPanel(component, pickerTrigger, "machine-picker")).toBe(picker);
  expect(component.shadowRoot?.activeElement).toBe(trigger);
  key(trigger, "Escape");
  await settle(component);
  expect(component.renderRoot.querySelector(".ui-popup-panel")).toBeNull();
  expect(pickerTrigger.getAttribute("aria-expanded")).toBe("false");
  expect(component.shadowRoot?.activeElement).toBe(pickerTrigger);
  expect(component.onSelect).not.toHaveBeenCalled();
  expect(component.onEdit).not.toHaveBeenCalled();
  expect(component.onRemove).not.toHaveBeenCalled();
});
