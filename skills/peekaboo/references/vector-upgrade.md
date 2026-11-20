# Direct AI SVG generation (optional)

OpenAI's `gpt-image-2.6-flare` and `gpt-image-2.6-sunburst` can answer with an SVG. The AI SVG branch sends a
plain-language character brief to the generation endpoint. The top-level image model renders the internal reference,
while a separate text model selected with `svg.model` authors the SVG. The skill defaults the SVG author to
`gpt-5.4-mini`; `OPENAI_SVG_MODEL` or `--svg-model` can override it. There is no separate concept-art request.
Basic SVG and AI SVG are separate, mutually exclusive choices. If AI SVG fails, the process stops and reports the
error; it never silently draws a local replacement. OpenAI bills this optional branch and it needs network access.

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
| **Drawing method** | **Basic SVG** (agent-drawn, no provider call) or **AI SVG** (Sunburst for realistic, Flare for chibi); say that OpenAI bills the AI branch | Basic SVG |

The API key field appears only for AI SVG. Blank uses `OPENAI_API_KEY`; a pasted key is read with `--api-key-stdin`,
used for this run only, never saved, echoed or written to files. The optional `OPENAI_SVG_MODEL` variable overrides
the default `gpt-5.4-mini` SVG author when that model is unavailable to the account.

## 3. Generate SVG from the character brief

Describe the species or type, proportions, outfit, 3–5 colors by name, expression, personality and keepsake. If the
source is the user's image, derive the traits locally under `references/from-image.md`. Keep the prompt original:
do not name franchises, brands, studios, artists or real people.

```bash
python3 <skill-dir>/scripts/generate_vector.py --prompt "small orange cat, pink scarf, tall ears, shy smile" \
  --id <id> --out <temp-dir>/peekaboo-<id>/vector \
  [--model gpt-image-2.6-sunburst] [--svg-model gpt-5.4-mini] \
  [--style realistic] [--width 80 --height 100] \
  [--complexity low|medium|high] [--notes "softer fur shading"]
```

`--complexity` defaults to `low` and controls the reference-image planning. Image quality and SVG-author reasoning
also default to `low` for every request, because these mascots are displayed at only 80–150 px and extra detail raises
cost/latency without reliably improving the result. Flare handles chibi; Sunburst handles realistic. Raise a setting
only when the user explicitly approves the cost and detail tradeoff.

The model receives one consistent, generic art direction: an original collectible-creature game illustration with
bold clean dark contours, rounded expressive shapes, broad 2–3-tone cel shading, crisp highlights and no painterly
texture. Do not put Pokémon, other franchise names, artist names or official character names into the prompt. The
direction describes broad visual traits and keeps the mascot anatomy and silhouette original.

SVG generation is synchronous and cannot use streaming or partial images. A long request can outlive a corporate
proxy's idle-tunnel limit even when short OpenAI requests work. TCP keepalive is enabled by default;
`OPENAI_KEEPALIVE_IDLE` changes the interval (15 seconds by default, clamped to 5–120), but TCP probes do not guarantee
that an application proxy will preserve an idle tunnel. Set `OPENAI_KEEPALIVE=0` only for a controlled diagnosis.
Network errors report a sanitized proxy hostname and port, including `RemoteDisconnected` failures. Do not hide the
proxy or retry the paid call automatically: a lost response may mean OpenAI already generated and billed the SVG.
After explicit approval for another paid call, the default low quality/complexity/reasoning settings minimize the
request. Otherwise run outside the proxy or ask the network administrator to permit long-lived HTTPS to
`api.openai.com`.

The script writes `vector/raw.svg` (the untouched answer) and `vector/<id>.svg` (the adapted result):

- removes `<title>`, `<desc>`, a full-canvas background, root `width`/`height`;
- inlines simple `<style>` class rules;
- turns `pb-face`, `pb-eyes`, `pb-pupils` and `pb-keepsake` into the classes used by the animation;
- prefixes other ids and repairs `url(#…)` references;
- crops and fits the viewBox to the requested size ratio;
- rounds coordinates and configures the look animation for the new viewBox;
- runs `check_mascot_svg.py`.

Exit codes: `0` ready; `3` written but the check fails, usually because a part is missing; `1` provider, network or
response error; `2` invalid usage. Do at most one extra paid call after a temporary rate-limit or server error. Any
nonzero exit ends the AI SVG process. Do not preview or install a partial result.

The structural checker is not the visual-quality gate. Before writing the adapted result, `quality_issues()` also
rejects:

- missing, duplicate or incorrectly nested animated groups;
- exact duplicate painted shapes, which usually means duplicated eyes, pupils or facial highlights;
- a `pb-keepsake` group taller than half the canvas, which usually means the whole wings, head or body were placed
  inside the keepsake;
- a `pb-face` narrower than 38% of the canvas, which makes the mascot face illegible at actual size.

Those failures return a nonzero exit and leave only `raw.svg` for diagnosis. Do not treat "the parts check passed" as
visual approval, and do not preview a rejected result.

## 4. Fix within the AI branch

On exit code `3` or a `WARN`:

- **Missing part**: find the rendered eyes, pupils, face and keepsake, wrap them in the missing `pb-*` groups, and
  run the checker again. Re-adapt a saved response without paying: `generate_vector.py --adapt raw.svg --id <id> --out
  vector`.
- **Over about 15 KB**: remove tiny detail shapes by hand without changing the design, or stop the process. Do not
  start a free local redraw.
- **Off-model**: report it to the user and stop, or retry once only when the user explicitly approves another paid call.

If OpenAI rejects the key, has no credit/model access, filters the prompt, or the response cannot be adapted, say
what happened, include the exit code and `HINT`, and stop. Never switch to Basic SVG in the same run. The user may
explicitly choose Basic SVG in a separate run.

The API request must contain both model roles:

```json
{
  "model": "gpt-image-2.6-flare",
  "output_format": "svg",
  "svg": {
    "model": "gpt-5.4-mini"
  }
}
```

`model` selects the image model that creates the reference. `svg.model` selects the text model that authors the SVG.
Do not treat an error for `svg.model` as a Flare/Sunburst error. Report the error and stop; a later retry can choose an
available SVG author with `--svg-model` or `OPENAI_SVG_MODEL`.

## 5. Preview and approve

Copy the adapted result into the normal character folder and use the same preview as Basic SVG:

```bash
cp <temp-dir>/peekaboo-<id>/vector/<id>.svg <temp-dir>/peekaboo-<id>/<id>.svg
python3 <skill-dir>/scripts/make_preview.py <temp-dir>/peekaboo-<id> --serve
```

Check the actual-size poses: only the face, eyes and pupils should move. The approval question follows the normal
Approve / Cancel / freeform textbox contract.

- A small change ("warmer hair", "smaller ears") edits the SVG directly; do not pay again.
- A design change repeats the selected AI branch once only after the user approves the next paid request. Switching to
  Basic SVG requires a new, explicit selection.
- `raw.svg` and the `vector/` folder stay in the scratch folder and are deleted after approval or cancellation. Only
  the chosen `<id>.svg` goes into the app.
