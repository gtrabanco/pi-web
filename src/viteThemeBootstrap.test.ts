import { createServer } from "vite";
import { describe, expect, it, vi } from "vitest";
import { devThemeBootstrapPlugin } from "../vite.config.js";

const source = '<script id="pi-web-theme-data" type="application/json"></script>';

describe("Vite initial HTML bootstrap", () => {
  it("injects backend data only for actual HTML requests and tolerates backend failure", async () => {
    const bootstrap = { catalog: { themes: [], themePairs: [] }, stylesheets: [] };
    const load = vi.fn(() => Promise.resolve(bootstrap));
    const server = await createServer({
      configFile: false, plugins: [devThemeBootstrapPlugin(load)], logLevel: "silent",
      server: { middlewareMode: true, watch: null, hmr: false, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    try {
      expect(await server.transformIndexHtml("/", source)).not.toContain('"catalog"');
      expect(load).not.toHaveBeenCalled();
      const html = await server.transformIndexHtml("/", source, "/?initial");
      expect(html).toContain(JSON.stringify(bootstrap));
      load.mockRejectedValueOnce(new Error("offline"));
      const fallback = await server.transformIndexHtml("/", source, "/");
      expect(fallback).toContain(source);
    } finally { await server.close(); }
  });
});
