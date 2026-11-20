# Changelog

All notable changes to the `peekaboo` skill are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Versions follow `metadata.version` in
[SKILL.md](./SKILL.md) and [SemVer](https://semver.org/). Dates come from the commit that set each version; there are
no Git tags yet.

## [Unreleased]

## [1.6.1] - 2026-11-20

### Fixed

- OpenAI `RemoteDisconnected` failures are now classified as network errors with the sanitized proxy route instead
  of escaping as a traceback. Long SVG requests still are not retried automatically because they may already have
  been billed.
- Long OpenAI SVG requests now attempt TCP keepalive (`OPENAI_KEEPALIVE_IDLE=15` by default), and network errors
  report the sanitized proxy route. The proxy may still reject a long non-streaming request; the skill reports that
  clearly instead of substituting a local drawing or retrying a potentially billed request.

### Changed

- AI SVG requests now default to low image quality, low complexity and low SVG-author reasoning to reduce cost and
  latency at mascot size. Prompts request an original collectible-creature illustration with clean contours,
  rounded shapes, broad cel shading and crisp highlights without naming or reproducing franchise artwork.

What an installed mascot needs to move to a newer engine (the **App changes**) is in
[references/updating.md](./references/updating.md).

## [1.6.0] - 2026-11-19

### Added

- A two-branch drawing flow for new or image-based mascots: **Basic SVG** is drawn locally by the agent, while
  **AI SVG** calls OpenAI's `gpt-image-2.6-flare` or `gpt-image-2.6-sunburst` directly and returns the mascot SVG.
  Both branches use the same validation, preview and approval steps. AI failures stop the process visibly and never
  switch to Basic SVG without a new, explicit user choice.
- A Mermaid workflow in the repository README that separates the user, agent UI, local backend and OpenAI model,
  including credential handling, validation, approval and cleanup.

### Fixed

- AI SVG quality is no longer judged by structural validity alone. Realistic mode uses Sunburst with high reference
  quality and high SVG-author reasoning; generated SVG is rejected when anatomy is duplicated, the keepsake contains
  half the canvas or the face is too narrow. This prevents artifacts like a duplicated-eye, wing-dominated mascot
  from reaching the preview.
- AI SVG requests send both required model roles: the top-level Flare/Sunburst image model and the separate
  `svg.model` author (`gpt-5.4-mini` by default, overridable with `OPENAI_SVG_MODEL` or `--svg-model`). This fixes
  OpenAI's `SVG generation requires 'svg.model'` response.
- Installed skills now bundle `.gitignore` rules for Python `__pycache__` directories and bytecode files, so running
  validation scripts does not dirty the host project.

### Changed

- Concept art is no longer part of the standard mascot flow. The agent chooses Basic SVG or direct AI SVG instead,
  so there is no paid raster concept step before drawing the mascot.
- AI SVG errors say what went wrong (rejected key, no model access, no credit, content filter, skill bug…) and stop
  before preview or installation; a local Basic SVG is never substituted in the same run. Temporary rate-limit and
  provider errors are retried once.

- Approving a preview is now one single-choice question: **Approve** (default), **Cancel**, or type what to change in
  the free-text box. Any typed answer counts as a change request, so there is always a place to describe the change.

## [1.5.0] - 2026-11-18

### Added

- Power switch: a second shortcut (the show/hide shortcut plus Shift, e.g. Alt+Shift+K) turns the mascot off entirely
  and back on. On by default and persisted; new options `powerShortcut`, `powerStorageKey`, `poweredByDefault` and API
  `powered`, `togglePower()`, `setPowered()`.
- Update offer: the engine carries `PEEKABOO_VERSION`; when the skill is used in a project with an older mascot, it
  offers the update in the same form and keeps local edits unless the user drops them.

### Changed

- The mascot is installed as an optional feature in its own folder behind one `mountMascot()` boundary, so it can be
  removed without touching business code.

## [1.4.0] - 2026-11-17

### Added

- Realistic style next to chibi for new and image-based mascots (realistic only for animals, objects, the user's own
  drawings and the user themselves).
- `make_preview.py --serve` opens the preview on a localhost URL, since built-in browsers often block `file://` pages;
  the preview shows the palette as swatches.
- CSS variables `--peekaboo-look-face` and `--peekaboo-look-pupils` to tune how far the face and pupils look sideways.

### Changed

- Every question, including permission for a real person in an image, is asked in one form with defaults read from the
  app. Drawing starts right away; the user approves the result on the preview instead of a separate concept round.
- Colors are described in plain words rather than hex codes.

## [1.3.0] - 2026-11-17

### Added

- One mascot per app: `find_mascot.py` detects an installed or hand-built mascot, and the skill asks whether to
  replace it or keep it. Replacing keeps the app's slot (call site, edges, obstacles, shortcut, storage key, config)
  and checks that nothing of the old character is left.

## [1.2.0] - 2026-11-17

### Added

- Mascot from your own image (photo, pet, sketch, favorite character): `check_reference_image.py` checks the image is
  eligible (PNG, JPEG, WebP, GIF) before drawing. The reference image is never embedded, traced or committed.
- Preview page (`make_preview.py`) showing the drawing, poses, keepsake and a live peek, for approval before the app is
  touched; it is deleted afterwards.

## [1.1.0] - 2026-11-17

### Added

- Ready-made characters: Kei (spiky-haired boy), Mochi (shy cat) and Bolt (curious robot), each with an SVG,
  `character.json` and optional scoped CSS.
- Personality options `routine`, `interval`, `keepsake` and `accent`, so characters differ without editing the engine.

### Changed

- The Kei example moved from `assets/examples/kei.svg` to `assets/characters/kei/kei.svg`.

## [1.0.0] - 2026-11-17

### Added

- First version: interviews the user, draws an original SVG character that peeks out from page edges at random free
  spots, looks around, blinks and hides, never covering the UI.
- Clickable keepsake left above the edge for a configurable time (10 s by default) to call the mascot back, and a
  keyboard shortcut to toggle it.
- `check_mascot_svg.py` validates the character's required parts.
