# Mascot from the user's image

Use this when the user brings a picture of the persona they want as a mascot: a photo of themselves or a
teammate, a pet, a toy, a sketch, a logo character or a screenshot of a favorite character. The image is a
**reference**: you read it, pick out a few traits and draw an original mascot in the peekaboo style, chibi or
realistic. You never trace it, embed it or reproduce it.

## 1. Get the image

- **Attached in chat**: you can already see it. If your client also gives you a file path, use it for the script and
  the preview. Chat attachments are often not files on disk; then the preview just has no reference column. Ask for a
  path only if the user wants the side-by-side view.
- **Not attached yet**: the first form (SKILL.md step 1) asks the user to attach it to their reply or give a path.
- **A path in the project or on disk**: open it with your image viewer tool, and run the technical check:

  ```bash
  python3 <skill-dir>/scripts/check_reference_image.py path/to/image.png
  ```

  PNG, JPEG, WebP and GIF (first frame) up to 20 MB, short side at least 128 px. For anything else (HEIC, PSD,
  PDF, video), ask for a PNG or JPEG screenshot.
- **A URL**: ask the user to download it or attach it instead. Do not fetch images from the web yourself.
- **You cannot see images** (no vision or viewer tool): say so and fall back to a text description of the look.

Leave the image where it is. Do not copy it into the app, commit it or upload it anywhere; the preview page embeds it
only in a local file outside the app's source tree. For the AI SVG branch, inspect the image locally and send only a
generic text description of its traits. The current SVG endpoint does not accept image input.

## 2. Decide whether it is eligible

Go through the checks in order and stop at the first that fails. Report the result in one short message:
**eligible**, **eligible once you confirm …**, or **not eligible because …, here is what would work instead**.

| Check | Eligible | Needs confirmation | Not eligible |
|---|---|---|---|
| Readable | subject clear, in focus, reasonably lit | small or blurry but main traits visible: ask for a better one, or go ahead with guesses the user approves | too small, dark or cropped to see the subject |
| One subject | one person, animal, character or object | several: ask which one | no subject at all (landscape, pattern) |
| Can be a mascot | it has a face, or a front that can carry eyes (objects are fine: a mug, a plant) | only text or a logo: ask what character it should become | |
| Real person | | always: the user confirms it is them, or they have the person's permission (for a child, permission from a parent or guardian, which the user may hold themselves) | public figures and celebrities without a stated permission; anyone the user wants to mock, shame or impersonate |
| Realistic style | animals, objects, toys, the user's own drawings, and the user themselves ("it's me") | | anyone else, even with permission (offer chibi instead); public figures and celebrities always |
| Someone else's character, mascot or brand | as an original "inspired by" chibi | | a request for an exact copy, a logo or an emblem |
| Content | anything else | | nudity or sexual content, gore, hate symbols, harassment, or anything that would be inappropriate on a work screen |

Notes on the rows:

- **Someone else's character** (anime, game, brand mascot) is eligible in the same way as Kei: an original
  "inspired by" chibi from generic traits (hair shape, outfit colors, a prop). Say so before drawing. Do not
  reproduce logos, emblems or exact costume designs, even if they are in the picture.
- **Realistic style** means natural proportions and shading, still a vector illustration with simple shapes
  (`references/character-design.md`, "Realistic"). For a person it comes close to a portrait, which is fine for a
  user's own face and not for anyone else's: a realistic picture of another person put on a website reads as them.
  So other people, with permission, get the chibi style; public figures do not get realistic at all. Say this in one
  sentence when you switch to chibi, and keep going.
- **Real people in chibi style** are never drawn as a likeness. The result is a stylized chibi that keeps a few chosen traits
  (hair color and shape, glasses, a favorite hoodie, an accessory), not facial features that identify them. Ask
  which traits matter; people often care most about one (the curly hair, the red glasses).
- Describe only visible styling (hair, clothes, accessories, colors). Do not guess or write down age, ethnicity,
  health, religion or other personal attributes, in chat, comments, `character.json` or file names. Skin tone, like
  any color, is the user's choice: offer the one from the photo or another.

## 3. Turn the image into a character

1. Pick **3–5 signature traits** to keep, most recognizable first, and a **palette of at most 6 colors** sampled
   from the image. Write it into `character.json` as `"palette": [{"name": "charcoal hair", "hex": "#20202a"}, …]`;
   the preview shows these as swatches, and chat uses only the names. Simplify: chibi has a big head and few
   details; realistic keeps proportions but still needs to read at actual size.
2. Pick the **keepsake** from the top of the silhouette: hair, ears, a hat, an antenna, a leaf. If nothing sticks
   up, offer one that suits the persona (a cowlick, a bow, a sprout).
3. Use the name from the first form; a pet's name is the obvious default.
4. Draw it without a separate confirmation round. The preview shows the traits and colors next to the reference, so
   the user corrects "my hair is not that red" there, in the approval form. Ask before drawing only when the image
   leaves a real choice open (which of two pets, which outfit).

Then draw it (`references/character-design.md`), with a comment at the top of the SVG saying it is an original drawing
based on traits from a reference image. Do not name a real person in the comment.

## 4. Preview before wiring

Draft the character in a scratch folder outside the app's source tree, for example
`<temp-dir>/peekaboo-<id>/`, with the gallery shape (`<id>.svg`, `character.json`, optional `<id>.css`).
Then build and serve the preview with the reference next to it:

```bash
python3 <skill-dir>/scripts/make_preview.py <temp-dir>/peekaboo-<id> --reference path/to/image.png --serve
```

Run it in the background: it prints the file path and a `http://127.0.0.1:<port>/` URL, then serves only that page
until stopped. Open the URL in a browser tool if you have one and check it yourself. Then ask for approval with the
question from SKILL.md step 3 (options Approve and Cancel, plus the question's free-text box for typing what to
change; no "Change something" option), giving the URL, the file path and a one-line summary in plain words.

Redraw and rebuild for each round of changes. Only after approval copy the character into the app (SKILL.md step 4).
Then stop the server and delete the scratch folder and the preview file, which holds a copy of the reference image.
