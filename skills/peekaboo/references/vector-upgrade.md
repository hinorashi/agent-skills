# Direct AI SVG generation (optional)

OpenAI's `gpt-image-2.6-flare` and `gpt-image-2.6-sunburst` can answer with an SVG. The AI SVG branch sends a
plain-language character brief to the generation endpoint, then adapts the answer to the mascot parts contract. There
is no separate concept-art request. The Basic SVG branch is the fallback: if generation fails, the agent draws the
mascot from the same brief without another paid request. OpenAI bills this optional branch and it needs network access.

## 1. Why the brief is text

Flare and Sunburst accept image inputs only on `POST /v1/images/edits` (raster images, plus an optional markup overlay),
and that endpoint returns raster images. SVG output exists only on `POST /v1/images/generations`, which takes a prompt
and no input image; an SVG is not accepted as an edit input. The normal flow therefore sends a text brief.

For a user-provided reference image, inspect it locally and send only generic traits in the brief. Do not upload the
image in this flow. If OpenAI later allows image input with `output_format: "svg"`, reevaluate consent before using it.

The generated result is static vector art with no scripts, external resources or embedded raster images. Animation
still comes from `peekaboo.css` and the required `pb-*` parts. Animated GIF output is never used.

## 2. Offer one drawing-method choice

For a new or image-based character, run this credential check before building the form:

```bash
python3 <skill-dir>/scripts/generate_vector.py --check
```

The form has exactly two creation branches:

| Field | Notes | Default |
|---|---|---|
| **Drawing method** | **Basic SVG** (agent-drawn, no provider call) or **AI SVG** (Flare; Sunburst when requested); say that OpenAI bills the AI branch | Basic SVG |

The API key field appears only for AI SVG. Blank uses `OPENAI_API_KEY`; a pasted key is read with `--api-key-stdin`,
used for this run only, never saved, echoed or written to files.

## 3. Generate SVG from the character brief

Describe the species or type, proportions, outfit, 3–5 colors by name, expression, personality and keepsake. If the
source is the user's image, derive the traits locally under `references/from-image.md`. Keep the prompt original:
do not name franchises, brands, studios, artists or real people.

```bash
python3 <skill-dir>/scripts/generate_vector.py --prompt "small orange cat, pink scarf, tall ears, shy smile" \
  --id <id> --out <temp-dir>/peekaboo-<id>/vector \
  [--model gpt-image-2.6-sunburst] [--style realistic] [--width 80 --height 100] \
  [--complexity low|medium|high] [--notes "softer fur shading"]
```

`--complexity` defaults to `medium` and has no separate fee. Higher complexity can add detail but also drift from the
brief. Use Flare by default for speed; use Sunburst for more detail when the user asks.

The script writes `vector/raw.svg` (the untouched answer) and `vector/<id>.svg` (the adapted result):

- removes `<title>`, `<desc>`, a full-canvas background, root `width`/`height`;
- inlines simple `<style>` class rules;
- turns `pb-face`, `pb-eyes`, `pb-pupils` and `pb-keepsake` into the classes used by the animation;
- prefixes other ids and repairs `url(#…)` references;
- crops and fits the viewBox to the requested size ratio;
- rounds coordinates and configures the look animation for the new viewBox;
- runs `check_mascot_svg.py`.

Exit codes: `0` ready; `3` written but the check fails, usually because a part is missing; `1` provider, network or
response error; `2` invalid usage. Do at most one extra paid call after a temporary rate-limit or server error.

## 4. Fix or fall back

On exit code `3` or a `WARN`:

- **Missing part**: find the rendered eyes, pupils, face and keepsake, wrap them in the missing `pb-*` groups, and
  run the checker again. Re-adapt a saved response without paying: `generate_vector.py --adapt raw.svg --id <id> --out
  vector`.
- **Over about 15 KB**: remove tiny detail shapes, try once at `--complexity low`, or use Basic SVG.
- **Off-model**: retry once with a precise `--notes` correction, then use Basic SVG.

If OpenAI rejects the key, has no credit/model access, filters the prompt, or the response cannot be adapted, say
what happened in one line and continue with Basic SVG. Never block mascot creation on the paid branch.

## 5. Preview and approve

Copy the adapted result into the normal character folder and use the same preview as Basic SVG:

```bash
cp <temp-dir>/peekaboo-<id>/vector/<id>.svg <temp-dir>/peekaboo-<id>/<id>.svg
python3 <skill-dir>/scripts/make_preview.py <temp-dir>/peekaboo-<id> --serve
```

Check the actual-size poses: only the face, eyes and pupils should move. The approval question follows the normal
Approve / Cancel / freeform textbox contract.

- A small change ("warmer hair", "smaller ears") edits the SVG directly; do not pay again.
- A design change repeats the selected branch once from an updated brief, or switches to Basic SVG.
- `raw.svg` and the `vector/` folder stay in the scratch folder and are deleted after approval or cancellation. Only
  the chosen `<id>.svg` goes into the app.
