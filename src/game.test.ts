import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  ConstantClock,
  SequenceClock,
  createEngine,
} from "@clockwyrks/simple-2d";
import type { Engine, Clock } from "@clockwyrks/simple-2d";
import { game, BACKGROUND } from "./game";
import type { FathomState, FathomDebugApi, View } from "./game";
import * as C from "./constants";
import {
  atCenter,
  center,
  distances,
  maze,
  neighbor,
  options,
  tile,
} from "./world";
let engine: Engine<FathomState, FathomDebugApi>;
let events: EventTarget;
const cues: string[] = [];
const pictures = new Map<
  string,
  Promise<ReturnType<typeof loadImage> extends Promise<infer T> ? T : never>
>();
async function setup(clock: Clock = new ConstantClock(1000 / C.TICK_HZ)) {
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  events = new EventTarget();
  const e = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    game,
    width: C.STAGE_W,
    height: C.STAGE_H,
    background: BACKGROUND,
    layout: C.LAYOUT,
    clock,
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  e.events.on("cue:played", (v) => cues.push(v.cue));
  await e.initialize();
  return e;
}
function key(code: string, type = "keydown") {
  events.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
}
async function press(code: string) {
  key(code);
  await engine.advance(1);
  key(code, "keyup");
}
function apply(fn: (s: View) => FathomState) {
  engine.apply(fn);
}
function fixture() {
  const rows = Array.from({ length: C.GRID_ROWS }, () =>
    "#".repeat(C.GRID_COLS),
  );
  for (let y = 1; y < 17; y++) rows[y] = "#" + ".".repeat(34) + "#";
  return rows;
}
function posePlay(x = 10, y = 10) {
  const d = engine.debug;
  apply((s) => d.setMaze(s, fixture()));
  apply((s) => d.clearPlankton(s));
  apply((s) => d.clearPredators(s));
  apply((s) => d.setForagerTile(s, x, y));
  apply((s) => d.setScreen(s, "playing"));
}
function add(kind: C.PredatorKind, x: number, y: number) {
  apply((s) => engine.debug.addPredator(s, kind, x, y));
  apply((s) =>
    engine.debug.setPredatorTravel(s, s.predators.length - 1, false),
  );
}
beforeEach(async () => {
  cues.length = 0;
  // Keep the engine's real loader and asset registrations; decode its requested
  // local path with the Node canvas rather than a browser bitmap decoder.
  vi.stubGlobal("fetch", async (url: string) => new Response(url));
  vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
    const key = await blob.text();
    if (!pictures.has(key)) pictures.set(key, loadImage(key));
    return pictures.get(key)!;
  });
  engine = await setup();
});
afterEach(() => {
  engine.destroy();
  vi.unstubAllGlobals();
});
describe("contract and maze", () => {
  it("starts with a complete serializable snapshot and clean title state", () => {
    const s = engine.debug.snapshot(engine.state);
    expect(s.screen).toBe("title");
    expect(s.lives).toBe(C.START_LIVES);
    expect(s.predators.map((p) => p.kind)).toEqual(C.DEN_ORDER);
    expect(s.predators.every((p) => !p.released && p.state === "den")).toBe(
      true,
    );
    expect(s.visibility.every((r) => /^u+$/.test(r))).toBe(true);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(s).not.toHaveProperty("art");
  });
  it("lays a symmetric, connected one-cell maze with a reachable enclosed den", () => {
    const s = engine.state;
    let count = 0,
      total = 0;
    const runs: number[] = [];
    const visited = new Set<string>();
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const t = tile(s, x, y),
          mirror = tile(s, C.GRID_COLS - 1 - x, y);
        if (!"dg".includes(t) && !"dg".includes(mirror)) expect(t).toBe(mirror);
        if (t === "d")
          expect(options(s, { ...center(x, y), dir: "up" }).length).toBe(0);
        if (t !== ".") continue;
        count++;
        const o = options(s, { ...center(x, y), dir: "up" });
        expect(o.length).toBeGreaterThanOrEqual(2);
        total += o.length;
        expect(
          [tile(s, x + 1, y), tile(s, x, y + 1), tile(s, x + 1, y + 1)].every(
            (c) => c === ".",
          ),
        ).toBe(false);
        if (o.length === 2 && !visited.has(`${x},${y}`)) {
          const q: [[number, number]] = [[x, y]];
          visited.add(`${x},${y}`);
          for (let i = 0; i < q.length; i++)
            for (const d of options(s, { ...center(...q[i]), dir: "up" })) {
              const n = neighbor(s, ...q[i], d),
                k = n.join(",");
              if (
                !visited.has(k) &&
                options(s, { ...center(...n), dir: "up" }).length === 2
              ) {
                visited.add(k);
                q.push(n);
              }
            }
          runs.push(q.length);
        }
      }
    expect(distances(s, ...s.start).size).toBe(count);
    expect(total / count).toBeGreaterThanOrEqual(C.MAZE_OPENNESS_MIN);
    expect(total / count).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(mean).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
    expect(count / 544).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    expect(distances(s, ...s.start, true).has("16,8")).toBe(true);
  });
  it("poses immutably, validates domains, reconciles without ticking", () => {
    const old = engine.state;
    apply((s) => engine.debug.setBrightness(s, 1));
    expect(old.brightness).toBe(0);
    expect(engine.state.windowRadius).toBe(
      C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN,
    );
    apply((s) => engine.debug.clearFog(s));
    const before = engine.debug.snapshot(engine.state);
    apply((s) => engine.debug.reconcile(s));
    expect(engine.debug.snapshot(engine.state)).toEqual(before);
    expect(() => engine.debug.setBrightness(engine.state, 2)).toThrow();
    expect(() => engine.debug.setMaze(engine.state, ["bad"])).toThrow();
    expect(() =>
      engine.debug.setPredatorMind(engine.state, 10, false),
    ).toThrow();
    expect(() => engine.debug.setScore(engine.state, -1)).toThrow();
    expect(() => engine.debug.setForagerTile(engine.state, 0, 0)).toThrow();
  });
  it("builds the depth roster and range without changing its maze", () => {
    for (let depth = 1; depth <= 7; depth++) {
      apply((s) => engine.debug.setDepth(s, depth));
      expect(engine.state.predators.length).toBe(Math.min(6, depth + 2));
      expect(engine.state.sonar.range).toBe(
        Math.max(C.SONAR_RANGE_MIN, C.SONAR_RANGE_BASE - depth + 1),
      );
      expect(engine.state.tiles).toEqual(maze());
    }
  });
  it("reset restores a pristine title, preserving only the sound preference", async () => {
    await press("KeyM");
    apply((s) => engine.debug.setDepth(s, 4));
    apply((s) => engine.debug.setScore(s, 500));
    apply((s) => engine.debug.reset(s));
    expect(engine.state.muted).toBe(true);
    expect(engine.state.simTime).toBe(0);
    expect(engine.state.predators.length).toBe(3);
    expect(engine.state.score).toBe(0);
  });
});
describe("debug scalar poses", () => {
  it("applies facing, timers and independent creature switches without incidental effects", () => {
    posePlay();
    const d = engine.debug;
    apply((s) => d.setForagerDir(s, "right"));
    apply((s) => d.setSonarCooldown(s, 42));
    apply((s) => d.setInkCooldown(s, 19));
    expect(engine.state.sonar.cooldown).toBe(42);
    expect(engine.state.sonar.ready).toBe(false);
    expect(engine.state.ink.cooldown).toBe(19);
    expect(engine.state.ink.ready).toBe(false);
    add("lanternjaw", 14, 10);
    apply((s) => d.setPredatorDir(s, 0, "left"));
    apply((s) => d.setPredatorReleased(s, 0, false));
    apply((s) => d.spawnDrifter(s, 10, 12));
    apply((s) => d.setDrifterMind(s, 0, false));
    apply((s) => d.setDrifterTravel(s, 0, false));
    expect(engine.state.predators[0].dir).toBe("left");
    expect(engine.state.predators[0].released).toBe(false);
    expect(engine.state.drifters[0].mind).toBe(false);
    expect(engine.state.drifters[0].travel).toBe(false);
    const snapshot = d.snapshot(engine.state);
    expect(snapshot.forager.dir).toBe("right");
    expect(snapshot.drifters).toHaveLength(1);
    apply((s) => d.clearDrifters(s));
    expect(engine.state.drifters).toHaveLength(0);
    apply((s) => d.setTitleIndex(s, 1));
    expect(engine.state.titleIndex).toBe(1);
    expect(d.menuItemRect(engine.state, 0)).toBe(null);
    expect(() => d.setMenuIndex(engine.state, 0)).toThrow();
    expect(() => d.setTitleIndex(engine.state, 2)).toThrow();
  });
});
describe("screens and actions", () => {
  it("remembers title choice, wraps menus, and returns from how-to", async () => {
    await press("ArrowUp");
    expect(engine.state.menuIndex).toBe(1);
    await press("Enter");
    expect(engine.state.screen).toBe("howto");
    await press("Escape");
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
  });
  it("holds a dive countdown, pauses exactly once per Escape, and freezes simulation systems", async () => {
    await press("Enter");
    expect(engine.state.screen).toBe("countdown");
    await engine.advance(239);
    expect(engine.state.screen).toBe("playing");
    await press("Escape");
    expect(engine.state.screen).toBe("paused");
    const old = engine.debug.snapshot(engine.state);
    await engine.advance(120);
    const now = engine.debug.snapshot(engine.state);
    expect(now.forager).toEqual(old.forager);
    expect(now.brightness).toBe(old.brightness);
    expect(now.simTime).toBeGreaterThan(old.simTime);
    await press("Escape");
    expect(engine.state.screen).toBe("playing");
  });
  it("supports pointer regions and confirms only matching press/release regions", async () => {
    const pointer = (type: string, x: number, y: number) =>
      events.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: type === "pointerdown" ? 1 : 0,
        }),
      );
    const r = engine.debug.menuItemRect(engine.state, 1)!;
    pointer("pointermove", r.x + 20, r.y + 20);
    await engine.advance(1);
    expect(engine.state.menuIndex).toBe(1);
    pointer("pointerdown", r.x + 20, r.y + 20);
    pointer("pointerup", 0, 0);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    pointer("pointerdown", r.x + 20, r.y + 20);
    pointer("pointerup", r.x + 20, r.y + 20);
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
    pointer("pointerdown", 100, 100);
    pointer("pointerup", 100, 100);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
  });
  it("resumes, restarts and quits from pause and game over", async () => {
    posePlay();
    await press("KeyP");
    await press("Enter");
    expect(engine.state.screen).toBe("playing");
    await press("KeyP");
    await press("ArrowDown");
    await press("Enter");
    expect(engine.state.screen).toBe("countdown");
    apply((s) => engine.debug.setScreen(s, "paused"));
    apply((s) => engine.debug.setMenuIndex(s, 2));
    await press("Enter");
    expect(engine.state.screen).toBe("title");
    apply((s) => engine.debug.setScreen(s, "gameover"));
    await press("Enter");
    expect(engine.state.screen).toBe("countdown");
  });
  it("exposes live diagnostics with no state changes", () => {
    const old = engine.debug.snapshot(engine.state);
    expect(engine.diagnostics().every((v) => v.error === undefined)).toBe(true);
    expect(engine.diagnostics().some((v) => v.name === "R")).toBe(true);
    expect(engine.debug.snapshot(engine.state)).toEqual(old);
  });
});
describe("movement and progression", () => {
  it("swims at the fixed speed and stops when the held action is released", async () => {
    posePlay();
    const x = engine.state.forager.x;
    key("ArrowRight");
    await engine.advance(120);
    key("ArrowRight", "keyup");
    expect(engine.state.forager.x - x).toBeCloseTo(C.FORAGER_SPEED);
    await engine.advance(12);
    expect(engine.state.forager.moving).toBe(false);
    expect(engine.state.forager.x - x).toBeCloseTo(C.FORAGER_SPEED);
  });
  it("buffers perpendicular turns at centers and reverses between them", async () => {
    posePlay();
    key("ArrowRight");
    await engine.advance(10);
    key("ArrowDown");
    await engine.advance(1);
    key("ArrowDown", "keyup"); // Keep the older right key held: the turn stays buffered.
    await engine.advance(20);
    expect(engine.state.forager.dir).toBe("down");
    expect(atCenter({ ...engine.state.forager, y: center(11, 10).y })).toBe(
      true,
    );
    key("ArrowRight", "keyup");
    key("ArrowDown", "keyup");
    key("ArrowUp");
    const y = engine.state.forager.y;
    await engine.advance(1);
    expect(engine.state.forager.y).toBeLessThan(y);
  });
  it("crosses the tunnel continuously at ordinary speed", async () => {
    apply((s) => engine.debug.clearPredators(s));
    apply((s) => engine.debug.clearPlankton(s));
    apply((s) => engine.debug.setForagerTile(s, 0, 11));
    apply((s) => engine.debug.setScreen(s, "playing"));
    key("ArrowLeft");
    await engine.advance(30);
    expect(engine.state.forager.tx).toBe(35);
    expect(engine.state.forager.x).toBeCloseTo(center(35, 11).x);
    expect(engine.state.forager.y).toBe(center(35, 11).y);
  });
  it("does not move a body left on rock by a posed maze", async () => {
    posePlay();
    apply((s) =>
      engine.debug.setMaze(
        s,
        Array.from({ length: 18 }, () => "#".repeat(36)),
      ),
    );
    const p = { ...engine.state.forager };
    key("ArrowRight");
    await engine.advance(120);
    expect(engine.state.forager.x).toBe(p.x);
  });
  it("eats the final mote, scores exactly and descends to a fresh maze", async () => {
    posePlay();
    apply((s) => engine.debug.setPlankton(s, 10, 10, true));
    await engine.advance(1);
    expect(engine.state.score).toBe(C.SCORE_PLANKTON + C.SCORE_CLEAR);
    expect(engine.state.screen).toBe("cleared");
    expect(cues).toContain(C.CUES.descend);
    await engine.advance(240);
    expect(engine.state.depth).toBe(2);
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.tiles).toEqual(maze());
  });
  it("empty debug plankton is not a clear and bonus drifters score without brightness", async () => {
    posePlay();
    apply((s) => engine.debug.spawnDrifter(s, 10, 10));
    apply((s) => engine.debug.setDrifterMind(s, 0, false));
    await engine.advance(1);
    expect(engine.state.score).toBe(C.SCORE_DRIFTER);
    expect(engine.state.brightness).toBe(0);
    expect(engine.state.screen).toBe("playing");
  });
  it("reserves three lives and ends only on the fourth catch", async () => {
    for (let i = 0; i <= C.START_LIVES; i++) {
      posePlay();
      add("lanternjaw", 10, 10);
      apply((s) => engine.debug.setPredatorMind(s, 0, false));
      await engine.advance(1);
      expect(cues).toContain(C.CUES.caught);
      expect(engine.state.screen).toBe(
        i === C.START_LIVES ? "gameover" : "countdown",
      );
    }
    expect(engine.state.lives).toBe(0);
  });
  it("is invariant to frame partition and carries fractional ticks", async () => {
    posePlay();
    apply((s) => engine.debug.setBrightness(s, 1));
    await engine.advance(120);
    const a = engine.debug.snapshot(engine.state);
    engine.destroy();
    engine = await setup(new SequenceClock([3, 7, 15, 25]));
    posePlay();
    apply((s) => engine.debug.setBrightness(s, 1));
    await engine.advance(80);
    const b = engine.debug.snapshot(engine.state);
    expect(b).toEqual(a);
  });
});
describe("light, sonar and ink", () => {
  it("holds brightness, then decays by the prescribed half-life", async () => {
    posePlay();
    apply((s) => engine.debug.setBrightness(s, 1));
    apply((s) => engine.debug.setBrightHold(s, C.BRIGHT_HOLD));
    await engine.advance(120);
    expect(engine.state.brightness).toBeCloseTo(1);
    await engine.advance(108);
    expect(engine.state.brightness).toBeCloseTo(0.5);
    expect(engine.state.windowRadius).toBeCloseTo(
      C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * 0.5,
    );
  });
  it("remembers lit tiles without letting the outer window reveal them", async () => {
    posePlay();
    apply((s) => engine.debug.clearFog(s));
    await engine.advance(1);
    expect(engine.state.visibility[10][10]).toBe("l");
    expect(engine.state.visibility[10][15]).toBe("u");
    apply((s) => engine.debug.setForagerTile(s, 25, 10));
    await engine.advance(1);
    expect(engine.state.visibility[10][10]).toBe("r");
  });
  it("lights rock faces but not the ground behind them", async () => {
    posePlay();
    const rows = fixture();
    rows[10] = rows[10].slice(0, 11) + "#" + rows[10].slice(12);
    apply((s) => engine.debug.setMaze(s, rows));
    apply((s) => engine.debug.clearFog(s));
    await engine.advance(1);
    expect(engine.state.visibility[10][11]).toBe("l");
    expect(engine.state.visibility[10][12]).toBe("u");
  });
  it("sonar takes time to reach a hunter and never marks amber bodies", async () => {
    posePlay();
    add("gloamfin", 16, 10);
    add("lanternjaw", 16, 11);
    apply((s) => engine.debug.setPredatorMind(s, 0, false));
    apply((s) => engine.debug.setPredatorMind(s, 1, false));
    await press("Space");
    expect(engine.state.predators[0].lit).toBe(false);
    await engine.advance(52);
    expect(engine.state.predators[0].lit).toBe(true);
    expect(engine.state.predators[1].lit).toBe(false);
    expect(engine.state.sonar.cooldown).toBeGreaterThan(0);
    expect(cues).toContain(C.CUES.sonar);
  });
  it("casts cooldown-limited ink with a fixed center and lifetime", async () => {
    posePlay();
    await press("ShiftLeft");
    expect(engine.state.inkClouds[0].radius).toBe(C.INK_RADIUS);
    const c = { ...engine.state.inkClouds[0] };
    key("ArrowRight");
    await engine.advance(60);
    key("ArrowRight", "keyup");
    expect(engine.state.inkClouds[0].x).toBe(c.x);
    await press("ShiftLeft");
    expect(engine.state.inkClouds).toHaveLength(1);
    await engine.advance(360);
    expect(engine.state.inkClouds).toHaveLength(0);
  });
});
describe("hunters and the den", () => {
  it("routes a chase around rock rather than through it", async () => {
    posePlay(13, 10);
    const rows = fixture();
    rows[10] = rows[10].slice(0, 11) + "#" + rows[10].slice(12);
    apply((s) => engine.debug.setMaze(s, rows));
    add("lanternjaw", 9, 10);
    apply((s) => engine.debug.setPredatorState(s, 0, "chase"));
    apply((s) => engine.debug.setPredatorTravel(s, 0, true));
    await engine.advance(30);
    expect(engine.state.predators[0].dir).toBe("up");
    expect(engine.state.predators[0].x).toBe(center(9, 10).x);
    expect(engine.state.predators[0].y).toBeLessThan(center(9, 10).y);
    for (let i = 0; i < 70; i++) {
      await engine.advance(1);
      const p = engine.state.predators[0];
      expect(tile(engine.state, p.tx, p.ty)).toBe(".");
    }
  });
  it("charges the Gloamfin's corner penalty on the turn, then ramps", async () => {
    posePlay();
    add("gloamfin", 5, 10);
    apply((s) => engine.debug.setPredatorState(s, 0, "chase"));
    apply((s) => engine.debug.setPredatorTravel(s, 0, true));
    await engine.advance(1);
    expect(engine.state.predators[0].speed).toBe(C.GLOAMFIN_CORNER_SPEED);
    expect(engine.state.predators[0].x - center(5, 10).x).toBeCloseTo(
      C.GLOAMFIN_CORNER_SPEED * C.TICK_DT,
    );
    await engine.advance(120);
    expect(engine.state.predators[0].speed).toBeCloseTo(
      (C.GLOAMFIN_CHASE_SPEED + C.GLOAMFIN_CORNER_SPEED) / 2,
    );
  });
  it("locks through rock during a bloom and puts the light out at once", async () => {
    posePlay();
    add("flarefish", 15, 10);
    const rows = fixture();
    rows[10] = rows[10].slice(0, 12) + "#" + rows[10].slice(13);
    apply((s) => engine.debug.setMaze(s, rows));
    await engine.advance(903);
    expect(engine.state.predators[0].state).toBe("chase");
    expect(engine.state.predators[0].alert).toBe(true);
    expect(engine.state.predators[0].flaring).toBe(false);
  });
  it("an ordinary enemy ping reveals nothing but hears on arrival", async () => {
    posePlay();
    add("gloamfin", 16, 10);
    await engine.advance(481);
    expect(engine.state.pulses.some((p) => p.tint === "violet")).toBe(true);
    expect(engine.state.predators[0].state).toBe("wander");
    expect(engine.state.visibility[10][16]).toBe("u");
    await engine.advance(52);
    expect(engine.state.predators[0].state).toBe("chase");
    expect(engine.state.predators[0].alert).toBe(true);
    expect(engine.state.visibility[10][16]).toBe("u");
  });
  it("releases on live time, with the body still swimming through the den", async () => {
    apply((s) => engine.debug.setScreen(s, "playing"));
    await engine.advance(1);
    expect(engine.state.predators[0].released).toBe(true);
    expect(engine.state.predators[0].state).toBe("den");
    expect(engine.state.predators[1].released).toBe(false);
    await engine.advance(600);
    expect(engine.state.predators[1].released).toBe(true);
    expect(engine.state.predators[2].released).toBe(false);
  });
  it("Lanternjaw follows light, lingers on a lost fix, and drops it immediately in ink", async () => {
    posePlay();
    add("lanternjaw", 13, 10);
    await engine.advance(1);
    expect(engine.state.predators[0].state).toBe("chase");
    expect(engine.state.predators[0].alert).toBe(false);
    apply((s) => engine.debug.setForagerTile(s, 25, 10));
    await engine.advance(120);
    expect(engine.state.predators[0].state).toBe("chase");
    await engine.advance(121);
    expect(engine.state.predators[0].state).toBe("wander");
    apply((s) => engine.debug.setForagerTile(s, 10, 10));
    await engine.advance(1);
    await press("ShiftLeft");
    expect(engine.state.predators[0].state).toBe("wander");
  });
  it("Gloamfin hears through walls and ink, with an alert and opening chase cap", async () => {
    posePlay();
    add("gloamfin", 12, 10);
    await press("ShiftLeft");
    expect(engine.state.predators[0].hearingLock).toBe(true);
    expect(engine.state.predators[0].alert).toBe(true);
    expect(engine.state.predators[0].speed).toBe(C.GLOAMFIN_CHASE_SPEED);
    expect(engine.state.predators[0].state).toBe("chase");
  });
  it("a forager pulse gives a distant Gloamfin a fixed sound target on arrival", async () => {
    posePlay();
    add("gloamfin", 16, 10);
    await press("Space");
    expect(engine.state.predators[0].state).toBe("wander");
    await engine.advance(52);
    expect(engine.state.predators[0].state).toBe("chase");
    expect(engine.state.predators[0].fix).toEqual([10, 10]);
    apply((s) => engine.debug.setForagerTile(s, 10, 15));
    await engine.advance(1);
    expect(engine.state.predators[0].fix).toEqual([10, 10]);
  });
  it("Gloamfin searches an empty fix and emits the orange guaranteed ping", async () => {
    posePlay();
    add("gloamfin", 16, 10);
    apply((s) => engine.debug.setPredatorState(s, 0, "chase"));
    apply((s) => engine.debug.setForagerTile(s, 25, 10));
    apply((s) => engine.debug.setPredatorTile(s, 0, 10, 10));
    await engine.advance(1);
    expect(engine.state.predators[0].state).toBe("search");
    await engine.advance(145);
    expect(engine.state.pulses.some((p) => p.tint === "orange")).toBe(true);
    await engine.advance(460);
    expect(engine.state.predators[0].state).toBe("wander");
  });
  it("Flarefish charges, blooms through rock, then extinguishes and remembers", async () => {
    posePlay(3, 3);
    add("flarefish", 25, 10);
    await engine.advance(840);
    expect(engine.state.predators[0].flareCharging).toBe(true);
    await engine.advance(61);
    expect(engine.state.predators[0].flaring).toBe(true);
    expect(engine.state.visibility[10][25]).toBe("l");
    expect(cues).toContain(C.CUES.flare);
    await engine.advance(121);
    expect(engine.state.predators[0].flaring).toBe(false);
    expect(engine.state.visibility[10][25]).toBe("r");
  });
  it("minds off hold bodies and fixes; travel off lets senses run", async () => {
    posePlay();
    add("flarefish", 14, 10);
    apply((s) => engine.debug.setPredatorMind(s, 0, false));
    await engine.advance(60);
    expect(engine.state.predators[0].state).toBe("wander");
    apply((s) => engine.debug.setPredatorMind(s, 0, true));
    await engine.advance(1);
    expect(engine.state.predators[0].state).toBe("chase");
    expect(engine.state.predators[0].tx).toBe(14);
  });
  it("admits no drifter without a den and caps the ordinary cadence", async () => {
    posePlay();
    apply((s) => engine.debug.setPlankton(s, 2, 2, true));
    apply((s) => engine.debug.setDrifterIn(s, 0));
    await engine.advance(1);
    expect(engine.state.drifters).toHaveLength(0);
    apply((s) => engine.debug.setMaze(s, maze()));
    apply((s) => engine.debug.setForagerTile(s, 17, 16));
    await engine.advance(1);
    expect(engine.state.drifters).toHaveLength(1);
    apply((s) => engine.debug.setDrifterIn(s, 0));
    await engine.advance(1);
    expect(engine.state.drifters).toHaveLength(2);
    apply((s) => engine.debug.setDrifterIn(s, 0));
    await engine.advance(1);
    expect(engine.state.drifters).toHaveLength(2);
  });
});
