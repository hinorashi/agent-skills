# Case study: Kei in Ganttz

Kei is the mascot this skill was extracted from. He lives in Ganttz, a browser-only Gantt chart editor (TypeScript, Vite,
Mermaid, CodeMirror) with a header, an intro bar and two side-by-side panels (editor, preview) split by a draggable
divider. Use this as a worked example of the interview answers turning into code.

## Interview answers

| Question | Answer |
|---|---|
| Name | Kei (inspired by Kei Kurono, Gantz) |
| Look | chibi boy, black suit with a collar and a small grey node on the chest, spiky black hair |
| Personality | curious but wary: looks left, right, blinks, ducks back |
| Keepsake | his hair tuft; "grab his hair to pull him back" |
| Where | header bottom edge (up into the header and down into the gap), top of the panels, left and right of the panels |
| Size | 80 × 100 (double the first 40 × 50 draft) |
| Shortcut | Alt+K, hidden by default |
| Keepsake time | 10 s, `VITE_KEI_MARK_SECONDS` in `.env` |
| Notices | only when he cannot find a free spot |

## How the design evolved (lessons)

1. **Attached to a control (dropped).** First he lived in the resize divider and looked toward the drag direction.
   Users found a mascot inside a control distracting; peeking from edges is better.
2. **Single spot → random edges.** Varying where he appears keeps it surprising; never covering panels, buttons or text
   keeps it harmless. The obstacle list plus gap is what made "random" safe.
3. **Leave something behind.** A blinking dot, then an arrow, then a curved arrow were tried as "call back" marks.
   The final idea was best: his own hair tuft above the edge. A keepsake from the character itself needs no explanation.
4. **Quiet by default.** Off until Alt+K, no "Kei is on" toast, only a notice when he cannot appear.
5. **Configurable duration.** The keepsake lifetime moved to an env file so it can be tuned without code changes.

## Ganttz-specific mapping

```ts
createPeekaboo({
  name: 'Kei',
  character: 'kei',          // gallery id; routine/interval/accent come from characters/kei/character.json
  svg: keiSvg,
  edges: [
    { anchor: 'header', side: 'bottom', inward: true },  // header-up
    { anchor: 'header', side: 'bottom' },                // header-down
    { anchor: '.workspace', side: 'top' },               // panels-up
    { anchor: '.workspace', side: 'left' },              // panels-left
    { anchor: '.workspace', side: 'right' },             // panels-right
  ],
  obstacles: '.panel, #splitter, button, input, label, a, select, textarea, .brand, .version, .local-badge, .intro > div, details',
  touchable: '.panel, #splitter',
  keepsakeMs: Number(import.meta.env.VITE_KEI_MARK_SECONDS ?? 10) * 1000,
  shortcut: { code: 'KeyK', altKey: true },
  storageKey: 'ganttz-kei',
  zIndex: 10, // below the sticky panel heads (300)
  notify: message => toast(message, 'info'),
});
```

The original in-app implementation (before extraction) used `kei-*` class names, a hard-coded rise cap of the gap
between header and panels, and `tufted` instead of `keepsake`; behavior is otherwise the same.

## Tests that guarded it

- Visit → keepsake → click recall, with `page.clock` and `Math.random = () => 0.5`.
- Alt+K default off, toggle, persisted choice.
- "No free spot" notice in a 420 × 320 viewport.
- Seeded 15-minute random run at 1280 and 1920 px asserting zero overlap with obstacles.
