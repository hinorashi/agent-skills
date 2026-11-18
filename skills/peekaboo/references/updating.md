# Updating an installed mascot

The app keeps its own copy of the engine, so a new skill version does not reach it by itself. Each time the skill is
used in a project that already has a peekaboo mascot, offer to bring that copy up to the latest version, whatever
the user came for.

## 1. Detect

`find_mascot.py` (SKILL.md step 1) reads `PEEKABOO_VERSION` from the copied module and compares it with
`assets/peekaboo.ts`:

- **UPDATE AVAILABLE `<file>`: `<old>` -> `<new>`**: offer the update. A copy without `PEEKABOO_VERSION` came from
  1.4.0 or earlier.
- **UP TO DATE**: say nothing about updates.

## 2. Ask

Add one field to the first form, so it costs no extra round, with a one-line summary of what the user gains from each
changelog entry newer than their version:

> Your mascot **Kei** uses peekaboo 1.4.0; 1.5.0 adds **Alt+Shift+K to turn the mascot off entirely**. Update it?

- **Update** (default): do it in the same run, before or alongside what the user asked for.
- **Not now**: change nothing. The offer comes back the next time the skill is used; do not record the refusal in
  their code.

If the user only asked about the update ("update my mascot"), this is the whole task.

## 3. Update

Keep the slot and the character; change only the engine and anything the changelog says to migrate.

1. Diff the project's copy against the version it came from, if you can tell (the git history of the file, or the
   skill's `assets/peekaboo.ts` at that version); otherwise diff against the latest. Changes outside `PEEKABOO_VERSION`
   are local edits: show them to the user and keep them unless they agree to drop them.
2. Replace the module and `peekaboo.css` with the latest assets, re-applying kept local edits. Match the project's
   language and style (strip types for plain JS), as at install.
3. Apply the **App changes** of every changelog entry newer than the installed version, oldest first.
4. Do not touch the character (SVG, character CSS, personality options), `storageKey`, edges or obstacles unless an
   entry says so.
5. Run the project's checks and tests, and update the mascot docs (shortcuts, help, changelog line such as
   "Changed: updated the Kei mascot to peekaboo 1.5.0 (Alt+Shift+K turns it off)").

In the report, say the old and new versions, what the user can now do, and any local edits kept or dropped.

## Changelog

Newest first. Each entry says what changed and what the app needs beyond copying the new module.

### 1.5.0

- **Power switch**: a second shortcut turns the mascot off entirely and back on (on by default, persisted under
  `<storageKey>-power`). It defaults to the show/hide shortcut plus Shift (Alt+K → Alt+Shift+K). New options
  `powerShortcut`, `powerStorageKey`, `poweredByDefault`; new API `powered`, `togglePower()`, `setPowered()`.
- **Optional feature folder**: the mascot lives in its own folder behind one `mountMascot()` boundary, so it can be
  removed without touching business code (SKILL.md step 4).
- **Version stamp**: `PEEKABOO_VERSION` in the module, used for these update offers.

App changes:

- Check the Shift variant of the show/hide shortcut is free in the app; if not, set `powerShortcut` explicitly, or
  `false` to opt out.
- Document the power shortcut wherever the show/hide shortcut is documented (README, help, shortcuts list).
- If the mascot is created outside a dedicated folder, offer to move it behind `mountMascot()` (SKILL.md step 4). It is
  optional; the update works without it.

### 1.4.0 and earlier

No `PEEKABOO_VERSION`. Treat as older than 1.5.0 and apply every entry above.

## Releasing a new version (skill maintainers)

1. Bump `metadata.version` in SKILL.md and `PEEKABOO_VERSION` in `assets/peekaboo.ts` to the same value;
   `find_mascot.py` warns when they disagree.
2. Add a changelog entry above with what changed and the **App changes** an installed mascot needs. Write "None"
   when copying the module is enough, so the update stays a one-step task.
3. Docs-only changes that do not affect installed apps need no version bump.
4. Record every user-facing change in `[Unreleased]` of `CHANGELOG.md` at the skill root, and move those notes under
   the new version when bumping.
