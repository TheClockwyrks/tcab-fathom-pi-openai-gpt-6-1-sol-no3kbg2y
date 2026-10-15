import * as C from "./constants";
import type { Body, Dir, FathomState, Predator, Screen, View } from "./types";
export const dirs: Dir[] = ["up", "right", "down", "left"];
export const delta: Record<Dir, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};
export const opposite = (d: Dir): Dir => dirs[(dirs.indexOf(d) + 2) % 4];
export const center = (tx: number, ty: number) => ({
  x: C.GRID_ORIGIN_X + tx * C.TILE + C.TILE / 2,
  y: C.GRID_ORIGIN_Y + ty * C.TILE + C.TILE / 2,
  tx,
  ty,
});
export function locate(b: Body): void {
  b.tx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  b.ty = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
}
export const layer = (c: string) =>
  Array.from({ length: C.GRID_ROWS }, () => c.repeat(C.GRID_COLS));
export function put(rows: string[], x: number, y: number, c: string): void {
  rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1);
}
export function maze(): string[] {
  const a = layer("#");
  for (let y = 1; y < C.GRID_ROWS - 1; y++)
    for (const x of [1, 5, 9, 14, 21, 26, 30, 34]) put(a, x, y, ".");
  for (const y of [1, 5, 11, 16])
    for (let x = 1; x < C.GRID_COLS - 1; x++) put(a, x, y, ".");
  for (let x = 1; x <= 14; x++) {
    put(a, x, 8, ".");
    put(a, C.GRID_COLS - 1 - x, 8, ".");
  }
  put(a, 0, 11, ".");
  put(a, C.GRID_COLS - 1, 11, ".");
  for (let y = 7; y <= 9; y++) for (let x = 16; x <= 19; x++) put(a, x, y, "d");
  put(a, 17, 6, "g");
  return a;
}
export function clone(s: View): FathomState {
  return {
    ...s,
    grid: { ...s.grid },
    sonar: { ...s.sonar },
    ink: { ...s.ink },
    tiles: [...s.tiles],
    plankton: [...s.plankton],
    visibility: [...s.visibility],
    forager: { ...s.forager },
    drifters: s.drifters.map((p) => ({ ...p })),
    predators: s.predators.map((p) => ({
      ...p,
      fix: p.fix ? [...p.fix] : null,
    })),
    pulses: s.pulses.map((p) => ({ ...p })),
    inkClouds: s.inkClouds.map((p) => ({ ...p })),
    start: [...s.start],
    pointerDown: { ...s.pointerDown },
    art: s.art as Record<string, ImageBitmap[]>,
  };
}
export function hunter(kind: C.PredatorKind, tx: number, ty: number): Predator {
  return {
    ...center(tx, ty),
    dir: "up",
    kind,
    state: "wander",
    released: true,
    mind: true,
    travel: true,
    lit: false,
    speed: 0,
    alert: false,
    detectRange: null,
    hearingRange: null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertLeft: 0,
    mark: 0,
    pingIn: C.GLOAMFIN_PING_INTERVAL,
    pingAgo: C.GLOAMFIN_PING_MIN_GAP,
    searchAge: 0,
    searchPing: false,
    chaseSpeed: C.GLOAMFIN_CHASE_SPEED,
    flareIn: C.FLARE_INTERVAL,
    flareAge: -1,
    fade: 0,
    releaseAt: null,
  };
}
export function roster(depth: number, tiles: readonly string[]): Predator[] {
  const kinds = [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(depth, C.ROSTER_CAP_DEPTH) - 1),
  ];
  const cells: [number, number][] = [];
  tiles.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === "d") cells.push([x, y]);
    }),
  );
  return kinds.map((k, i) => {
    const p = hunter(k, ...(cells[i % cells.length] ?? [17, 8]));
    p.state = "den";
    p.released = false;
    p.releaseAt = i * C.DEN_RELEASE_GAP;
    return p;
  });
}
export function reconcile(s: FathomState): FathomState {
  locate(s.forager);
  s.drifters.forEach(locate);
  s.predators.forEach((p) => {
    locate(p);
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
    p.speed =
      p.kind === "lanternjaw" && p.state === "wander"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
  });
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(
    C.SONAR_RANGE_MIN,
    C.SONAR_RANGE_BASE - (s.depth - 1),
  );
  s.sonar.ready = s.sonar.cooldown === 0;
  s.ink.ready = s.ink.cooldown === 0;
  s.planktonRemaining = s.plankton.reduce(
    (n, row) => n + [...row].filter((c) => c === "*").length,
    0,
  );
  return s;
}
export function fresh(art: Record<string, ImageBitmap[]> = {}): FathomState {
  const tiles = maze();
  return reconcile({
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted: false,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: 0,
    windowRadius: 0,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles,
    plankton: tiles.map((r) => r.replace(/[^.]/g, "-").replace(/\./g, "*")),
    visibility: layer("u"),
    forager: { ...center(17, 16), dir: "left", moving: false },
    drifters: [],
    predators: roster(1, tiles),
    pulses: [],
    inkClouds: [],
    simTime: 0,
    remainder: 0,
    screenAge: 0,
    playAge: 0,
    desired: "left",
    seed: 731,
    start: [17, 16],
    pointerDown: {},
    pendingSonar: false,
    pendingInk: false,
    art,
  });
}
export function arrive(s: FathomState, screen: Screen): FathomState {
  if (screen === "playing" && s.screen !== "paused" && s.screen !== "playing")
    s.playAge = 0;
  s.screen = screen;
  s.screenAge = 0;
  s.menuIndex =
    screen === "title"
      ? s.titleIndex
      : screen === "paused" || screen === "gameover"
        ? 0
        : null;
  s.pendingSonar = false;
  s.pendingInk = false;
  return s;
}
export function restart(s: FathomState, screen: Screen): FathomState {
  const n = fresh(s.art);
  n.titleIndex = s.titleIndex;
  n.muted = s.muted;
  n.simTime = s.simTime;
  n.remainder = s.remainder;
  return arrive(n, screen);
}
export function attempt(s: FathomState): FathomState {
  s.forager = { ...center(...s.start), dir: "left", moving: false };
  s.desired = "left";
  s.brightness = 0;
  s.brightHold = 0;
  s.predators = roster(s.depth, s.tiles);
  s.drifters = [];
  s.drifterIn = C.DRIFTER_INTERVAL;
  s.pulses = [];
  s.inkClouds = [];
  s.sonar.cooldown = 0;
  s.ink.cooldown = 0;
  s.playAge = 0;
  return arrive(reconcile(s), "countdown");
}
export function tile(s: View, x: number, y: number): string {
  return s.tiles[y]?.[x] ?? "#";
}
export const wrapRow = (s: View) =>
  s.tiles.findIndex((r) => r[0] === "." && r[C.GRID_COLS - 1] === ".");
export function neighbor(
  s: View,
  x: number,
  y: number,
  d: Dir,
): [number, number] {
  const [dx, dy] = delta[d];
  let nx = x + dx;
  if (y === wrapRow(s)) nx = (nx + C.GRID_COLS) % C.GRID_COLS;
  return [nx, y + dy];
}
export function open(s: View, x: number, y: number, pred = false): boolean {
  const t = tile(s, x, y);
  return t === "." || (pred && (t === "d" || t === "g"));
}
export function options(s: View, b: Body, pred = false): Dir[] {
  return dirs.filter((d) => open(s, ...neighbor(s, b.tx, b.ty, d), pred));
}
export function distances(
  s: View,
  x: number,
  y: number,
  pred = false,
): Map<string, number> {
  const m = new Map<string, number>();
  if (!open(s, x, y, pred)) return m;
  const q: [[number, number], number][] = [[[x, y], 0]];
  m.set(`${x},${y}`, 0);
  for (let i = 0; i < q.length; i++) {
    const [[tx, ty], n] = q[i];
    for (const d of dirs) {
      const [nx, ny] = neighbor(s, tx, ty, d),
        k = `${nx},${ny}`;
      if (open(s, nx, ny, pred) && !m.has(k)) {
        m.set(k, n + 1);
        q.push([[nx, ny], n + 1]);
      }
    }
  }
  return m;
}
export function random(s: FathomState): number {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function wander(s: FathomState, b: Body, pred = false): Dir {
  const all = options(s, b, pred),
    o = all.filter((d) => d !== opposite(b.dir));
  const a = o.length ? o : all;
  return a[Math.floor(random(s) * a.length)] ?? b.dir;
}
export function route(
  s: View,
  b: Body,
  fix: readonly number[],
  pred = false,
): Dir | null {
  const m = distances(s, fix[0], fix[1], pred);
  let best = Infinity,
    dir: Dir | null = null;
  for (const d of options(s, b, pred)) {
    const n = m.get(neighbor(s, b.tx, b.ty, d).join(",")) ?? Infinity;
    if (n < best) {
      best = n;
      dir = d;
    }
  }
  return dir;
}
export function atCenter(b: Body): boolean {
  const c = center(b.tx, b.ty);
  return Math.abs(b.x - c.x) < 1e-6 && Math.abs(b.y - c.y) < 1e-6;
}
/** Integrate only as far as the next center, then decide again. Wrap preserves overshoot. */
export function move(
  s: FathomState,
  b: Body,
  speed: number | (() => number),
  choose: () => Dir | null,
  pred = false,
): boolean {
  if (!open(s, b.tx, b.ty, pred)) return false;
  let left = C.TICK_DT;
  let moved = false;
  while (left > 1e-10) {
    if (atCenter(b)) {
      const d = choose();
      if (d === null || !open(s, ...neighbor(s, b.tx, b.ty, d), pred)) break;
      b.dir = d;
    }
    const [dx, dy] = delta[b.dir],
      c = center(b.tx, b.ty);
    const along = dx ? b.x - c.x : b.y - c.y,
      sign = dx || dy;
    // A fixture can close the next tile while a body is between centers.
    if (along * sign >= 0 && !open(s, ...neighbor(s, b.tx, b.ty, b.dir), pred))
      break;
    let distance = along * sign < -1e-7 ? -along * sign : C.TILE - along * sign;
    if (atCenter(b)) distance = C.TILE;
    const rate = typeof speed === "number" ? speed : speed();
    const n = Math.min(left * rate, distance);
    b.x += dx * n;
    b.y += dy * n;
    const width = C.GRID_COLS * C.TILE;
    if (b.x < C.GRID_ORIGIN_X) b.x += width;
    if (b.x >= C.GRID_ORIGIN_X + width) b.x -= width;
    locate(b);
    left -= n / rate;
    moved = true;
    if (distance - n < 1e-6) {
      const p = center(b.tx, b.ty);
      b.x = p.x;
      b.y = p.y;
    }
  }
  return moved;
}
export function distance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
/** Grid DDA: test every cell the segment crosses, allowing only the landing rock. */
export function los(
  s: View,
  a: { x: number; y: number },
  b: { x: number; y: number },
  landingRock = false,
): boolean {
  let x = Math.floor((a.x - C.GRID_ORIGIN_X) / C.TILE);
  let y = Math.floor((a.y - C.GRID_ORIGIN_Y) / C.TILE);
  const bx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  const by = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const sx = Math.sign(dx),
    sy = Math.sign(dy);
  const stepX = dx ? C.TILE / Math.abs(dx) : Infinity;
  const stepY = dy ? C.TILE / Math.abs(dy) : Infinity;
  let nextX = dx
    ? (C.GRID_ORIGIN_X + (x + (sx > 0 ? 1 : 0)) * C.TILE - a.x) / dx
    : Infinity;
  let nextY = dy
    ? (C.GRID_ORIGIN_Y + (y + (sy > 0 ? 1 : 0)) * C.TILE - a.y) / dy
    : Infinity;
  for (;;) {
    if (tile(s, x, y) === "#" && !(landingRock && x === bx && y === by))
      return false;
    if (x === bx && y === by) return true;
    const crossX = nextX <= nextY,
      crossY = nextY <= nextX;
    if (crossX) {
      x += sx;
      nextX += stepX;
    }
    if (crossY) {
      y += sy;
      nextY += stepY;
    }
  }
}
export function segmentDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
  p: { x: number; y: number },
): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    den = dx * dx + dy * dy;
  const t = den
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / den))
    : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function lighting(s: FathomState, sonarTiles = new Set<string>()): void {
  const blooms = s.predators.filter((p) => p.flaring && p.state !== "den");
  const lit = (b: { x: number; y: number }) =>
    (distance(s.forager, b) <= s.visionRadius && los(s, s.forager, b, true)) ||
    blooms.some((p) => distance(p, b) <= C.FLARE_RADIUS);
  s.visibility = s.visibility.map((row, y) =>
    [...row]
      .map((v, x) =>
        lit(center(x, y)) || sonarTiles.has(`${x},${y}`)
          ? "l"
          : v === "u"
            ? "u"
            : "r",
      )
      .join(""),
  );
  s.predators.forEach((p) => {
    p.lit =
      p.state !== "den" &&
      (lit(p) || p.alert || (p.kind !== "lanternjaw" && p.mark > 0));
  });
  s.drifters.forEach((p) => {
    p.lit = lit(p);
  });
}
