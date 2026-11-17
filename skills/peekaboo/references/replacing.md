# Replacing an installed mascot

An app gets one mascot. Two would compete for the same edges and shortcuts, and double the interruptions. So when
the app already has one, the user chooses: **replace** it with the new mascot, or **keep** it and stop.

## 1. Detect

Run this while looking at the app, before asking anything:

```bash
python3 <skill-dir>/scripts/find_mascot.py <project-dir>
```

- **PEEKABOO**: installed with this skill. The report shows the `createPeekaboo` call site with its name, character,
  shortcut and storage key, the copied module (`[module <version>]`), the SVG and CSS files, and whether an update is
  available (`references/updating.md`).
- **POSSIBLE hand-built**: files with words like mascot, peek, keepsake or tuft in code. Read the top files to confirm
  it really is a mascot (a "peek" tooltip or a "mascot" image in the footer is not) and to learn its name, where it
  appears, its shortcut and its config.
- **OK no mascot found**: carry on with the normal workflow.

## 2. Ask

Put the question in the same round as the character choice (SKILL.md step 1) so it costs no extra round:

> This app already has **Kei** (peeks from the header and panels, Alt+K). An app shows one mascot at a time.
> **Replace Kei** with the new one, or **keep Kei** and stop?

- **Keep**: change nothing and end. If they seemed to want a tweak rather than a new mascot (rename, recolor,
  different timing), offer that instead.
- **Replace**: go on. Nothing is removed until the new character is approved (step 3 preview for new and image-based
  characters), so the old one keeps working while the user decides.
- **Same character again** (Kei is installed and they pick Kei): this is an update, not a replacement. Follow
  `references/updating.md`: refresh the module and the character's files, keep the app's settings.
- **Several mascots found**: list them and confirm that all are replaced by the one new mascot.

## 3. Replace

Think of it as keeping the **slot** and changing the **character**. The slot is everything fitted to this app; users
and the code already rely on it. The character is what the user asked to change.

| Keep (the slot) | Change (the character) |
|---|---|
| the optional folder and its single mount/unmount boundary | SVG file and its import |
| `edges`, `obstacles`, `touchable`, `zIndex` | `name`, `character` |
| `notify` wiring, the keepsake-time config and its validation | personality: `keepsake`, `interval`, `routine`, `accent` |
| the shortcut, unless the user picks a new one (offer the new character's suggestion) | character CSS file (`<id>.css`) |
| `storageKey`: pin the old key so people who turned the mascot on still see the new one | labels and comments that name it |

### Installed with this skill

1. Swap the character: add the new SVG (and CSS), update the `createPeekaboo` options from its `character.json`,
   delete the old character's SVG and CSS. Keep the app shell's one `mountMascot()` integration unchanged.
2. Pin the storage key. The default key comes from `name` (`peekaboo-kei`), so a new name would silently turn the
   mascot off for everyone who had it on. Set `storageKey` to the old key, with a comment saying why.
3. Refresh the module if the project's copy is older than `assets/peekaboo.ts` / `peekaboo.css`. Diff first: if the
   project changed it locally, show the user the differences and keep their changes unless they agree to drop them.
4. Keep configuration, asset imports and app-specific adapters inside the optional mascot folder. Business features
   must not import mascot code or assets.

### Hand-built (not this skill)

Replacing means removing the old implementation and installing the skill's module in its place.

1. Read it and write down its slot: where it appears (these become `edges`), what it avoids (`obstacles`), its
   shortcut, its storage key and the config for its timing. Use them as the defaults for the new install.
2. Show the user what will be removed before removing it: the files, the markup, CSS rules, functions, env vars,
   tests and docs. They may have tweaks they want to keep.
3. Remove it and wire the new mascot in its place (SKILL.md step 4). If it stored its on/off choice under a known
   key, pass that as `storageKey`, when it uses the same `'on'`/`'off'` values.

### Removing the mascot later

For an install following SKILL.md, remove the app shell's import and mount call for `mountMascot()`, then delete the
optional mascot folder. Remove mascot-only config, tests and docs, and run the project's type check, build and
relevant tests. The feature is not cleanly removable if business code imports its engine, stylesheet, SVG or config;
move those references behind the optional folder's mount boundary first. Keep unrelated business behavior unchanged.

### Names in config and identifiers

Config named after the old mascot (`VITE_KEI_MARK_SECONDS`, `kei-peek`, `KEI_WIDTH`) should follow the new name, or
be made neutral (`VITE_MASCOT_KEEPSAKE_SECONDS`, `mascot`), which saves the rename next time. Update every reference in
the repo: `.env`, `.env.example`, env type declarations, CI files, docs. Deployed environments are outside the repo,
so tell the user which variable to rename there.

## 4. Check nothing is left behind

```bash
python3 <skill-dir>/scripts/find_mascot.py <project-dir> --name <old name>
```

It lists every line that still mentions the old name, including identifiers such as `keiSvg`, `KEI_WIDTH` and
`kei-peek`. Expected leftovers are history only: changelog entries and the pinned `storageKey`. Then run the
project's checks and tests (update or replace tests that targeted the old mascot; `references/testing.md`), and add a
changelog line such as "Changed: replaced the Kei mascot with Mochi (same shortcut, Alt+K)".

In the report (SKILL.md step 7), say what was replaced, what was kept (shortcut, places, storage key) and any
variable to rename in deployed environments.
