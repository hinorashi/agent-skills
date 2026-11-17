# Mascot from the user's image

Use this when the user brings a picture of the persona they want as a mascot: a photo of themselves or a
teammate, a pet, a toy, a sketch, a logo character or a screenshot of a favorite character. The image is a
**reference**: you read it, pick out a few traits and draw an original chibi in the peekaboo style. You never trace
it, embed it or reproduce it.

## 1. Get the image

- **Attached in chat**: you can already see it. If your client also gives you a file path, use it for the script and
  the preview.
- **A path in the project or on disk**: open it with your image viewer tool, and run the technical check:

  ```bash
  python3 <skill-dir>/scripts/check_reference_image.py path/to/image.png
  ```

  PNG, JPEG, WebP and GIF (first frame) up to 20 MB, short side at least 128 px. For anything else (HEIC, PSD,
  PDF, video), ask for a PNG or JPEG screenshot.
- **A URL**: ask the user to download it or attach it instead. Do not fetch images from the web yourself.
- **You cannot see images** (no vision or viewer tool): say so and fall back to a text description of the look.

Leave the image where it is. Do not copy it into the app, commit it or upload it anywhere; the preview page embeds it
only in a local file outside the app's source tree.

## 2. Decide whether it is eligible

Go through the checks in order and stop at the first that fails. Report the result in one short message:
**eligible**, **eligible once you confirm …**, or **not eligible because …, here is what would work instead**.

| Check | Eligible | Needs confirmation | Not eligible |
|---|---|---|---|
| Readable | subject clear, in focus, reasonably lit | small or blurry but main traits visible: ask for a better one, or go ahead with guesses the user approves | too small, dark or cropped to see the subject |
| One subject | one person, animal, character or object | several: ask which one | no subject at all (landscape, pattern) |
| Can be a mascot | it has a face, or a front that can carry eyes (objects are fine: a mug, a plant) | only text or a logo: ask what character it should become | |
| Real person | | always: the user confirms it is them, or they have the person's permission (for a child, permission from a parent or guardian, which the user may hold themselves) | public figures and celebrities without a stated permission; anyone the user wants to mock, shame or impersonate |
| Someone else's character, mascot or brand | as an original "inspired by" chibi | | a request for an exact copy, a logo or an emblem |
| Content | anything else | | nudity or sexual content, gore, hate symbols, harassment, or anything that would be inappropriate on a work screen |

Notes on the rows:

- **Someone else's character** (anime, game, brand mascot) is eligible in the same way as Kei: an original
  "inspired by" chibi from generic traits (hair shape, outfit colors, a prop). Say so before drawing. Do not
  reproduce logos, emblems or exact costume designs, even if they are in the picture.
- **Real people** are never drawn as a likeness. The result is a stylized chibi that keeps a few chosen traits
  (hair color and shape, glasses, a favorite hoodie, an accessory), not facial features that identify them. Ask
  which traits matter; people often care most about one (the curly hair, the red glasses).
- Describe only visible styling (hair, clothes, accessories, colors). Do not guess or write down age, ethnicity,
  health, religion or other personal attributes, in chat, comments, `character.json` or file names. Skin tone, like
  any color, is the user's choice: offer the one from the photo or another.

## 3. Turn the image into a character

1. List **3–5 signature traits** you will keep, most recognizable first, and a **palette of at most 6 colors**
   sampled from the image (hex). Simplify: chibi proportions, a big head and few details read better at 80 × 100.
2. Pick the **keepsake** from the top of the silhouette: hair, ears, a hat, an antenna, a leaf. If nothing sticks
   up, offer one that suits the persona (a cowlick, a bow, a sprout).
3. Suggest a name and personality if the user gave none. A pet's or a person's name is the obvious default, and
   for a real person, ask.
4. Show the traits, palette, keepsake and name as one short list, and ask for a yes or corrections. This is the cheap
   moment to fix "my hair is not that red"; after drawing it costs a full redraw.

Then draw it (`references/character-design.md`), with a comment at the top of the SVG saying it is an original drawing
based on traits from a reference image. Do not name a real person in the comment.

## 4. Preview before wiring

Draft the character in a scratch folder outside the app's source tree, for example
`<temp-dir>/peekaboo-<id>/`, with the gallery shape (`<id>.svg`, `character.json`, optional `<id>.css`).
Then build the preview with the reference next to it:

```bash
python3 <skill-dir>/scripts/make_preview.py <temp-dir>/peekaboo-<id> --reference path/to/image.png
```

The page shows the reference, the mascot at 2x and actual size, every pose, the keepsake at the edge, a live peek
playing its routine (click the keepsake to call it back, switch to a dark background), and the parts-check result.
Open it in a browser tool if you have one, take a screenshot to check it yourself, and give the user the file path.

Ask for **approve** or changes. Redraw and rebuild the preview for each round of changes. Only after approval copy
the character into the app (SKILL.md step 4). Then delete the scratch folder and the preview file, which holds a
copy of the reference image.
