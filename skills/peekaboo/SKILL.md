---
name: peekaboo
description: Creates a custom on-screen mascot for a web app. An original SVG character peeks out from behind page edges at random free spots, looks around, blinks and hides again. It leaves a keepsake, such as a hair tuft, ears or a hat tip, above the edge that users can click to call it back. Never covers the UI. Toggled with a keyboard shortcut. Offers ready-made characters (Kei the spiky-haired boy, Mochi the shy cat, Bolt the curious robot), designs a new one from an interview, or turns the user's own image (photo, pet, sketch, favorite character) into one after an eligibility check, shows a preview page for approval, then wires it in, replacing an existing mascot if the user chooses. Use whenever someone wants a mascot, buddy, pet, easter egg, peeking or hiding character, or a playful animated companion in a website or web app, even if they don't say "mascot", for example "make a little guy peek out from my header".
license: MIT
compatibility: Web front ends (any framework or plain HTML). The bundled module is TypeScript with no dependencies; the SVG checker needs Python 3.
metadata:
  author: hinorashi
  version: "1.3.0"
---

# Peekaboo mascot

Build a small, original SVG mascot that lives at the edges of a web app. It peeks out at random spots that cover
nothing, looks left and right, blinks and sinks back. It leaves a recognizable bit of itself above the edge for a few
seconds that users can click to pull it out again. It is off by default and toggled with a shortcut. It stays silent
unless it cannot find room.

The behavior is solved in `assets/peekaboo.ts` + `assets/peekaboo.css`, and three characters are ready in
`assets/characters/`. Your work is choosing or creating the character (from a description or from the user's own
image), letting the user approve a preview of anything new, and fitting it to this app (which edges and obstacles).

## Character gallery

| Character | Look | Personality | Keepsake | Suggested shortcut |
|---|---|---|---|---|
| **Kei** (`kei`) | chibi boy, black suit, spiky black hair (inspired by Gantz) | curious but wary | hair tuft | Alt+K |
| **Mochi** (`mochi`) | chubby white cat, pink scarf, rosy cheeks | shy | ears | Alt+M |
| **Bolt** (`bolt`) | little blue robot, orange accents, visor face | curious, tilts head | antenna | Alt+B |

Each folder holds `<id>.svg`, `character.json` (look, personality, keepsake, suggested shortcut, and the
`createPeekaboo` options that give it its personality: `keepsake`, `interval`, `routine`, `accent`) and optionally
`<id>.css` for character-specific motion, scoped by `.peekaboo[data-character=<id>]`.

## Workflow

### 1. Choose the character

Look at the app first (layout files, header and main containers, existing shortcuts, toast system) so every question
can come with a concrete default. Check for a mascot that is already installed:

```bash
python3 <skill-dir>/scripts/find_mascot.py <project-dir>
```

An app gets one mascot. If one is found, the round below also asks whether to **replace** it or **keep** it and stop
(`references/replacing.md`). Then ask, in one round (a structured question tool if you have one, otherwise one
concise message), which mascot they want: **Kei**, **Mochi**, **Bolt** (one line each from the gallery), **create a
new one** from a description, or **from your image** (attach it in the chat or give its path). Ask for the app-fitting fields from the table below in the same round. If the user already named a gallery
character or fully described a new one, skip what is already answered.

- **Gallery character**: use it as is. Offer light customization (rename, recolor, different keepsake time), but keep
  its personality options unless asked. Skip steps 2 and 3.
- **New character**: also collect the character fields below, then do steps 2 and 3.
- **From your image**: get the image and check it is eligible before anything else (`references/from-image.md`
  §1–2). Then propose the character fields from the picture instead of asking for them, and do steps 2 and 3.
  If the user attached an image without asking, this is the option they mean. A gallery character the user wants to
  change heavily (new species, new keepsake) counts as new; start from its files.

Ask before drawing anything new. The character is personal, and guessing wastes a round of revisions.

| Field | Notes | Default |
|---|---|---|
| *Existing mascot only:* **Replace it?** | replace, or keep it and stop | none, so ask |
| **Character** | Kei, Mochi, Bolt, or new | none, so ask |
| *Image only:* **Image** | attached in chat or a file path; PNG, JPEG, WebP, GIF | none, so ask |
| *New only:* **Name** | used in labels, storage key, shortcut letter | none, so ask |
| *New only:* **Look** | species/type, colors/outfit, signature feature | none, so ask |
| *New only:* **Personality** | e.g. shy, curious, sleepy, cheeky, stoic | curious |
| *New only:* **Keepsake** | the part left above the edge: hair tuft, ears, antenna, hat tip… or none | top-most signature feature |
| **Where to hide** | header, sidebar, panels, footer, cards… | propose from the app's layout |
| **Shortcut** | toggle key | the character's suggested one, else Alt + first letter, if free |
| **Keepsake time** | seconds the keepsake stays | 10 s, configurable |
| **Size** | upright size in px | 80 × 100 |

If the user names an existing character from an anime, game or brand, confirm you will draw an original
"inspired-by" chibi, not a copy of official art.

### 2. Draw a new character

From an image, first follow `references/from-image.md` §3: confirm the traits, palette, keepsake and name with the
user before drawing. Draft new characters in a scratch folder outside the app's source tree
(`<temp-dir>/peekaboo-<id>/`, gallery shape: `<id>.svg`, `character.json`, optional `<id>.css`) so nothing touches the
app before approval.

Read `references/character-design.md`. Write the SVG with the `pb-face`, `pb-eyes`, `pb-pupils` and `pb-keepsake`
parts, a viewBox matching the size ratio (40 × 50 for 80 × 100), and the keepsake reaching the top. Validate it:

```bash
python3 <skill-dir>/scripts/check_mascot_svg.py path/to/mascot.svg --width 80 --height 100
```

Fix every `FAIL`; consider each `WARN`. The gallery SVGs are complete reference drawings. Express the personality
as options (`routine`, `interval`, `keepsake`, `accent`) and, if needed, a small scoped CSS file, the same shape as
a gallery `character.json` (`references/behavior.md` §6), so the shared module stays untouched.

### 3. Preview and approve

For a new or image-based character, build a standalone preview page and get a yes before touching the app:

```bash
python3 <skill-dir>/scripts/make_preview.py <temp-dir>/peekaboo-<id> [--reference path/to/image.png]
```

It shows the reference next to the drawing, the mascot at 2x and actual size, every pose, the keepsake at an edge,
a live peek playing the routine, and the parts check. Look at it yourself first (browser tool screenshot if you
have one), then give the user the file path and ask for **approve** or changes. Redraw and rebuild per round.
After approval, delete the preview (it holds a copy of the reference image). Gallery characters skip this step
unless the user asks to see one.

### 4. Wire it into the app

Replacing a mascot? Follow `references/replacing.md` §3–4 instead of a fresh install: keep the app's slot (call site,
edges, obstacles, shortcut, storage key, config), swap the character, then check nothing of the old one is left.

1. Copy `assets/peekaboo.ts`, `assets/peekaboo.css` and the character's SVG (plus its CSS, if any) into the project
   (e.g. `src/mascot/`). Match the project's language (strip types for plain JS) and style conventions. Keep the
   module generic: personality goes in options, not in edits to `visit()`.
2. Map the layout to `edges` and `obstacles` (see `references/behavior.md` §2–3):
   - edges: sides of stable containers (header bottom, panel group sides, sidebar edge), outward or `inward`;
   - obstacles: everything users read or click, panels and controls included; `touchable` for the surfaces it hides
     behind; never the anchor of an inward edge.
3. Create it once, in the browser only, after the layout exists:

   ```ts
   import { createPeekaboo } from './mascot/peekaboo';
   import './mascot/peekaboo.css';
   import './mascot/mochi.css';                    // only if the character has one
   import mascotSvg from './mascot/mochi.svg?raw'; // or an inline template string

   createPeekaboo({
     name: 'Mochi',
     character: 'mochi',
     svg: mascotSvg,
     // Personality, copied from characters/mochi/character.json "options":
     keepsake: 20,
     interval: [20_000, 60_000],
     accent: '#d1638f',
     routine: [[900, 'look'], [450, 'look-back'], [450, 'look-ahead'], [300, 'blink'], [320, 'pause'], [250, 'sink']],
     edges: [{ anchor: 'header', side: 'bottom' }, { anchor: 'main', side: 'left' }],
     obstacles: 'main, nav, button, a, input, select, textarea, label, h1, p',
     touchable: 'main',
     shortcut: { code: 'KeyM', altKey: true },
     keepsakeMs: keepsakeSeconds() * 1000, // parsed and validated, see item 4 below
     notify: message => showToast(message),
   });
   ```

   Destroy it on unmount in SPA frameworks (`destroy()`).

   Ship the SVG the way the project ships other code: a bundler import (`?raw` in Vite, an asset loader elsewhere) or
   an inline string in a JS module. Avoid fetching it at runtime. In a no-build app, `fetch` fails when someone opens
   `index.html` from disk, and the mascot then silently never appears.
4. Make the keepsake time configurable without code edits (env var or the app's config file), validate it and fall
   back to the default with a console warning.
5. Tune personality with `routine`, `interval` and scoped CSS (`references/behavior.md` §6).

### 5. Keep these promises

These are what make a mascot welcome rather than annoying; preserve them through any customization:

- **Never covers the app**: no overlap with obstacles, fully in the viewport for random spots, below sticky headers,
  menus, dialogs and toasts in z-order, `pointer-events: none` on the figure.
- **Off by default**, persisted per browser; the first shortcut press shows it at once.
- **Silent on success**: notify only when it is turned on and has no free spot.
- **Respects the user**: no visits with reduced motion, hidden tab or fullscreen; keepsake has a label and focus ring.
- **Original art**, pure inline vector, no scripts or external references; a reference image is never embedded,
  traced or committed.

### 6. Verify

- Run the project's checks (type check, lint, build).
- Add browser tests if the project has them (`references/testing.md`: fake clock, seeded random, off-by-default
  toggle, visit → keepsake → recall, keepsake expiry, no-overlap sweep at two widths, no-free-spot notice).
- Look at it: screenshot a peeking and a keepsake state at a fixed clock. The face should read and the keepsake should
  be recognizable at actual size.
- Document the shortcut and config in the README or help, and the changelog if the project keeps one.

### 7. Report back

Tell the user which character (gallery, new or from their image), the mascot's name, the shortcut, where it hides, the keepsake, and how to change the duration.
If it replaced a mascot, say which one, what was kept, and any variable to rename in deployed environments. Include
a screenshot path if you took one, and mention any edge you skipped because it would cover the UI.

## Files

- `assets/peekaboo.ts`: placement, routine, keepsake, toggle (framework-free, no dependencies)
- `assets/peekaboo.css`: clipping, rise/sink, look, blink, twitch, reduced motion
- `assets/characters/<id>/`: gallery characters (Kei, Mochi, Bolt): SVG, `character.json`, optional CSS
- `scripts/check_mascot_svg.py`: validates an SVG against the parts contract
- `scripts/check_reference_image.py`: technical check of a user's reference image (format, size, dimensions)
- `scripts/find_mascot.py`: finds a mascot already in the project, or leftovers of a replaced one (`--name`)
- `scripts/make_preview.py`: standalone HTML preview of a character folder, for approval before wiring
- `references/behavior.md`: lifecycle, placement math, invariants, personality tuning, gotchas
- `references/character-design.md`: drawing guide, parts contract, originality
- `references/from-image.md`: reading the user's image, eligibility, traits to keep, preview and cleanup
- `references/replacing.md`: one mascot per app; replacing an installed or hand-built one
- `references/testing.md`: deterministic browser tests
- `references/case-study-kei.md`: the original mascot, its interview answers and lessons learned
