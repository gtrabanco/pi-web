---
"@jmfederico/pi-web": patch
---

Include only default-theme metadata and CSS with the initial page, fetch other themes individually when needed, and load the full inventory in General settings once per dialog, with explicit retry on failure. Load themes alongside the application, showing the PI WEB mark and a reduced-motion-aware spinner in a browser-native loading screen until the first palette and app render are ready. Cache theme CSS and relative assets at revision-qualified URLs, and keep a usable fallback on loading failures. Preserve built-in theme IDs, saved choices, and configuration precedence. Theme-only packages need no browser JavaScript or server module; legacy runtime themes remain supported with a deprecation warning.
