import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * PI WEB builds directly on the pi SDK barrels, so a packaging regression in
 * any of them breaks PI WEB at startup before any of our code runs. This
 * actually happened with pi 0.85.0 (issue #212): its barrel statically
 * re-exports `main`, which imports `experimental/server.js`, which imports
 * `@earendil-works/pi-server` without pi-coding-agent declaring that
 * dependency — every `import "@earendil-works/pi-coding-agent"` died with
 * ERR_MODULE_NOT_FOUND and PI WEB could not start.
 *
 * The contract PI WEB relies on is twofold:
 * 1. Every pi package involved must actually load and export the API surface
 *    PI WEB uses. PI WEB declares `@earendil-works/pi-server` itself (see
 *    package.json peerDependencies) because pi-coding-agent 0.85+ requires it
 *    without declaring it, so the declaration is asserted too.
 * 2. The declaration must exist in package.json so published installs (which
 *    auto-install peer dependencies) always provide the package, even when CI
 *    or a contributor tree happens to have it hoisted from something else.
 *
 * The SDK imports must stay dynamic (via `import()`) so a broken package
 * surfaces as one crisp failing test here instead of a pile of collection
 * errors across every suite that statically imports the barrels.
 */
describe("pi SDK package integrity", () => {
  it("loads @earendil-works/pi-coding-agent and exports the API surface PI WEB uses", async () => {
    const resolved = await import("@earendil-works/pi-coding-agent");

    for (const name of [
      "CredentialSynchronizationError",
      "DefaultPackageManager",
      "DefaultResourceLoader",
      "ModelRuntime",
      "ProjectTrustStore",
      "SessionManager",
      "SettingsManager",
      "Theme",
      "VERSION",
      "defineTool",
      "formatDimensionNote",
      "resizeImage",
    ] as const) {
      expect(name in resolved, `missing export: ${name}`).toBe(true);
    }
  });

  it("loads @earendil-works/pi-agent-core and exports the API surface PI WEB uses", async () => {
    const resolved = await import("@earendil-works/pi-agent-core");

    expect("runAgentLoop" in resolved, "missing export: runAgentLoop").toBe(true);
  });

  it("loads @earendil-works/pi-ai and exports the API surface PI WEB uses", async () => {
    const resolved = await import("@earendil-works/pi-ai");

    for (const name of ["InMemoryCredentialStore", "createAssistantMessageEventStream", "modelsAreEqual"] as const) {
      expect(name in resolved, `missing export: ${name}`).toBe(true);
    }
  });

  it("loads @earendil-works/pi-server, which pi-coding-agent 0.85+ requires without declaring", async () => {
    const resolved = await import("@earendil-works/pi-server");

    expect(Object.keys(resolved).length, "pi-server resolved to an empty module").toBeGreaterThan(0);
  });

  it("declares @earendil-works/pi-server as a peer and dev dependency", () => {
    const parsed: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    if (!isRecord(parsed)) throw new Error("package.json did not parse to an object");
    if (!isRecord(parsed["peerDependencies"]) || !isRecord(parsed["devDependencies"])) {
      throw new Error("package.json is missing peerDependencies or devDependencies sections");
    }

    expect(
      parsed["peerDependencies"]["@earendil-works/pi-server"],
      "@earendil-works/pi-server must be declared in peerDependencies so published installs auto-provide it",
    ).toBeTruthy();
    expect(
      parsed["devDependencies"]["@earendil-works/pi-server"],
      "@earendil-works/pi-server must be declared in devDependencies so the repo test tree provides it",
    ).toBeTruthy();
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
