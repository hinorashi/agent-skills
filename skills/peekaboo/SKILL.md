---
name: peekaboo
description: Creates a custom on-screen mascot for a web app. An original SVG character peeks out from page edges, looks around, blinks and hides, leaving a clickable keepsake above the edge. Never covers the UI and supports keyboard shortcuts. Offers ready-made characters, an agent-drawn SVG, or a direct OpenAI-generated SVG, in chibi or realistic style. Can use the user's own image locally as a visual reference after an eligibility check. Previews for approval, then wires the feature behind one removable module boundary. Offers updates for older installed mascots. Use whenever someone wants a mascot, buddy, pet, easter egg, peeking or hiding character, or animated companion in a web app.
license: MIT
compatibility: Web front ends (any framework or plain HTML). The bundled module is TypeScript with no dependencies; the scripts need Python 3. AI SVG generation needs network access and an OpenAI key.
metadata:
  author: hinorashi
  version: "1.6.1"
---

# Peekaboo mascot

Build a small, original SVG mascot that lives at the edges of a web app. It peeks out at random spots that cover
nothing, looks left and right, blinks and sinks back. It leaves a recognizable bit of itself above the edge for a few
seconds that users can click to pull it out again. It is hidden by default and shown or hidden with a shortcut
(e.g. Alt+K); a second shortcut (e.g. Alt+Shift+K) turns it off entirely and back on (on by default). It stays silent
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

For a new or image-based character, check whether OpenAI credentials are available before offering AI SVG generation:

```bash
python3 <skill-dir>/scripts/generate_vector.py --check
```

An app gets one mascot. If one is found, the first form also asks whether to **replace** it or **keep** it and stop
(`references/replacing.md`).

If it reports **UPDATE AVAILABLE**, the installed mascot came from an older version of this skill. Whatever the user
asked for, add an **Update to the latest version?** field to the same form, with a one-line summary of what is new, and
do the update when accepted (`references/updating.md`). If the user declines, change nothing; the offer comes back the
next time the skill is used.

Then ask everything in **one form** (a structured question tool if you have one, otherwise one concise message with
numbered questions), with the defaults filled in from the app. Which mascot: **Kei**, **Mochi**, **Bolt** (one line
each from the gallery), **create a new one** from a description, or **from your image**. Add the fields from the
table below in the same form, marking which apply only to a new or image-based mascot. Skip whatever the user already
answered.

- **Gallery character**: use it as is. Offer light customization (rename, recolor, different keepsake time), but keep
  its personality options unless asked. Skip steps 2 and 3.
- **New character**: do steps 2 and 3.
- **From your image**: if the image is not already in the chat, the form says to attach it to the reply or give its
  path (forms usually take text only, so say this plainly). Check it is eligible as soon as you see it
  (`references/from-image.md` §1–2), then do steps 2 and 3. If the user attached an image without asking, this is
  the option they mean. A gallery character the user wants to change heavily (new species, new keepsake) counts as
  new; start from its files.

Collect the permission for a real person in this form too, not in a later round: it costs nothing when the image is a
pet and saves a round when it is a person.

| Field | Notes | Default |
|---|---|---|
| *Existing mascot only:* **Replace it?** | replace, or keep it and stop | none, so ask |
| **Character** | Kei, Mochi, Bolt, new, or from your image | none, so ask |
| *New / image:* **Style** | **chibi** (big head, simple shapes) or **realistic** (natural proportions, shading); realistic only for animals, objects, the user's own drawings and the user themselves (`references/from-image.md` §2) | chibi |
| *Image only:* **Image path** | optional when attached; a path lets the preview show it side by side | blank |
| *Image only:* **Who is in it** | no person (pet, object, drawing), it's me, or someone who gave permission | none, so ask |
| *New / image:* **Name** | used in labels, storage key, shortcut letter; for a pet, its name | from the image or ask |
| *New only:* **Look** | species/type, colors/outfit, signature feature | none, so ask |
| *New / image:* **Personality** | e.g. shy, curious, sleepy, cheeky, stoic | curious |
| *New / image:* **Keepsake** | the part left above the edge: hair tuft, ears, antenna, hat tip… or none | top-most signature feature |
| *New / image:* **Drawing method** | **Basic SVG** (the agent draws it, default, no paid call) or **AI SVG** (Flare for chibi; Sunburst for realistic). AI SVG is billed by OpenAI and returns SVG directly; the reference image is not uploaded (`references/vector-upgrade.md` §1) | Basic SVG |
| *AI SVG only:* **API key** | blank uses `OPENAI_API_KEY`; a pasted key is read on stdin for this run only, never saved | blank |
| **Where to hide** | header, sidebar, panels, footer, cards… | propose from the app's layout |
| **Shortcut** | show/hide key; the power key (turn it off entirely) is the same plus Shift | the character's suggested one, else Alt + first letter, if free (check the Shift variant too) |
| **Keepsake time** | seconds the keepsake stays | 10 s, configurable |
| **Size** | upright size in px | 80 × 100 chibi, 120 × 150 realistic |

Use plain words in forms and chat ("charcoal hair, dark denim"), not hex codes; the preview shows the colors as
swatches. If the user names an existing character from an anime, game or brand, say you will draw an original
"inspired-by" chibi, not a copy of official art.

### 2. Create the mascot SVG

Create straight away; the preview is where the user approves the result, so there is no separate round to confirm
the concept. Only ask first when something cannot be read from the answers or the image (which of two pets, which
outfit). From an image, pick the traits, palette and keepsake per `references/from-image.md` §3.

Draft in a scratch folder outside the app's source tree (`<temp-dir>/peekaboo-<id>/`, gallery shape: `<id>.svg`,
`character.json` with a `style` and a named `palette`, optional `<id>.css`) so nothing touches the app before
approval.

The two drawing methods are mutually exclusive:

- **Basic SVG**: read `references/character-design.md` and draw the SVG yourself. No concept image or paid request is
  made.
- **AI SVG**: turn the approved answers (or traits extracted from the local reference image) into a plain-language
  brief, then generate SVG directly with `scripts/generate_vector.py --prompt ... --id ...`
  (`references/vector-upgrade.md`). The SVG-generation endpoint takes text only, so do not upload the user's
  reference image. Never put names of franchises, brands, studios, artists or real people in the prompt. If OpenAI
  rejects the request or the answer fails adaptation, stop the AI SVG process immediately. Report the provider
  error and exit code to the user; do not create a local replacement, preview it, or install it. Only start
  **Basic SVG** in a new run after the user explicitly chooses that method.
  Use **low** image quality, low complexity and low SVG-author reasoning by default for every AI SVG request. The
  mascot is displayed at 80–150 px, so higher settings mainly add cost and detail that cannot survive at that size.
  Use Sunburst for realistic and Flare for chibi. The model prompt describes a generic original collectible-creature
  illustration—bold clean contours, rounded shapes and broad cel-shaded tones—without naming Pokémon, an artist or a
  franchise. Treat duplicate anatomy, an oversized keepsake group or a narrow face as an AI-result failure, even if
  the structural parts check passes.

Both branches must produce SVG with the `pb-face`, `pb-eyes`, `pb-pupils` and `pb-keepsake` parts, a viewBox matching
the size ratio (40 × 50 for 80 × 100), and the keepsake reaching the top. Validate it:

```bash
python3 <skill-dir>/scripts/check_mascot_svg.py path/to/mascot.svg --width 80 --height 100
```

Fix every `FAIL`; consider each `WARN`. The gallery SVGs are complete reference drawings. Express the personality
as options (`routine`, `interval`, `keepsake`, `accent`) and, if needed, a small scoped CSS file, the same shape as
a gallery `character.json` (`references/behavior.md` §6), so the shared module stays untouched.

### 3. Preview and approve

For a new or image-based character, build the preview and serve it, in the background, so it opens in any browser
(built-in browsers often block `file://` pages):

```bash
python3 <skill-dir>/scripts/make_preview.py <temp-dir>/peekaboo-<id> [--reference path/to/image.png] --serve
```

It prints the file path, then a `http://127.0.0.1:<port>/` URL that serves only that page. The page shows the
reference next to the drawing, the mascot at 2x and actual size, the colors as swatches, every pose, the keepsake at an
edge, a live peek playing the routine, and the parts check. Open the URL in your browser tool if you have one and look
at it before the user does. Without a reference path (the image was only attached to the chat), the page simply has
no reference column. There is no separate AI concept-art stage: the drawing shown in this preview is the mascot SVG
that will be installed.

Then ask for approval with **one single-choice question**, not a free-text "reply approve". It has exactly three
ways to answer:

- **Approve** (option, default): add it to the app (step 4).
- **Cancel** (option): leave the app as it is.
- **The free-text box** (the question's own freeform input, e.g. `allowFreeformInput: true`): the user types what to
  change. Any typed answer is a change request: redraw, rebuild the preview and ask again with the same question.

Do **not** add a "Change something" option: picking an option never opens a text box, so the user ends up without a
place to type. Say in the question message that typing in the box requests changes, e.g. "Approve, Cancel, or type
what to change (e.g. smaller hat, warmer hair)." If the question tool has no freeform input, use two options and a
plain-text line under the question saying to reply with the change instead. Never answer a change request by
complaining that details are missing or by offering guessed options; if the typed text is unclear, make the most
likely change and say what you changed.

Put the link to the page (URL and file path) and a one-line summary (name, style, keepsake, 3–5 traits in plain words)
in the question. A small drawing change edits the SVG in place; a design change repeats the same selected drawing
branch. When done, stop the server and delete the scratch folder and the preview: the preview holds a copy of the
reference image. Gallery characters skip this step unless the user asks to see one.

### 4. Wire it into the app as an optional feature

Replacing a mascot? Follow `references/replacing.md` §3–4 instead of a fresh install: keep the app's slot (call site,
edges, obstacles, shortcut, storage key, config), swap the character, then check nothing of the old one is left.

1. Keep the entire feature in one dedicated folder that is not imported by business code. For example:

   ```text
   src/optional/mascot/
     index.ts                 # app-specific setup and the mountMascot() boundary
     peekaboo.ts              # generic behavior engine
     peekaboo.css
     characters/
       mochi.svg
       mochi.css              # only if the character has one
   ```

   Copy `assets/peekaboo.ts`, `assets/peekaboo.css` and the character's SVG (plus its CSS, if any) into that folder.
   Match the project's language (strip types for plain JS) and style conventions. Keep the engine generic: personality
   goes in options, not in edits to `visit()`. Keep app-specific selectors, shortcut, notifications and configuration
   in `index.ts` or files inside this folder; the mascot must not be imported by business features or services.
2. Map the layout to `edges` and `obstacles` (see `references/behavior.md` §2–3):
   - edges: sides of stable containers (header bottom, panel group sides, sidebar edge), outward or `inward`;
   - obstacles: everything users read or click, panels and controls included; `touchable` for the surfaces it hides
     behind; never the anchor of an inward edge.
3. Keep one mount/unmount seam in the app shell. Its only responsibility is to start the feature after the layout
   exists and return the engine's cleanup function. Put the options and asset imports inside the optional folder:

   ```ts
   // src/optional/mascot/index.ts
   import { createPeekaboo } from './peekaboo';
   import './peekaboo.css';
   import './characters/mochi.css'; // only if the character has one
   import mascotSvg from './characters/mochi.svg?raw'; // or an inline template string

   export function mountMascot(): () => void {
     const mascot = createPeekaboo({
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
       shortcut: { code: 'KeyM', altKey: true },      // show/hide
       // powerShortcut defaults to Alt+Shift+M (turn it off entirely, on by default); set it if that is taken
     });
     return () => mascot.destroy();
   }
   ```

   The app shell imports only this boundary and mounts it once in the browser after the layout exists. For example,
   in React:

   ```tsx
   import { useEffect } from 'react';
   import { mountMascot } from './optional/mascot';

   function App() {
     useEffect(() => mountMascot(), []);
     return <BusinessApp />;
   }
   ```

   Other frameworks should call the returned disposer from their unmount lifecycle. Put app-specific notification
   wiring and validated settings (such as configurable keepsake time) inside `src/optional/mascot/`, not in business
   features. Do not mount it from business features. Keep the CSS and SVG imports inside the optional folder so
   removing the feature cannot leave unresolved asset imports elsewhere.

   Ship the SVG the way the project ships other code: a bundler import (`?raw` in Vite, an asset loader elsewhere) or
   an inline string in a JS module. Avoid fetching it at runtime. In a no-build app, `fetch` fails when someone opens
   `index.html` from disk, and the mascot then silently never appears.
4. Make the keepsake time configurable without code edits (env var or the app's config file), validate it and fall
   back to the default with a console warning. Keep its parsing and mascot-specific key inside the optional folder.
5. Tune personality with `routine`, `interval` and scoped CSS (`references/behavior.md` §6).

### Removing the mascot later

The app shell should have exactly one mascot integration: the import and mount call for `mountMascot()`. To remove
the feature, remove that import and call, then delete `src/optional/mascot/`. Remove any mascot-only environment
variables, tests, and documentation as well. Run the app's type check, build and relevant tests after removal. If
those checks fail because business code imports the mascot or its assets, move that dependency behind the optional
folder boundary before considering the feature removable. Do not edit business behavior to compensate for deleting
the mascot.

### 5. Keep these promises

These are what make a mascot welcome rather than annoying; preserve them through any customization:

- **Never covers the app**: no overlap with obstacles, fully in the viewport for random spots, below sticky headers,
  menus, dialogs and toasts in z-order, `pointer-events: none` on the figure.
- **Hidden by default**, persisted per browser; the first show/hide shortcut press shows it at once.
- **Can be turned off entirely** with the power shortcut (on by default, persisted); while off, nothing appears and
  the show/hide shortcut is ignored.
- **Silent on success**: notify only when it is turned on and has no free spot.
- **Respects the user**: no visits with reduced motion, hidden tab or fullscreen; keepsake has a label and focus ring.
- **Original art**, pure inline vector, no scripts or external references; a reference image is never embedded,
  traced or committed.

### 6. Verify

- Run the project's checks (type check, lint, build).
- Keep Python bytecode generated by skill scripts out of the target project. The bundled `.gitignore` ignores
  `__pycache__/` and `*.py[cod]`; remove any generated cache directory before reporting the result.
- Add browser tests if the project has them (`references/testing.md`: fake clock, seeded random, off-by-default
  toggle, visit → keepsake → recall, keepsake expiry, no-overlap sweep at two widths, no-free-spot notice).
- Look at it: screenshot a peeking and a keepsake state at a fixed clock. The face should read and the keepsake should
  be recognizable at actual size.
- Document the shortcut and config in the README or help, and the changelog if the project keeps one.

### 7. Report back

Tell the user which character (gallery, new or from their image), the mascot's name, the show/hide and power shortcuts, where it hides, the keepsake, and how to change the duration.
If it replaced a mascot, say which one, what was kept, and any variable to rename in deployed environments. Include
a screenshot path if you took one, and mention any edge you skipped because it would cover the UI.

## Files

- `assets/peekaboo.ts`: placement, routine, keepsake, toggle (framework-free, no dependencies)
- `assets/peekaboo.css`: clipping, rise/sink, look, blink, twitch, reduced motion
- `assets/characters/<id>/`: gallery characters (Kei, Mochi, Bolt): SVG, `character.json`, optional CSS
- `src/optional/mascot/` (in the target app): recommended optional feature folder with a single mount/unmount boundary
- `scripts/check_mascot_svg.py`: validates an SVG against the parts contract
- `scripts/check_reference_image.py`: technical check of a user's reference image (format, size, dimensions)
- `scripts/find_mascot.py`: finds a mascot already in the project, or leftovers of a replaced one (`--name`)
- `scripts/make_preview.py`: standalone HTML preview of a character folder (`--serve` for a localhost URL), for approval before wiring
- `scripts/generate_vector.py`: direct AI SVG generation with an OpenAI SVG model (`--check` for credentials), adapted to the parts contract
- `.gitignore`: keeps script-generated `__pycache__/` directories and Python bytecode out of installed projects
- `references/behavior.md`: lifecycle, placement math, invariants, personality tuning, gotchas
- `references/character-design.md`: drawing guide for chibi and realistic styles, parts contract, originality
- `references/from-image.md`: reading the user's image, eligibility, traits to keep, preview and cleanup
- `references/vector-upgrade.md`: AI SVG branch: prompting, credentials, endpoint limits, adapting the answer, validation and failure handling
- `references/replacing.md`: one mascot per app; replacing an installed or hand-built one
- `references/updating.md`: offering and applying updates to an installed mascot, changelog, releasing a version
- `references/testing.md`: deterministic browser tests
- `references/case-study-kei.md`: the original mascot, its interview answers and lessons learned
