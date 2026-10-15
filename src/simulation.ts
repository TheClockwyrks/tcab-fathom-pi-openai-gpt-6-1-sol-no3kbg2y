import * as C from "./constants";
import type { CueName } from "./constants";
import type { Dir, FathomState, Predator, Pulse } from "./types";
import {
  arrive,
  attempt,
  atCenter,
  center,
  delta,
  distance,
  distances,
  layer,
  lighting,
  los,
  maze,
  move,
  neighbor,
  open,
  opposite,
  options,
  put,
  random,
  reconcile,
  route,
  segmentDistance,
  tile,
  wander,
} from "./world";
const dt = C.TICK_DT;
const down = (v: number) => Math.max(0, v - dt);
function acquire(s: FathomState, p: Predator): void {
  if (p.state !== "chase") {
    p.alertLeft = p.kind === "lanternjaw" ? 0 : C.ALERT_TIME;
    p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
  }
  p.state = "chase";
  p.fix = [s.forager.tx, s.forager.ty];
  p.linger = C.LINGER_TIME;
  if (p.kind === "flarefish") {
    if (p.flareAge >= 0) p.fade = 0.3;
    p.flareAge = -1;
    p.flaring = false;
    p.flareCharging = false;
    p.flareRadius = 0;
  }
}
function drop(p: Predator): void {
  p.state = "wander";
  p.fix = null;
  p.flareIn = C.FLARE_INTERVAL;
  p.flareAge = -1;
  p.flaring = p.kind === "flarefish" ? false : null;
  p.flareCharging = p.kind === "flarefish" ? false : null;
  p.flareRadius = p.kind === "flarefish" ? 0 : null;
}
export function cast(
  s: FathomState,
  source: "forager" | "gloamfin",
  owner: number | null,
  tint: Pulse["tint"],
): void {
  const b = owner === null ? s.forager : s.predators[owner];
  s.pulses.push({
    source,
    tint,
    ox: b.tx,
    oy: b.ty,
    front: 0,
    range: source === "forager" ? s.sonar.range : C.GLOAMFIN_PING_RANGE,
    owner,
    caught: false,
  });
}
function pulseStep(s: FathomState): Set<string> {
  const lit = new Set<string>();
  for (const p of s.pulses) {
    const before = p.front;
    p.front += C.SONAR_WAVE_SPEED * dt;
    const m = distances(s, p.ox, p.oy, true);
    const reached = (x: number, y: number) => {
      const n = m.get(`${x},${y}`);
      return (
        n !== undefined &&
        n <= p.range &&
        n <= p.front &&
        (n > before || before === 0)
      );
    };
    if (p.source === "forager") {
      for (const [key, n] of m)
        if (n <= p.range && n <= p.front && (n > before || before === 0)) {
          lit.add(key);
          const [x, y] = key.split(",").map(Number);
          for (const d of Object.values(delta)) {
            const nx = x + d[0],
              ny = y + d[1];
            if (tile(s, nx, ny) === "#") lit.add(`${nx},${ny}`);
          }
        }
      s.predators.forEach((q) => {
        if (q.state !== "den" && reached(q.tx, q.ty)) {
          if (q.kind !== "lanternjaw") q.mark = C.SONAR_MARK_TIME;
          if (q.kind === "gloamfin" && q.mind) acquire(s, q);
        }
      });
    } else if (!p.caught && reached(s.forager.tx, s.forager.ty)) {
      const q = p.owner === null ? null : s.predators[p.owner];
      if (q?.kind === "gloamfin" && q.mind && q.state !== "den") acquire(s, q);
      p.caught = true;
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
  return lit;
}
function predatorStep(
  s: FathomState,
  p: Predator,
  i: number,
  cues: Set<CueName>,
): void {
  if (p.releaseAt !== null && s.playAge + 1e-8 >= p.releaseAt)
    p.released = true;
  p.mark = down(p.mark);
  p.alertLeft = down(p.alertLeft);
  p.alert = p.kind !== "lanternjaw" && p.alertLeft > 0;
  p.fade = down(p.fade);
  if (!p.mind) return;
  if (p.state === "den") {
    const gy = s.tiles.findIndex((r) => r.includes("g")),
      gx = gy < 0 ? -1 : s.tiles[gy].indexOf("g");
    if (gx < 0 || !s.tiles.some((r) => r.includes("d")) || !p.released) return;
    if (p.travel)
      move(s, p, C.PREDATOR_SPEED, () => route(s, p, [gx, gy - 1], true), true);
    if (tile(s, p.tx, p.ty) === "." && atCenter(p)) p.state = "wander";
    return;
  }
  const d = distance(p, s.forager);
  if (p.kind === "gloamfin") {
    const had = p.hearingLock;
    p.hearingLock = d <= C.GLOAMFIN_HEAR;
    p.pingIn = down(p.pingIn);
    p.pingAgo += dt;
    if (p.hearingLock) acquire(s, p);
    if (p.state === "search") {
      p.searchAge += dt;
      if (p.searchAge >= C.GLOAMFIN_GIVEUP) drop(p);
    }
    const guaranteed =
      p.state === "search" &&
      p.searchAge >= C.GLOAMFIN_SEARCH_DELAY &&
      !p.searchPing;
    if (
      !p.hearingLock &&
      p.pingAgo + 1e-8 >= C.GLOAMFIN_PING_MIN_GAP &&
      (p.pingIn === 0 || guaranteed || had)
    ) {
      cast(s, "gloamfin", i, guaranteed ? "orange" : "violet");
      p.pingIn = C.GLOAMFIN_PING_INTERVAL;
      p.pingAgo = 0;
      if (guaranteed) p.searchPing = true;
      cues.add(C.CUES.predatorPing);
    }
    if (p.state === "chase")
      p.chaseSpeed = Math.min(
        C.GLOAMFIN_CHASE_SPEED,
        p.chaseSpeed +
          ((C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) * dt) /
            C.GLOAMFIN_RAMP_TIME,
      );
  } else {
    const blind = s.inkClouds.some(
      (c) => segmentDistance(p, s.forager, c) <= c.radius,
    );
    const sees = !blind && d <= (p.detectRange ?? 0) && los(s, p, s.forager);
    if (sees || (!blind && p.flaring && d <= C.FLARE_RADIUS)) acquire(s, p);
    else if (blind && p.state === "chase") drop(p);
    else if (p.state === "chase") {
      p.linger = down(p.linger);
      if (p.linger === 0) drop(p);
    }
    if (p.kind === "flarefish") {
      if (p.state === "wander") {
        if (p.flareAge < 0) {
          p.flareIn = down(p.flareIn);
          if (p.flareIn === 0) p.flareAge = 0;
        } else {
          const old = p.flareAge;
          p.flareAge += dt;
          if (old < C.FLARE_CHARGE && p.flareAge + 1e-8 >= C.FLARE_CHARGE)
            cues.add(C.CUES.flare);
          if (p.flareAge + 1e-8 >= C.FLARE_CHARGE + C.FLARE_BLOOM) {
            p.flareAge = -1;
            p.flareIn = C.FLARE_INTERVAL;
            p.fade = 0.3;
          }
        }
      }
      p.flareCharging = p.flareAge >= 0 && p.flareAge < C.FLARE_CHARGE;
      p.flaring = p.flareAge >= C.FLARE_CHARGE;
      p.flareRadius = p.flaring ? C.FLARE_RADIUS : 0;
    }
  }
  p.alert = p.kind !== "lanternjaw" && p.alertLeft > 0;
  reconcile(s);
  if (p.fix && p.state === "chase") {
    const first = route(s, p, p.fix);
    if ((p.tx !== p.fix[0] || p.ty !== p.fix[1]) && first === opposite(p.dir))
      p.dir = first;
    if (
      p.kind === "gloamfin" &&
      atCenter(p) &&
      p.tx === p.fix[0] &&
      p.ty === p.fix[1] &&
      (p.tx !== s.forager.tx || p.ty !== s.forager.ty)
    ) {
      p.state = "search";
      p.searchAge = 0;
      p.searchPing = false;
    }
  }
  if (p.travel)
    move(
      s,
      p,
      () =>
        p.kind === "gloamfin" && p.state === "chase" ? p.chaseSpeed : p.speed,
      () => {
        const old = p.dir;
        let dir: Dir | null;
        if (p.state === "chase" && p.fix) {
          if (p.tx === p.fix[0] && p.ty === p.fix[1]) {
            if (
              p.kind === "gloamfin" &&
              (p.tx !== s.forager.tx || p.ty !== s.forager.ty)
            ) {
              p.state = "search";
              p.searchAge = 0;
              p.searchPing = false;
              dir = wander(s, p);
            } else dir = null;
          } else dir = route(s, p, p.fix);
        } else if (p.state === "search" && p.fix) {
          const near = distances(s, ...p.fix);
          const choices = options(s, p).filter(
            (d) =>
              (near.get(neighbor(s, p.tx, p.ty, d).join(",")) ?? Infinity) <=
              C.GLOAMFIN_SEARCH_ROAM,
          );
          const forward = choices.filter((d) => d !== opposite(p.dir));
          const pool = forward.length ? forward : choices;
          dir = pool[Math.floor(random(s) * pool.length)] ?? route(s, p, p.fix);
        } else dir = wander(s, p);
        if (
          p.kind === "gloamfin" &&
          p.state === "chase" &&
          dir &&
          dir !== old &&
          dir !== opposite(old)
        )
          p.chaseSpeed = C.GLOAMFIN_CORNER_SPEED;
        return dir;
      },
    );
}
export function tick(s: FathomState, held: boolean): Set<CueName> {
  const cues = new Set<CueName>();
  s.simTime += dt;
  s.screenAge += dt;
  if (s.screen === "countdown") {
    lighting(s);
    if (s.screenAge + 1e-8 >= 2) {
      s.playAge = 0;
      arrive(s, "playing");
    }
    return cues;
  }
  if (s.screen === "cleared") {
    if (s.screenAge + 1e-8 >= 2) {
      s.depth++;
      s.tiles = maze();
      s.plankton = s.tiles.map((r) =>
        r.replace(/[^.]/g, "-").replace(/\./g, "*"),
      );
      s.visibility = layer("u");
      attempt(s);
    }
    return cues;
  }
  if (s.screen !== "playing") return cues;
  s.sonar.cooldown = down(s.sonar.cooldown);
  s.ink.cooldown = down(s.ink.cooldown);
  const decay = Math.max(0, dt - s.brightHold);
  s.brightHold = down(s.brightHold);
  s.brightness *= 0.5 ** (decay / C.BRIGHT_HALFLIFE);
  reconcile(s);
  if (s.pendingSonar) {
    if (s.sonar.ready) {
      cast(s, "forager", null, "cyan");
      s.sonar.cooldown = C.SONAR_COOLDOWN;
      cues.add(C.CUES.sonar);
    }
    s.pendingSonar = false;
  }
  if (s.pendingInk) {
    if (s.ink.ready) {
      s.inkClouds.push({
        x: s.forager.x,
        y: s.forager.y,
        radius: C.INK_RADIUS,
        remaining: C.INK_LIFE,
      });
      s.ink.cooldown = C.INK_COOLDOWN;
      cues.add(C.CUES.ink);
    }
    s.pendingInk = false;
  }
  const f = s.forager;
  if (held) {
    if (s.desired === opposite(f.dir)) f.dir = s.desired;
    f.moving = move(s, f, C.FORAGER_SPEED, () => {
      const o = options(s, f);
      return o.includes(s.desired)
        ? s.desired
        : o.includes(f.dir)
          ? f.dir
          : null;
    });
  } else f.moving = false;
  if (s.plankton[f.ty]?.[f.tx] === "*" && tile(s, f.tx, f.ty) === ".") {
    put(s.plankton, f.tx, f.ty, "-");
    s.score += C.SCORE_PLANKTON;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    cues.add(C.CUES.eat);
    reconcile(s);
    if (s.planktonRemaining === 0) {
      s.score += C.SCORE_CLEAR;
      cues.add(C.CUES.descend);
      arrive(s, "cleared");
      lighting(s);
      return cues;
    }
  }
  s.drifterIn = down(s.drifterIn);
  if (
    s.drifterIn === 0 &&
    s.planktonRemaining > 0 &&
    s.drifters.length < C.DRIFTER_MAX
  ) {
    const gy = s.tiles.findIndex((r) => r.includes("g")),
      gx = gy < 0 ? -1 : s.tiles[gy].indexOf("g");
    if (open(s, gx, gy - 1)) {
      s.drifters.push({
        ...center(gx, gy - 1),
        dir: "up",
        mind: true,
        travel: true,
        lit: false,
      });
      s.drifterIn = C.DRIFTER_INTERVAL;
    }
  }
  for (const p of s.drifters)
    if (p.mind && p.travel) move(s, p, C.DRIFTER_SPEED, () => wander(s, p));
  s.drifters = s.drifters.filter((p) => {
    if (p.tx === f.tx && p.ty === f.ty) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
  const lit = pulseStep(s);
  s.predators.forEach((p, i) => predatorStep(s, p, i, cues));
  s.inkClouds = s.inkClouds
    .map((c) => ({ ...c, remaining: down(c.remaining) }))
    .filter((c) => c.remaining > 0);
  s.playAge += dt;
  reconcile(s);
  lighting(s, lit);
  if (
    s.predators.some((p) => p.state !== "den" && p.tx === f.tx && p.ty === f.ty)
  ) {
    cues.add(C.CUES.caught);
    if (s.lives === 0) arrive(s, "gameover");
    else {
      s.lives--;
      attempt(s);
    }
  }
  return cues;
}
