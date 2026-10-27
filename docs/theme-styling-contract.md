# Theme styling contract

Themes can change presentation without changing the meaning or behavior of controls. This initial contract covers conversation messages and two choice surfaces: code renderers and composer completions. Other selectors, palette properties, and layout details remain experimental.

## Compatibility and ownership

The hooks listed below are supported styling interfaces. Keep them available and preserve their documented meaning when refactoring components. Additive hooks are compatible; replacing or removing a supported hook requires an explicit compatibility migration rather than silently changing the markup. This contract does not freeze the appearance, dimensions, unlisted tag names, or unrelated DOM structure.

Three responsibilities compose:

- **Primitive:** generic control anatomy and state, such as a choice and whether it is selected.
- **Semantic context:** what the surface represents, such as renderer views or a user message.
- **Theme:** colours, spacing, alignment, borders, and decorative cues.

These are responsibilities, not a requirement for two DOM elements around every control. Use an existing container for context; a domain hook can also live on the control itself. Native semantics, accessible names, event handling, and focus management belong to the component, not CSS.

Base defaults for these surfaces live in the `pi-web-base` cascade layer. Ordinary unlayered contributed CSS overrides them. Scope rules to the host or documented context: contributed sheets reach multiple shadow roots, but selectors do not cross a shadow boundary. Inherited custom properties can cross it. See [theme architecture](theme-architecture.md) and [stylesheet integration](plugins.md#css-files-and-shadow-roots).

## Conversation messages

Inside `:host(chat-view)`, these hooks identify ordinary user and assistant message surfaces, including their image/code content:

| Hook | Meaning |
| --- | --- |
| `.chat-message` | Outer message surface; owns the border, background, width, and alignment |
| `[data-speaker="user"]`, `[data-speaker="assistant"]` | Speaker identity on that surface; independent of its appearance |
| `.chat-message-content` | Direct child containing the header and body; positioned relative by default |
| `.chat-message-header` | Header inside the content wrapper; contains the accessible speaker label and message actions |
| `.chat-message-body` | Body inside the content wrapper; contains message parts |
| `.chat-message-meta` | Metadata region immediately after the content wrapper; native `hidden` tracks whether it is open |
| `.chat-message-content::before` | Reserved for an optional theme-owned decorative speaker cue; unused by the base theme |

Activity groups, tool-image bundles, tools, and system notices are not conversation bubbles and do not expose `.chat-message`. Do not infer these roles from colours or use the older internal `.user`, `.assistant`, or `.conversation-*` classes as the compatibility boundary.

Themes may change the edge width/style, rounding, padding, and alignment using these hooks. For example:

```css
:host(chat-view) .chat-message {
  border-inline-start-width: 2px;
  border-inline-start-style: dotted;
}

:host(chat-view) .chat-message[data-speaker="user"] {
  max-inline-size: 85%;
  margin-inline-start: auto;
}

:host(chat-view) .chat-message[data-speaker="assistant"] {
  max-inline-size: 85%;
  margin-inline-end: auto;
}
```

### Optional decorative icons

No visible role labels or icons are required. A theme can introduce a decorative icon without adding HTML. Use an empty pseudo-element and a background or mask image, rather than generated text or emoji that may affect accessible names.

This example creates an icon column at the beginning of each message. A theme supplies its own assets and may use a different mask for each speaker:

```css
:host(chat-view) .chat-message-content {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
}

:host(chat-view) .chat-message-content::before {
  content: "";
  grid-column: 1;
  grid-row: 1;
  inline-size: 14px;
  block-size: 14px;
  margin-block-start: 12px;
  margin-inline-start: 4px;
  background: currentColor;
  mask: var(--example-speaker-mask) center / contain no-repeat;
  pointer-events: none;
}

:host(chat-view) .chat-message[data-speaker="user"] {
  --example-speaker-mask: url("./user.svg");
}

:host(chat-view) .chat-message[data-speaker="assistant"] {
  --example-speaker-mask: url("./robot.svg");
}

:host(chat-view) .chat-message-body {
  grid-column: 2;
  grid-row: 1;
}
```

The asset paths are relative to the contributed CSS file. `--example-speaker-mask` belongs to this example, not the core property contract. A theme can resize or shorten a decorative edge using the same pseudo-element instead of an icon. It can remove the cue with `content: none` and restore a one-column layout when alignment or another treatment already distinguishes the speakers. Keep the component's screen-reader speaker labels and interactive header intact.

## Selected choices

| Host | Context container | Choice hook | State |
| --- | --- | --- | --- |
| `:host(pi-web-content-renderer)` | `[data-ui-context="content-views"]` | `button.ui-choice` | `data-selected="true"` or `"false"` |
| `:host(autocomplete-menu)` | `[data-ui-context="completions"]` | `button.ui-choice` | `data-selected="true"` or `"false"` |

The context containers already exist for layout; choices are direct children. `.ui-choice` is a generic styling hook, not a new widget or an opt-in behavior. Renderer choices also use `.ui-button` and retain `aria-pressed`; Raw participates in the same contract. Completion selection identifies the keyboard candidate, not a toggled button, so it does not acquire `aria-pressed` or an invented ARIA selection role.

`data-selected` is the shared presentation state. Components update it with the actual selected view or keyboard candidate; themes must not infer selection from hover, focus, or DOM order. Hover and keyboard selection may coexist on different choices.

`button.ui-choice::after` is reserved for an optional theme-owned decorative selection cue. The base does not generate it. For example, add a short underline without changing the button label:

```css
:host(pi-web-content-renderer) [data-ui-context="content-views"] > .ui-choice {
  position: relative;
}

:host(pi-web-content-renderer) [data-ui-context="content-views"] > .ui-choice[data-selected="true"]::after {
  content: "";
  position: absolute;
  inset-inline: 8px;
  inset-block-end: 2px;
  block-size: 2px;
  background: currentColor;
  pointer-events: none;
}
```

A theme may use a different geometric cue for completions. Keep focus independently visible; selection is not focus. This initial contract adds hooks without changing the existing base selection treatments.

## Accessibility and verification

Themes may replace a cue, rather than display every possible cue. Speaker identity and meaningful states should remain visually distinguishable without hue alone. Small, restrained geometric cues can do this without repeated labels or prominent icons. Do not remove the only distinction unless another treatment replaces it.

Preserve readable contrast, accessible names, focus indicators, native hidden/disabled states, usable targets, and document reading order. Decorative pseudo-elements must not intercept clicks or convey information unavailable from component semantics. Check forced colours as well as colour-vision simulations; background images and masks may disappear in forced-colour modes, so provide a structural fallback where needed.

DOM tests protect the hooks and state synchronization. Browser tests exercise theme overrides, decorative masks, alignment, and removal against real components at desktop and touch viewport sizes. These checks establish a styling boundary, not certification of every custom theme. Navigation rows and the rest of the UI can adopt further contracts after their shared anatomy has been exercised.
