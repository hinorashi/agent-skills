---
name: peekaboo
description: Adds an original, edge-peeking mascot to a web app without covering the UI. Uses ready-made characters, a locally drawn SVG, or optional billed OpenAI SVG generation, with image-reference support, preview approval, replace/update handling and a removable mount boundary. Use for mascots, buddies, pets, easter eggs, peeking characters or animated companions in a web app.
license: MIT
compatibility: Web front ends (any framework or plain HTML). Runtime is dependency-free TypeScript; scripts need Python 3. Optional AI SVG generation needs network access and an OpenAI key.
metadata:
  author: hinorashi
  version: "1.6.2"
---

# Peekaboo mascot

Add a small original SVG mascot that peeks from free page edges, looks and blinks, then sinks away. It leaves a
clickable keepsake, stays hidden until toggled with a shortcut, and can be powered off with the same shortcut plus
Shift. The shared engine is `assets/peekaboo.ts`; never rewrite its placement or lifecycle for a character.

Keep cost low by default: prefer a gallery character or **Basic SVG**, load a reference only for the active branch,
reuse a raw AI result instead of paying again, and never retry a paid request without explicit approval.

## Gallery

| ID | Character | Personality | Keepsake | Default shortcut |
|---|---|---|---|---|
| `kei` | spiky-haired boy in a black suit | curious, wary | hair tuft | Alt+K |
| `mochi` | white cat with a pink scarf | shy | ears | Alt+M |
| `bolt` | blue robot with orange accents | curious | antenna | Alt+B |

Each `assets/characters/<id>/` contains the SVG, `character.json` options and optional scoped CSS. Use the options
as-is unless the user asks to customize them.

## Workflow

### 1. Inspect and ask once

Inspect the app's layout, framework, shortcuts, toast system and relevant mount lifecycle. Detect an existing
mascot before changing files:

```bash
python3 <skill-dir>/scripts/find_mascot.py <project-dir>
```

- Existing mascot: ask **Replace** or **Keep** in the first form and follow `references/replacing.md`. If the
  report offers an update, include **Update** in that same form (`references/updating.md`); declining changes
  nothing and does not persist a refusal.
- New or image-based mascot: run `generate_vector.py --check` only to determine whether **AI SVG** is available.
  Do not call the generation endpoint yet.
- User-provided image: follow `references/from-image.md`. Read it locally, never upload, trace, embed or commit it.
  Ask permission for a real person in the same form.

Ask everything still unknown in one structured form, using concrete defaults from the app. Include only applicable
fields:

| Field | Choices/default |
|---|---|
| Character | Kei, Mochi, Bolt, a new character, or from your image |
| Replace existing | Replace or Keep; required when one exists |
| Style | **chibi** (default) or **realistic**; realistic eligibility is limited by `references/from-image.md` |
| Image and consent | attachment/path plus who is shown; collect consent for a real person |
| Design | name, look, personality and top-most keepsake/signature feature |
| Drawing method | **Basic SVG** (default, no paid call) or **AI SVG** (OpenAI-billed Flare/Sunburst) |
| Integration | hiding locations, free show/hide shortcut, keepsake duration (10 s), size (80×100 chibi; 120×150 realistic) |
| AI key | blank uses `OPENAI_API_KEY`; a pasted key is stdin-only and never saved |

Skip fields the user already answered. Offer only light customization for a gallery character; heavily changing its
species or silhouette is a new character. Use color words, not hex values. For a branded, anime or public character,
offer an original inspired-by design, never a copy. A typed freeform answer always has to be possible in this form.

### 2. Create the SVG outside the app

Draft in `<temp-dir>/peekaboo-<id>/` as `<id>.svg`, `character.json` with `style` and named `palette`, plus optional
`<id>.css`. Nothing is copied into the app before approval.

Choose exactly one branch:

- **Basic SVG**: read `references/character-design.md`, draw locally and do not make a paid concept request.
- **AI SVG**: read `references/vector-upgrade.md`, send only a concise trait brief (not the reference image or real
  names), and keep low quality, low complexity and low SVG-author reasoning unless the user explicitly approves
  higher settings.

  ```bash
  python3 <skill-dir>/scripts/generate_vector.py \
    --prompt "<species/type, colors, expression, personality, keepsake>" \
    --id <id> --out <temp-dir>/peekaboo-<id>/vector
  ```

  A failure ends the branch visibly; never fall back to Basic SVG or repeat the paid call in the same run. If
  adaptation needs repair, reuse `vector/raw.svg` with `--adapt` at no provider cost. Small post-generation edits
  are local SVG edits, not reasons for another paid call.

Every new mascot must contain `pb-face`, `pb-eyes`, `pb-pupils` and `pb-keepsake`, with the keepsake reaching the
top and a viewBox matching the requested ratio. Validate it:

```bash
python3 <skill-dir>/scripts/check_mascot_svg.py <id>.svg --width 80 --height 100
```

Fix every `FAIL`; consider every `WARN`. Express personality with `character.json` options and optional scoped CSS;
do not customize `visit()`.

### 3. Preview, then obtain approval

Gallery characters skip preview unless requested. For a new or image-based mascot:

```bash
python3 <skill-dir>/scripts/make_preview.py <temp-dir>/peekaboo-<id> \
  [--reference path/to/image.png] --serve
```

The server serves only the preview. Open the localhost URL with a browser tool and inspect actual-size peeking,
keepsake and full poses. Then ask one single-choice approval question with exactly:

- **Approve** (default): install it.
- **Cancel**: leave the app unchanged.
- A free-text field: any text is a change request; edit/redraw, rebuild and ask again.

Do not add a "Change something" option. Put the URL, file path and a short plain-language design summary in the
question. Make the likely reasonable edit instead of asking for a second clarification round. After approval or
cancellation, stop the server and delete the scratch folder, including any reference copy and raw AI result.

### 4. Install behind one removable boundary

For replacement, preserve the existing app slot and follow `references/replacing.md` rather than creating a new
integration.

Keep the whole feature under one optional folder, for example:

```text
src/optional/mascot/
  index.ts
  peekaboo.ts
  peekaboo.css
  characters/<id>.svg
  characters/<id>.css
```

Copy the engine, CSS and approved character into it. Translate the engine to plain JavaScript only when the project
requires it. Keep app-specific selectors, shortcuts, configuration and notifications in this folder. Its single
export is `mountMascot(): () => void`, mounted once from the app shell and unmounted by the framework lifecycle.
Business features must not import mascot code or assets.

Map stable container sides to `edges`, all user-readable or interactive surfaces to `obstacles`, and hiding
surfaces to `touchable` (`references/behavior.md`). Import SVG and CSS through the project's normal bundler/asset
pipeline; do not fetch a mascot from disk at runtime. Keep keepsake duration configurable inside the optional
folder, validating it with a clear fallback warning.

To remove the feature, remove the one app-shell import/mount and delete the optional folder, its config, tests and
docs; then run the project checks. A mascot that leaks imports into business code is not complete.

### 5. Preserve the contract

- Never overlap readable/clickable content; remain in the viewport and below sticky overlays in z-order.
- Hidden by default, persisted per browser. Power switch is on by default and persisted separately.
- Silent on success; notify only when enabled but no free spot exists.
- Reduced motion, hidden tab and fullscreen mean no visits. The keepsake is labelled and keyboard reachable.
- Original inline SVG only: no scripts, external references, embedded raster images or committed reference image.

### 6. Verify and report

Run the mascot/project checks: SVG validation, Python tests for changed scripts, type check/lint/build and relevant
browser tests. Use `references/testing.md` for deterministic cases (off-by-default, visit/keepsake/recall, expiry,
overlap sweep and no-room notice). Remove any script-generated `__pycache__` or bytecode from the target app.

Inspect peeking and keepsake states at actual size. Document shortcuts/configuration in the project's existing
help, README or changelog. Report:

- character source/name, show/hide and power shortcuts, hiding edges and keepsake;
- duration setting and where to change it;
- for replacement: what changed, which slot settings were preserved and any deployed variable rename;
- screenshot path and intentionally skipped edges, when applicable.

## Reference map

- `references/behavior.md`: placement, lifecycle, invariants and personality.
- `references/character-design.md`: SVG parts, proportions, originality and styles.
- `references/from-image.md`: image eligibility, privacy, traits and cleanup.
- `references/vector-upgrade.md`: optional paid AI SVG branch, prompts, failures and adaptation.
- `references/replacing.md`: one-mascot and replacement rules.
- `references/updating.md`: installed-version updates and release process.
- `references/testing.md`: deterministic verification.
- `references/case-study-kei.md`: worked example.
