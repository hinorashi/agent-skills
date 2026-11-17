# Testing a peekaboo mascot

Timed animation and randomness make naive tests slow and flaky. Control both.

## Determinism

- Pass `random` in options (or override `Math.random` before the app loads) to make spots and look direction stable.
  A constant `0.5` picks middle offsets; a seeded generator (e.g. mulberry32 with seed 7) gives varied but repeatable
  runs.
- Use a fake clock. With Playwright: `await page.clock.install()` before `page.goto()`, then
  `await page.clock.runFor(ms)` to advance through the routine (total ≈ 3.8 s from rise to keepsake).
- Seed the on/off choice: `await page.addInitScript(() => localStorage.setItem('peekaboo-kei', 'on'))`.

## Checks worth having

1. **Off by default**: no visit after 60 s of fake time; the shortcut turns it on and a visit starts at once;
   pressing again hides it and stores `off`; after reload the stored choice wins.
2. **Power switch**: powered on by default; the power shortcut (e.g. Alt+Shift+K) hides everything, shows one notice,
   stores `off` under `<storageKey>-power`, and makes the show/hide shortcut do nothing; pressing it again restores
   the previous show/hide state; after reload the stored power choice wins.
3. **Visit**: `.peekaboo-figure` gets `peeking`, then `data-look` left/right, then `blinking`, then `keepsake`.
4. **Keepsake**: the grab area is visible, touches the edge it hides at, the keepsake part is inside the viewport while
   the eyes (`.pb-eyes`) are clipped out of the frame; clicking replays the visit; after `keepsakeMs` the grab area is
   hidden.
5. **No overlap**: run many visits (fake 15 minutes, seeded random) at 1280 and 1920 px wide and assert the frame's
   box never intersects any obstacle, using the same selector as the app.
6. **No free spot**: in a tiny viewport (e.g. 420 × 320) turning it on shows exactly one notice and no mascot.
7. **Reduced motion**: `page.emulateMedia({ reducedMotion: 'reduce' })` → no random visits.

## Overlap assertion snippet (Playwright)

```ts
const overlaps = await page.evaluate(selector => {
  const frame = document.querySelector('.peekaboo')!.getBoundingClientRect();
  return [...document.querySelectorAll(selector)].filter(element => {
    const box = element.getBoundingClientRect();
    return box.width && box.height && frame.width && frame.height
      && frame.left < box.right && frame.right > box.left && frame.top < box.bottom && frame.bottom > box.top;
  }).map(element => element.outerHTML.slice(0, 80));
}, OBSTACLES);
expect(overlaps).toEqual([]);
```

Touchable surfaces touch the frame with zero gap, so strict `<`/`>` comparisons are intended.

## Visual check

Take screenshots of a peeking and a keepsake state (fake clock, fixed random) and look at them: the face should read,
the keepsake should be recognizable, and nothing of the app should be covered. Delete temporary screenshot specs after.
