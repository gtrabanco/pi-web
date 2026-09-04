---
"@jmfederico/pi-web": patch
---

Restore compatibility with pi 0.85.0. The `@earendil-works/pi-coding-agent` 0.85.0 entry point now transitively imports `@earendil-works/pi-server` without declaring it as a dependency, so importing the SDK failed with `ERR_MODULE_NOT_FOUND` and PI WEB could not start. PI WEB now declares `@earendil-works/pi-server` alongside the other pi SDK peer dependencies, dev-dependencies are updated to the 0.85.0 line, and a new package-integrity test guards the SDK import surface so this class of upstream packaging regression is caught by `npm test` instead of at startup.
