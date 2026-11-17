---
name: peekaboo
description: Creates a custom on-screen mascot for a web app. An original SVG character peeks out from behind page edges at random free spots, looks around, blinks and hides again. It leaves a keepsake, such as a hair tuft, ears or a hat tip, above the edge that users can click to call it back. Never covers the UI. Toggled with a keyboard shortcut. Interviews the user for the mascot's name, look, personality and keepsake, then draws it and wires it in. Use whenever someone wants a mascot, buddy, pet, easter egg, peeking or hiding character, or a playful animated companion in a website or web app, even if they don't say "mascot", for example "make a little guy peek out from my header".
license: MIT
compatibility: Web front ends (any framework or plain HTML). The bundled module is TypeScript with no dependencies; the SVG checker needs Python 3.
metadata:
  author: hinorashi
  version: "1.0.0"
---

# Peekaboo mascot

Build a small, original SVG mascot that lives at the edges of a web app. It peeks out at random spots that cover
nothing, looks left and right, blinks and sinks back. It leaves a recognizable bit of itself above the edge for a few
seconds that users can click to pull it out again. It is off by default and toggled with a shortcut. It stays silent
unless it cannot find room.

The behavior is solved in `assets/peekaboo.ts` + `assets/peekaboo.css`. Your work is the creative part (the character)
and the fitting part (which edges and obstacles in this app).

## Workflow

### 1. Interview the user

Ask before drawing anything. The character is personal, and guessing wastes a round of revisions. Use a structured
question tool if you have one (one form, sensible defaults); otherwise ask in one concise message. Collect:

| Field | Notes | Default |
|---|---|---|
| **Name** (required) | used in labels, storage key, shortcut letter | none, so ask |
| **Look** | species/type, colors/outfit, signature feature | none, so ask |
| **Personality** | e.g. shy, curious, sleepy, cheeky, stoic | curious |
| **Keepsake** | the part left above the edge: hair tuft, ears, antenna, hat tip… or none | top-most signature feature |
| **Where to hide** | header, sidebar, panels, footer, cards… | propose from the app's layout |
| **Shortcut** | toggle key | Alt + first letter of the name, if free |
| **Keepsake time** | seconds the keepsake stays | 10 s, configurable |
| **Size** | upright size in px | 80 × 100 |

Before asking, look at the app (layout files, header and main containers, existing shortcuts, toast system). Then you
can propose concrete edges and a conflict-free shortcut instead of asking open questions. If the user names an existing
character (anime, game, brand), confirm you will draw an original "inspired-by" chibi, not a copy of official art.

### 2. Draw the character

Read `references/character-design.md`. Write the SVG with the `pb-face`, `pb-eyes`, `pb-pupils` and `pb-keepsake`
parts, a viewBox matching the size ratio (40 × 50 for 80 × 100), and the keepsake reaching the top. Validate it:

```bash
python3 <skill-dir>/scripts/check_mascot_svg.py path/to/mascot.svg --width 80 --height 100
```

Fix every `FAIL`; consider each `WARN`. `assets/examples/kei.svg` is a complete reference drawing.

### 3. Wire it into the app

1. Copy `assets/peekaboo.ts` and `assets/peekaboo.css` into the project (e.g. `src/mascot/`). They are meant to be
   owned and edited; match the project's language (strip types for plain JS) and style conventions.
2. Map the layout to `edges` and `obstacles` (see `references/behavior.md` §2–3):
   - edges: sides of stable containers (header bottom, panel group sides, sidebar edge), outward or `inward`;
   - obstacles: everything users read or click, panels and controls included; `touchable` for the surfaces it hides
     behind; never the anchor of an inward edge.
3. Create it once, in the browser only, after the layout exists:

   ```ts
   import { createPeekaboo } from './mascot/peekaboo';
   import './mascot/peekaboo.css';
   import mascotSvg from './mascot/mochi.svg?raw'; // or an inline template string

   createPeekaboo({
     name: 'Mochi',
     svg: mascotSvg,
     edges: [{ anchor: 'header', side: 'bottom' }, { anchor: 'main', side: 'left' }],
     obstacles: 'main, nav, button, a, input, select, textarea, label, h1, p',
     touchable: 'main',
     shortcut: { code: 'KeyM', altKey: true },
     keepsakeMs: keepsakeSeconds() * 1000, // parsed and validated, see step 4
     notify: message => showToast(message),
   });
   ```

   Destroy it on unmount in SPA frameworks (`destroy()`).

   Ship the SVG the way the project ships other code: a bundler import (`?raw` in Vite, an asset loader elsewhere) or
   an inline string in a JS module. Avoid fetching it at runtime. In a no-build app, `fetch` fails when someone opens
   `index.html` from disk, and the mascot then silently never appears.
4. Make the keepsake time configurable without code edits (env var or the app's config file), validate it and fall
   back to the default with a console warning.
5. Tune personality in the `steps` array of `visit()` and the CSS curve (`references/behavior.md` §6).

### 4. Keep these promises

These are what make a mascot welcome rather than annoying; preserve them through any customization:

- **Never covers the app**: no overlap with obstacles, fully in the viewport for random spots, below sticky headers,
  menus, dialogs and toasts in z-order, `pointer-events: none` on the figure.
- **Off by default**, persisted per browser; the first shortcut press shows it at once.
- **Silent on success**: notify only when it is turned on and has no free spot.
- **Respects the user**: no visits with reduced motion, hidden tab or fullscreen; keepsake has a label and focus ring.
- **Original art**, pure inline vector, no scripts or external references.

### 5. Verify

- Run the project's checks (type check, lint, build).
- Add browser tests if the project has them (`references/testing.md`: fake clock, seeded random, off-by-default
  toggle, visit → keepsake → recall, keepsake expiry, no-overlap sweep at two widths, no-free-spot notice).
- Look at it: screenshot a peeking and a keepsake state at a fixed clock. The face should read and the keepsake should
  be recognizable at actual size.
- Document the shortcut and config in the README or help, and the changelog if the project keeps one.

### 6. Report back

Tell the user the mascot's name, the shortcut, where it hides, the keepsake, and how to change the duration. Include
a screenshot path if you took one, and mention any edge you skipped because it would cover the UI.

## Files

- `assets/peekaboo.ts`: placement, routine, keepsake, toggle (framework-free, no dependencies)
- `assets/peekaboo.css`: clipping, rise/sink, look, blink, twitch, reduced motion
- `assets/examples/kei.svg`: example character (hair-tuft keepsake)
- `scripts/check_mascot_svg.py`: validates an SVG against the parts contract
- `references/behavior.md`: lifecycle, placement math, invariants, personality tuning, gotchas
- `references/character-design.md`: drawing guide, parts contract, originality
- `references/testing.md`: deterministic browser tests
- `references/case-study-kei.md`: the original mascot, its interview answers and lessons learned
