# Designing the mascot SVG

Read this when drawing a new mascot. The goal is a small, original, readable figure that animates through a few
named parts, in one of two styles: **chibi** (the default, like the gallery) or **realistic**.

## Parts contract

The CSS in `assets/peekaboo.css` animates these classes. Colors go on the shapes as `fill`/`stroke` attributes so the
SVG is self-contained.

| Class | Element | Purpose |
|---|---|---|
| `pb-face` | `<g>` with brows, eyes, mouth | shifts ±1.5 viewBox units when looking left/right |
| `pb-eyes` | `<g>` with both eyes (whites + pupils) | squashed to 10% height to blink |
| `pb-pupils` | `<g>` inside `pb-eyes` | shifts ±1.2 units when looking |

The shifts are in viewBox units, so a finer viewBox needs bigger values: set them on the root,
`<svg viewBox="0 0 80 100" style="--peekaboo-look-face:3px;--peekaboo-look-pupils:2.4px">`.
| `pb-keepsake` | the top-most feature | stays above the edge after hiding; twitches |

Check a drawing with `python3 scripts/check_mascot_svg.py mascot.svg --width 80 --height 100`.

## Canvas and proportions

- Use `viewBox="0 0 40 50"` for the default 80 × 100 size (ratio must match `width:height`); realistic uses
  `0 0 80 100` at 120 × 150 (see Styles).
- Chibi proportions: head about 55–60% of the height, body a simple rounded shape cut by the bottom of the canvas
  (the bottom is hidden behind the edge anyway).
- The head and its top feature (`pb-keepsake`) must reach `y ≈ 0–4`; with the default `keepsake` of 14 px (7 units),
  roughly the top 14% of the drawing stays visible after hiding. It must show the keepsake, never the eyes.
- Eyes around 45–55% of the height so they are visible at the shortest rise (`minRise` = 76%).
- Keep strokes ≥ 0.6 units and features ≥ 2 units so the face reads at 80 px.

## Styles

| | Chibi | Realistic |
|---|---|---|
| Proportions | head 55–60% of the height, body a simple rounded shape | natural: head and neck about 45–50% of the height, shoulders or chest below; an animal shows its real head shape and muzzle |
| Shapes | few flat shapes, thick outlines | more shapes, thin or no outlines, form shown by light and shadow |
| Color | 4–6 flat colors | each material in 2–3 tones (base, shadow, highlight); `linearGradient` / `radialGradient` for fur, skin and cloth |
| Eyes | round whites, big pupils | almond or natural eye shape, iris with a darker rim, pupil and a small white catch-light, all in `pb-pupils`; a lid line above |
| Default size | 80 × 100, `viewBox="0 0 40 50"` | 120 × 150, `viewBox="0 0 80 100"` (more room for detail, same ratio) |
| File size | ~1–3 KB | keep under ~15 KB: it is inlined in the page |

Realistic is still an illustration, not a photo: no embedded images, no traced outlines, and simple enough that the
face reads at actual size. The same parts contract applies, so blinking and looking work unchanged; with the `0 0 80 100` viewBox, double the
look shifts on the root (`style="--peekaboo-look-face:3px;--peekaboo-look-pupils:2.4px"`, see Parts contract). Give gradient and
other `id`s a prefix with the character id (`fox-fur`), since the SVG is inlined into the app's page, and keep them
inside one `<defs>` at the top. For who may be drawn realistically, see `references/from-image.md` §2.

## Drawing order (later paints on top)

1. Body / outfit, then collar or accessories
2. Head skin
3. `pb-face` group: brows, `pb-eyes` (whites, then `pb-pupils`), mouth, cheeks
4. Hair, hat or other top feature as `pb-keepsake` (on top so it frames the face)

## Choosing the keepsake

Pick the most recognizable silhouette at the top of the head. Examples: spiky hair tuft, cat or bunny ears, antenna,
sprout or leaf, hat tip, horns, a single ahoge strand, a bow, a robot's dish. If the character has nothing on top,
give it a small signature feature, or set `keepsake: 0` (no call-back mark).

## Translating characteristics

| User says | Drawing choices |
|---|---|
| species/type (cat, robot, ghost, fox…) | head shape, ears/antenna, skin or material color |
| outfit or colors | body fill, collar, one accent element (badge, button, scarf) |
| signature feature | becomes `pb-keepsake` if it is on top, otherwise an accent |
| personality | brows (angle), mouth curve, pupil size; tune motion per `behavior.md` §6 |
| brand colors | body and accent from the palette; keep skin/face neutral and contrast high |

Use 4–6 colors (realistic: 4–6 materials, each in 2–3 tones). Dark hair or outfit on a light page reads best; test on the app's actual background.

## Original work only

Draw an original figure. When the user names an existing character (anime, game, brand mascot), make an "inspired-by"
chibi from generic traits (hair style, outfit colors, a prop) rather than tracing, copying or reproducing official
artwork, logos or exact costume designs. Say so in a short comment at the top of the SVG.

## Examples

The gallery in `assets/characters/` has three complete drawings with different keepsakes:

- `kei/kei.svg`: a black-suited boy with spiky hair inspired by Gantz; the hair is the keepsake
  (`references/case-study-kei.md` describes how it was built and tuned).
- `mochi/mochi.svg`: a chubby white cat with a pink scarf; the ears are the keepsake, drawn as one `pb-keepsake` group.
- `bolt/bolt.svg`: a blue robot with orange accents; the antenna (stem, ball and base) is the keepsake.

A new character should get the same folder shape: `<id>.svg`, a `character.json` like theirs (plus `"style"` and a
named `"palette"`, which the preview shows as swatches), and optional `<id>.css`.
