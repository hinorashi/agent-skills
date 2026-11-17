// Peekaboo: a small SVG mascot that now and then peeks out from behind an edge of the page, looks around, blinks and
// sinks back, leaving a keepsake (hair tuft, ears, hat tip...) above the edge that can be clicked to call it back.
// Two switches: show/hide (e.g. Alt+K, default off) and power (e.g. Alt+Shift+K, default on) for turning it off entirely.
// Framework-free, no dependencies. Pair with peekaboo.css. See the peekaboo skill's SKILL.md for how to adapt it.

/** The peekaboo skill version this copy came from; the skill compares it to offer updates. Keep it when copying. */
export const PEEKABOO_VERSION = '1.5.0';

export type Side = 'top' | 'bottom' | 'left' | 'right';
type Direction = 'up' | 'down' | 'left' | 'right';

/** One edge the mascot can hide behind. It rises away from `anchor` across `side`, or into it with `inward: true`. */
export interface EdgeSpec {
  anchor: string;
  side: Side;
  inward?: boolean;
}

/**
 * look: glance left or right at random · look-back: glance the other way · look-ahead: face forward ·
 * blink / tilt: blink or tilt the head until the next step · pause: just wait · sink: hide (leaving the keepsake)
 */
export type RoutineAction = 'look' | 'look-back' | 'look-ahead' | 'blink' | 'tilt' | 'pause' | 'sink';
export type RoutineStep = [ms: number, action: RoutineAction];

/** Curious and a little wary: Kei's routine. About 3.3 s from rising to sinking. */
export const defaultRoutine: RoutineStep[] = [
  [700, 'look'], [800, 'look-back'], [800, 'look-ahead'], [250, 'blink'], [320, 'pause'], [450, 'sink'],
];
const routineActions = new Set<string>(['look', 'look-back', 'look-ahead', 'blink', 'tilt', 'pause', 'sink']);

export interface PeekabooOptions {
  /** Display name used in labels and messages, e.g. "Kei". */
  name: string;
  /** Inline `<svg viewBox="...">` markup. Its aspect ratio should match width:height. */
  svg: string;
  edges: EdgeSpec[];
  /** Everything the mascot must never cover: panels, controls, text. */
  obstacles: string;
  /** Obstacles the mascot may touch with zero gap (usually the elements it hides behind). Default: the edge anchors. */
  touchable?: string;
  /** Size in CSS pixels when upright. Default 80 × 100. */
  width?: number;
  height?: number;
  /** Shortest rise that still shows the whole face; shorter spots are skipped. Default 76% of height. */
  minRise?: number;
  /** Pixels of the top of the figure left above the edge after hiding. 0 disables the call-back keepsake. Default 14. */
  keepsake?: number;
  /** How long the keepsake stays, in ms. Default 10 000. */
  keepsakeMs?: number;
  /** Clearance from non-touchable obstacles. Default 8. */
  gap?: number;
  /** Random wait between visits, in ms. Default [12 000, 42 000]. */
  interval?: [number, number];
  /** localStorage key for the show/hide choice. Default `peekaboo-<name>`. */
  storageKey?: string;
  /** Show/hide shortcut matched by `KeyboardEvent.code`, e.g. { code: 'KeyK', altKey: true }. `false` disables it. */
  shortcut?: Shortcut | false;
  /** Whether the mascot is shown before the user has toggled it. Default false. */
  enabledByDefault?: boolean;
  /**
   * Shortcut that turns the whole mascot on or off. While off, it never appears and the show/hide shortcut is ignored.
   * Default: the show/hide shortcut plus Shift (Alt+K → Alt+Shift+K). `false` disables it.
   */
  powerShortcut?: Shortcut | false;
  /** localStorage key for the power choice. Default `<storageKey>-power`. */
  powerStorageKey?: string;
  /** Whether the mascot is powered on before the user has toggled it. Default true. */
  poweredByDefault?: boolean;
  /** Stable id for character-specific CSS (`.peekaboo[data-character=...]`). Default: the name in lowercase. */
  character?: string;
  /** What happens during a visit: [wait before the step in ms, action]. Ends with 'sink' (added if missing). */
  routine?: RoutineStep[];
  /** Focus ring color of the call-back grab area. Default #5368d6. */
  accent?: string;
  /** Keep below sticky headers and dialogs. Default 10. */
  zIndex?: number;
  /** Shown only when the mascot is turned on but no free spot exists. Default console.info. */
  notify?: (message: string) => void;
  /** Injected for tests. Default Math.random. */
  random?: () => number;
}

export interface Shortcut { code: string; altKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean }

export interface Peekaboo {
  /** Shown: visits are on. Only takes effect while powered. */
  readonly enabled: boolean;
  toggle(): boolean;
  setEnabled(on: boolean): void;
  /** Powered: the mascot exists at all. While off, nothing appears and the show/hide shortcut is ignored. */
  readonly powered: boolean;
  togglePower(): boolean;
  setPowered(on: boolean): void;
  /** Peeks out now at a random free spot; resolves false when there is none. */
  peekNow(): Promise<boolean>;
  hide(): void;
  destroy(): void;
}

interface Box { left: number; top: number; width: number; height: number }
interface Spot { edge: number; along: number }
interface Clip extends Box { direction: Direction; rise: number }

const turns: Record<Direction, number> = { up: 0, down: 180, left: -90, right: 90 };
const outward: Record<Side, Direction> = { top: 'up', bottom: 'down', left: 'left', right: 'right' };
const flipped: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** "Alt+Shift+K" for { code: 'KeyK', altKey: true, shiftKey: true }. */
function label(keys: Shortcut) {
  const mods = (['ctrlKey', 'altKey', 'shiftKey', 'metaKey'] as const).filter(key => keys[key])
    .map(key => ({ ctrlKey: 'Ctrl', altKey: 'Alt', shiftKey: 'Shift', metaKey: 'Meta' })[key]);
  return [...mods, keys.code.replace(/^(Key|Digit)/, '')].join('+');
}

export function createPeekaboo(options: PeekabooOptions): Peekaboo {
  const width = options.width ?? 80;
  const height = options.height ?? 100;
  const minRise = Math.min(height, options.minRise ?? Math.round(height * 0.76));
  const keepsake = Math.max(0, options.keepsake ?? 14);
  const keepsakeMs = options.keepsakeMs ?? 10_000;
  const gap = options.gap ?? 8;
  const [minWait, maxWait] = options.interval ?? [12_000, 42_000];
  const storageKey = options.storageKey ?? `peekaboo-${options.name.toLowerCase().replace(/\W+/g, '-')}`;
  const touchable = options.touchable ?? options.edges.map(edge => edge.anchor).join(', ');
  const random = options.random ?? Math.random;
  const routine = [...(options.routine ?? defaultRoutine)];
  for (const [ms, action] of routine) {
    if (!routineActions.has(action) || !(ms >= 0)) throw new Error(`Peekaboo: invalid routine step [${ms}, '${action}'].`);
  }
  if (routine.at(-1)?.[1] !== 'sink') routine.push([450, 'sink']);
  const notify = options.notify ?? (message => console.info(message));
  const shortcut = options.shortcut ?? false;
  const powerShortcut = options.powerShortcut
    ?? (shortcut && !shortcut.shiftKey ? { ...shortcut, shiftKey: true } : false);
  const powerStorageKey = options.powerStorageKey ?? `${storageKey}-power`;
  // The grab area over the keepsake, before rotation: base on the edge, most of the figure's width.
  const markWidth = Math.round(width * 0.75);
  const markHeight = keepsake + 2;

  const frame = document.createElement('div');
  frame.className = 'peekaboo';
  frame.setAttribute('aria-hidden', 'true');
  frame.dataset.name = options.name;
  frame.dataset.character = options.character ?? options.name.toLowerCase().replace(/\W+/g, '-');
  frame.style.zIndex = String(options.zIndex ?? 10);
  const pose = document.createElement('div');
  pose.className = 'peekaboo-pose';
  pose.innerHTML = options.svg.trim();
  const figure = pose.querySelector('svg');
  if (!figure) throw new Error('Peekaboo: options.svg must contain an <svg> element.');
  figure.classList.add('peekaboo-figure');
  for (const element of [pose, figure]) Object.assign(element.style, { width: `${width}px`, height: `${height}px` });
  frame.append(pose);
  const mark = document.createElement('button');
  mark.type = 'button';
  mark.className = 'peekaboo-mark';
  mark.hidden = true;
  mark.style.zIndex = frame.style.zIndex;
  if (options.accent) mark.style.setProperty('--peekaboo-accent', options.accent);
  mark.setAttribute('aria-label', `Call ${options.name} back`);
  mark.title = `Pull ${options.name} back out`;
  document.body.append(frame, mark);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const timers = new Set<number>();
  const wait = (ms: number) => new Promise<void>(resolve => {
    const id = window.setTimeout(() => { timers.delete(id); resolve(); }, ms);
    timers.add(id);
  });
  let spot: Spot | null = null;
  let busy = false;
  let destroyed = false;
  let markTimer: number | undefined;
  // Bumped to cancel a visit in progress.
  let run = 0;
  let enabled = readChoice(storageKey, options.enabledByDefault ?? false);
  let powered = readChoice(powerStorageKey, options.poweredByDefault ?? true);
  frame.hidden = !powered;

  function readChoice(key: string, fallback: boolean) {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? fallback : saved === 'on';
    } catch {
      return fallback;
    }
  }

  function saveChoice(key: string, on: boolean) {
    try { localStorage.setItem(key, on ? 'on' : 'off'); } catch { /* private mode: keep the choice for this page only */ }
  }

  function pageBox(element: Element): Box {
    const rect = element.getBoundingClientRect();
    return { left: rect.left + window.scrollX, top: rect.top + window.scrollY, width: rect.width, height: rect.height };
  }

  // Absolute positions are relative to the containing block; usually the page itself.
  function origin() {
    const parent = frame.offsetParent;
    if (!parent || parent === document.body && getComputedStyle(document.body).position === 'static') return { left: 0, top: 0 };
    const box = pageBox(parent);
    return { left: box.left + parent.clientLeft - parent.scrollLeft, top: box.top + parent.clientTop - parent.scrollTop };
  }

  function place(element: HTMLElement, box: Box) {
    const at = origin();
    Object.assign(element.style, { left: `${box.left - at.left}px`, top: `${box.top - at.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  }

  function edgeOf(index: number) {
    const spec = options.edges[index];
    const anchor = spec && document.querySelector(spec.anchor);
    if (!anchor) return null;
    const box = pageBox(anchor);
    if (!box.width || !box.height) return null;
    const direction = spec.inward ? flipped[outward[spec.side]] : outward[spec.side];
    const coordinate = { top: box.top, bottom: box.top + box.height, left: box.left, right: box.left + box.width }[spec.side];
    const horizontal = spec.side === 'top' || spec.side === 'bottom';
    return { direction, coordinate, start: horizontal ? box.left : box.top, length: horizontal ? box.width : box.height };
  }

  function windowAt(direction: Direction, edge: number, at: number, rise: number): Clip {
    if (direction === 'up') return { direction, rise, left: at, top: edge - rise, width, height: rise };
    if (direction === 'down') return { direction, rise, left: at, top: edge, width, height: rise };
    if (direction === 'left') return { direction, rise, left: edge - rise, top: at, width: rise, height: width };
    return { direction, rise, left: edge, top: at, width: rise, height: width };
  }

  function overlaps(box: Box, other: Box, clearance: number) {
    return box.left < other.left + other.width + clearance && box.left + box.width > other.left - clearance
      && box.top < other.top + other.height + clearance && box.top + box.height > other.top - clearance;
  }

  function fits(box: Box) {
    const root = document.documentElement;
    if (box.left < 0 || box.top < 0 || box.left + box.width > root.scrollWidth) return false;
    return [...document.querySelectorAll(options.obstacles)].every(element => {
      if (element === mark || frame.contains(element)) return true;
      const other = pageBox(element);
      if (!other.width || !other.height) return true;
      return !overlaps(box, other, element.matches(touchable) ? 0 : gap);
    });
  }

  function inViewport(box: Box) {
    const root = document.documentElement;
    return box.left >= window.scrollX && box.top >= window.scrollY
      && box.left + box.width <= window.scrollX + root.clientWidth && box.top + box.height <= window.scrollY + root.clientHeight;
  }

  /** The tallest clipping window that fits at this spot; the feet stay behind the edge when there is less room. */
  function windowFor(target: Spot, visible: boolean): Clip | null {
    const edge = edgeOf(target.edge);
    if (!edge || target.along < 0 || target.along + width > edge.length) return null;
    for (let rise = height; rise >= minRise; rise -= 4) {
      const box = windowAt(edge.direction, edge.coordinate, edge.start + target.along, rise);
      if (fits(box) && (!visible || inViewport(box))) return box;
    }
    return null;
  }

  function randomSpot(): Spot | null {
    const options_ = options.edges.map((_, index) => {
      const edge = edgeOf(index);
      const spots: Spot[] = [];
      if (!edge || edge.length < width) return spots;
      for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = { edge: index, along: Math.round(random() * (edge.length - width)) };
        if (windowFor(candidate, true)) spots.push(candidate);
      }
      return spots;
    }).filter(spots => spots.length);
    if (!options_.length) return null;
    const spots = options_[Math.floor(random() * options_.length)];
    return spots[Math.floor(random() * spots.length)];
  }

  function placeFigure(box: Clip) {
    place(frame, box);
    frame.dataset.direction = box.direction;
    // Head at the far side of the window, feet toward the edge; rotating the pose keeps "down" pointing at the edge.
    const centers: Record<Direction, [number, number]> = {
      up: [width / 2, height / 2],
      down: [width / 2, box.height - height / 2],
      left: [height / 2, width / 2],
      right: [box.width - height / 2, width / 2],
    };
    const [x, y] = centers[box.direction];
    Object.assign(pose.style, { left: `${x - width / 2}px`, top: `${y - height / 2}px`, transform: `rotate(${turns[box.direction]}deg)` });
    // Sinking by rise - keepsake leaves only the top of the figure above the edge.
    figure!.style.setProperty('--peekaboo-sink', `${box.rise - keepsake}px`);
  }

  /** Leaves the keepsake above the edge with a grab area over it, or clears both when that spot no longer fits. */
  function placeMark() {
    const box = spot && keepsake > 0 ? windowFor(spot, false) : null;
    if (!box) {
      figure!.classList.remove('keepsake');
      mark.hidden = true;
      return;
    }
    placeFigure(box);
    figure!.classList.add('keepsake');
    const middleX = box.left + box.width / 2;
    const middleY = box.top + box.height / 2;
    const centers: Record<Direction, [number, number]> = {
      up: [middleX, box.top + box.height - markHeight / 2],
      down: [middleX, box.top + markHeight / 2],
      left: [box.left + box.width - markHeight / 2, middleY],
      right: [box.left + markHeight / 2, middleY],
    };
    const [x, y] = centers[box.direction];
    place(mark, { left: x - markWidth / 2, top: y - markHeight / 2, width: markWidth, height: markHeight });
    mark.style.transform = `rotate(${turns[box.direction]}deg)`;
    mark.hidden = false;
  }

  function forgetMark() {
    window.clearTimeout(markTimer);
    spot = null;
    figure!.classList.remove('keepsake');
    mark.hidden = true;
  }

  function act(action: RoutineAction) {
    // Blink and tilt last until the next step; the look direction stays until changed.
    figure!.classList.remove('blinking', 'tilting');
    const look = figure!.dataset.look;
    if (action === 'look') figure!.dataset.look = random() < 0.5 ? 'left' : 'right';
    else if (action === 'look-back') figure!.dataset.look = look === 'left' ? 'right' : look === 'right' ? 'left' : random() < 0.5 ? 'left' : 'right';
    else if (action === 'look-ahead') delete figure!.dataset.look;
    else if (action === 'blink') figure!.classList.add('blinking');
    else if (action === 'tilt') figure!.classList.add('tilting');
    else if (action === 'sink') {
      // Sinks straight to the keepsake position, or out of sight when there is no keepsake.
      delete figure!.dataset.look;
      figure!.classList.remove('peeking');
      if (keepsake > 0) figure!.classList.add('keepsake');
    }
  }

  async function visit(target: Spot) {
    const box = windowFor(target, false);
    if (busy || destroyed || !powered || !box) return false;
    busy = true;
    window.clearTimeout(markTimer);
    spot = target;
    mark.hidden = true;
    placeFigure(box);
    figure!.classList.remove('keepsake');
    figure!.classList.add('peeking');
    const current = ++run;
    for (const [ms, action] of routine) {
      await wait(ms);
      if (current !== run) return true;
      act(action);
    }
    // The grab area appears once the sink transition settles; the keepsake time counts from when it started sinking.
    const settle = 500;
    await wait(settle);
    if (current !== run) return true;
    busy = false;
    if (keepsake > 0) {
      placeMark();
      markTimer = window.setTimeout(forgetMark, Math.max(0, keepsakeMs - settle));
    } else {
      spot = null;
    }
    return true;
  }

  function hide() {
    run++;
    busy = false;
    delete figure!.dataset.look;
    figure!.classList.remove('blinking', 'tilting', 'peeking');
    forgetMark();
  }

  async function peekNow() {
    if (!powered) return false;
    const target = randomSpot();
    return target ? visit(target) : false;
  }

  function setEnabled(on: boolean) {
    enabled = on;
    saveChoice(storageKey, on);
    if (!on) {
      hide();
      return;
    }
    if (!powered) return;
    // Quiet when it works; speak up only when the user asked for the mascot and it cannot appear.
    if (!randomSpot()) notify(`${options.name} has no free spot on screen right now and will peek out when there is room.`);
    else void peekNow();
  }

  function toggle() {
    setEnabled(!enabled);
    return enabled;
  }

  function setPowered(on: boolean) {
    if (on === powered) return;
    powered = on;
    saveChoice(powerStorageKey, on);
    frame.hidden = !on;
    if (!on) {
      hide();
      // Otherwise the show/hide shortcut seems broken; say how to get the mascot back.
      notify(`${options.name} is turned off.${powerShortcut ? ` Press ${label(powerShortcut)} to turn it back on.` : ''}`);
      return;
    }
    if (enabled) setEnabled(true);
    else notify(`${options.name} is turned on.${shortcut ? ` Press ${label(shortcut)} to show it.` : ''}`);
  }

  function togglePower() {
    setPowered(!powered);
    return powered;
  }

  async function schedule() {
    while (!destroyed) {
      await wait(minWait + random() * (maxWait - minWait));
      if (destroyed) return;
      if (powered && enabled && !busy && !document.hidden && !reducedMotion.matches && !document.fullscreenElement) await peekNow();
    }
  }

  const onClick = async () => {
    if (!spot) return;
    const refocus = document.activeElement === mark;
    await visit(spot);
    if (refocus && !mark.hidden) mark.focus();
  };
  const onLayout = () => { if (!busy) placeMark(); };
  const matches = (event: KeyboardEvent, keys: Shortcut | false): keys is Shortcut => !!keys
    && event.code === keys.code && event.altKey === !!keys.altKey && event.ctrlKey === !!keys.ctrlKey
    && event.shiftKey === !!keys.shiftKey && event.metaKey === !!keys.metaKey;
  const onKey = (event: KeyboardEvent) => {
    if (event.isComposing || event.defaultPrevented) return;
    if (matches(event, powerShortcut)) {
      event.preventDefault();
      if (!event.repeat) togglePower();
    } else if (powered && matches(event, shortcut)) {
      event.preventDefault();
      if (!event.repeat) toggle();
    }
  };
  mark.addEventListener('click', onClick);
  window.addEventListener('resize', onLayout);
  document.addEventListener('keydown', onKey);
  const observer = new ResizeObserver(onLayout);
  for (const edge of options.edges) {
    const anchor = document.querySelector(edge.anchor);
    if (anchor) observer.observe(anchor);
  }
  void schedule();

  return {
    get enabled() { return enabled; },
    toggle,
    setEnabled,
    get powered() { return powered; },
    togglePower,
    setPowered,
    peekNow,
    hide,
    destroy() {
      destroyed = true;
      hide();
      for (const id of timers) window.clearTimeout(id);
      observer.disconnect();
      window.removeEventListener('resize', onLayout);
      document.removeEventListener('keydown', onKey);
      frame.remove();
      mark.remove();
    },
  };
}
