# Concept art with an image model (optional)

For a new or image-based character, an image model (OpenAI or Amazon Bedrock) can paint a polished concept first. You
then redraw it as the animated SVG. The concept is a **design target only**: the mascot in the app stays pure inline
SVG with the `pb-*` parts (`check_mascot_svg.py` still rejects `<image>`), so the module, motion and size are the same
as without it. Off by default; it costs money with the provider and needs network access.

## 1. Offer it in the first form

Run the check before building the form. It never prints secret values:

```bash
python3 <skill-dir>/scripts/generate_concept.py --check
```

Add these fields to the step 1 form, for a new or image-based character only:

| Field | Notes | Default |
|---|---|---|
| **Concept art** | none, **OpenAI** or **Amazon Bedrock**; say which ones were found in the environment and that the provider bills it | none |
| **API key** | blank to use the environment; or paste a key used for this run only (prefer a short-term or restricted key, revoke it afterwards: a pasted key stays in the chat history) | blank |
| *Image only:* **Send my image to the provider?** | yes sends the user's image for a closer likeness; no sends only a text description of the traits | no |

Credentials, in order: the key typed in the form, then the environment.

- **OpenAI**: `OPENAI_API_KEY` (optional `OPENAI_BASE_URL`, `OPENAI_ORG_ID`, `OPENAI_PROJECT_ID`). Default model
  `gpt-image-1.5`; `--model gpt-image-1` or `gpt-image-1-mini` if the account lacks it.
- **Amazon Bedrock**: a Bedrock API key in `AWS_BEARER_TOKEN_BEDROCK`, or normal AWS credentials (env vars, profile,
  SSO) when `boto3` is installed. Region from `--region`, `AWS_REGION` or `AWS_DEFAULT_REGION` (default `us-east-1`);
  short-term API keys only work in the region they were made for. Default model `amazon.nova-canvas-v1:0`
  (`amazon.titan-image-generator-v2:0` also works); the account needs model access granted in that region.

If the chosen provider has no credentials and the user left the key blank, say so in one line and draw without a
concept. Never block the mascot on it.

## 2. Keep keys secret

- Pass a typed key on **stdin** with `--api-key-stdin`, never as an argument (arguments show up in process lists and
  shell history) and never through a file:
  `printf '%s' '<key>' | python3 <skill-dir>/scripts/generate_concept.py --api-key-stdin ...`.
  Do not echo the key back in chat, commands you show, notes or reports.
- Never write a key to `.env`, `character.json`, the app, the scratch folder or memory. It is for this run only; ask
  again next time unless it is in the environment.
- Errors from the script redact the key. If a provider rejects it, say "the key was rejected" without repeating it.

## 3. Write the prompt

The script frames the prompt as a design sheet (one character, full body, front view, plain background, top feature
visible) and adds the style; `--prompt` only describes the character:

- species or type, build, hair or fur, outfit, 3–5 colors by name, the keepsake as the top-most feature, the
  personality as a pose or expression ("shy, peeking with hands near the face");
- **no names** of franchises, brands, studios, artists or real people: describe generic traits instead, the same
  originality rule as `references/character-design.md`;
- short and concrete: Bedrock allows 1024 characters in total, framing included. Do not write negations ("no hat");
  leave things out instead.

```bash
python3 <skill-dir>/scripts/generate_concept.py --provider openai|bedrock --style chibi|realistic \
  --prompt "small round orange cat, cream belly, big green eyes, tall pointed ears, shy smile" \
  --out <temp-dir>/peekaboo-<id>/concept [--reference path/to/image.png] [--n 1] [--quality medium]
```

It writes `concept-1.png` (… `concept-N.png`) and prints the paths. Keep `--n 1` unless the user wants options: each
image is billed. With the user's consent, `--reference` sends their image (OpenAI edits; Bedrock image variation,
`--similarity 0.2–1.0`, default 0.5); the eligibility and permission rules of `references/from-image.md` §2 apply
first. Without consent, describe the traits in `--prompt` instead.

On failure the script prints `ERROR [<kind>] …` and a `HINT` line; failed requests are not billed, and rate limits and
server errors are already retried once. Report it to the user in one line, in plain words, then act on the kind:

| Kind | Meaning | Do |
|---|---|---|
| `auth` | key rejected or expired | ask for another key or a fixed variable; never retry the same key |
| `access`, `model` | no access to the model or region (Bedrock model access, OpenAI organization verification) | try another `--model` / `--region` once if the user agrees, else draw without a concept |
| `quota` | no credit left | draw without a concept; the user adds billing with the provider |
| `content_filter` | the provider refused the prompt or image | rephrase once with generic traits (no names, no real people), without the reference image if one was sent |
| `prompt` | prompt too long | shorten it and run again |
| `request` | the provider rejected the request format: a bug in this skill, not in the prompt | do not retry or patch the script on the fly; tell the user to update the skill, draw without a concept |
| `rate_limit`, `server`, `network`, `response` | temporary or connection problem | one more try at most, then draw without a concept |

Never loop on paid retries: at most one extra call per run unless the user asks. Whatever happens, the mascot is
still drawn and previewed.

## 4. Redraw it as the SVG

Look at the PNG with your image viewer. Treat it like a reference image (`references/from-image.md` §3): take the
silhouette, proportions, palette and keepsake, then draw the SVG per `references/character-design.md`, simplified for
the actual size (80 × 100 px chibi): fewer strands and folds, flat fills, soft shading in 1–2 tones. The face must be
`pb-face`, the eyes `pb-eyes` / `pb-pupils` and the keepsake `pb-keepsake` at the top, whatever the concept shows.

Preview both side by side:

```bash
python3 <skill-dir>/scripts/make_preview.py <temp-dir>/peekaboo-<id> --concept <temp-dir>/peekaboo-<id>/concept/concept-1.png [--reference ...] --serve
```

Say in the approval message that the concept is the target and the SVG is what goes into the app.

## 5. Change requests and cleanup

- A change to the drawing ("smaller hat", "warmer hair"): edit the SVG; do not pay for a new concept.
- A change to the design itself ("make it a fox", "different outfit"), or the user asks for a new concept:
  regenerate with an updated prompt, then redraw.
- The concept PNGs live only in the scratch folder. Never copy them into the app or commit them; delete them with the
  scratch folder and the preview after approval or cancel.
