# Design

The source of truth for how LatinType looks. Read it before UI work, and update it when a decision changes. Product facts live in `PRODUCT.md`.

## Direction

A calm terminal session. The screen behaves like tmux: a logo, a tab row, panes framed in plain ASCII, and a status bar. The Latin is the largest thing on screen, and the scansion marks are the signature.

## Rules

- Square corners, no shadows, no glow, no blur, no gradients, no emoji, no cards.
- Frames use real ASCII characters (`+ - |`). Box-drawing characters are out because the web font does not line them up.
- Long syllables show as `---` and short syllables as `\_/`, both real text characters. The data stores `—` and `∪`, and the `Mark` component renders them.
- Lowercase interface copy. Buttons read `[like this]`, using the `.btn` class.
- Selected tabs and modes are inverted cells, using `.tab.on`.
- Dropdowns use `Select`, never a native `<select>`, because option lists can't be styled. The list is an ASCII pane with `>` on the current choice.
- Motion is limited to a 150ms line scroll, and it respects reduced motion.
- Never add a saturated full-screen colour or bright yellow.

## Colour

Six palettes, all cycleable. Tokens are set on `:root[data-palette]` in `src/index.css`. All text roles pass WCAG AA on their background.

| Palette | bg | text | sub | dim | mark | bar |
|---|---|---|---|---|---|---|
| slate (default) | `#2a2f2d` | `#e0e0d6` | `#a8ada4` | `#939991` | `#dba184` | `#454b48` |
| graphite | `#1b1c1e` | `#dcdcd8` | `#9b9d9e` | `#85878a` | `#d98e73` | `#36383b` |
| bark | `#2b2622` | `#e6dcc8` | `#b0a594` | `#978c7c` | `#d9966a` | `#4a4138` |
| fjord | `#262c36` | `#dde3ea` | `#a3adba` | `#8a95a3` | `#8fc1c9` | `#3f4856` |
| moss | `#232a24` | `#d6e2cc` | `#a1ad9c` | `#8a978a` | `#b9cf8f` | `#3c463d` |
| proof (light) | `#e6e7e2` | `#25282a` | `#575c5a` | `#626765` | `#8e3b2c` | `#cdcfc8` |

`mark` is reserved for scansion, mistakes and the top three score ranks. Part-of-speech colours are the `--pos-*` tokens, with a separate set for the light palette. Tailwind names are `paper`, `ink`, `sub`, `dim`, `mark` and `bar`.

## Type

- Interface: JetBrains Mono everywhere, so character art aligns. It is 0.875rem, and the root size scales with the window (16px to 32px), so use rem and ch rather than px.
- Latin: the player's choice, set only on the verse. The default is Doto, a dot-matrix face. Doto has no ō or ȳ, so the `Letter` component draws every macron in matching dots. Other options must keep a and o distinct and include macrons, so Syne Mono, Share Tech Mono, DotGothic16 and Sixtyfour are out.
- Typing size defaults to 32px at the base scale, grows with the window, and shrinks to fit the longest line. Reading caps at 26px at the base scale.

## Screens

- **Shell:** Sub-Zero logo at `lg` and up, Small Slant below. Tabs on the left, palette, font and settings on the right.
- **Type:** selectors and modes, verse, then the scansion map and run panes, then the status bar.
- **While typing:** menus and panes stay visible by default. The "hide menus" setting optionally hides everything except the verse and status bar, using `visibility` so the verse never jumps. Esc brings them back. Esc always releases the keyboard.
- **Read:** selectors and view toggles, with the passage in a pane. Part-of-speech and annotation tools appear only when switched on.
- **Scores:** the player's own best runs from this browser, in a plain table with fixed columns and tabs by mode.
- **Overlays:** settings and dictionary use one centred pane over a dimmed page.

## Components

`src/components/ascii.jsx` holds `Pane`, `Rule`, `Logo`, `Overlay` and the scansion helpers. Use these rather than new frames.
