import * as C from "./constants";
import type {
  Dir,
  FathomDebugApi,
  FathomState,
  Predator,
  Screen,
  Snapshot,
  View,
} from "./types";
import {
  arrive,
  center,
  clone,
  fresh,
  hunter,
  layer,
  open,
  put,
  reconcile,
  roster,
  tile,
} from "./world";
export function items(screen: Screen): readonly string[] {
  return screen === "title"
    ? C.TITLE_ITEMS
    : screen === "paused"
      ? C.PAUSE_ITEMS
      : screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
}
export function menuItemRect(s: View, index: number) {
  return Number.isInteger(index) && index >= 0 && index < items(s.screen).length
    ? { x: 480, y: 418 + index * 58, w: 320, h: 48 }
    : null;
}
function check(ok: boolean): asserts ok {
  if (!ok) throw new RangeError("Fathom: invalid pose");
}
function number(n: number, min = 0, max = Infinity, integer = false): void {
  check(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!integer || Number.isInteger(n)),
  );
}
function direction(d: Dir): void {
  check(["up", "down", "left", "right"].includes(d));
}
function cell(s: View, x: number, y: number, pred = false): void {
  number(x, 0, C.GRID_COLS - 1, true);
  number(y, 0, C.GRID_ROWS - 1, true);
  check(open(s, x, y, pred));
}
function bool(v: boolean): void {
  check(typeof v === "boolean");
}
function pose(s: View, fn: (n: FathomState) => void): FathomState {
  const n = clone(s);
  fn(n);
  return reconcile(n);
}
function predator(
  s: View,
  index: number,
  fn: (p: Predator, n: FathomState) => void,
): FathomState {
  number(index, 0, s.predators.length - 1, true);
  return pose(s, (n) => fn(n.predators[index], n));
}
export function snapshot(s: View): Snapshot {
  const {
    art: _art,
    remainder: _r,
    screenAge: _a,
    playAge: _p,
    desired: _d,
    seed: _seed,
    start: _start,
    pointerDown: _pd,
    pendingSonar: _ps,
    pendingInk: _pi,
    ...rest
  } = clone(s);
  return {
    ...rest,
    predators: s.predators.map((p) => ({
      kind: p.kind,
      x: p.x,
      y: p.y,
      tx: p.tx,
      ty: p.ty,
      dir: p.dir,
      state: p.state,
      released: p.released,
      mind: p.mind,
      travel: p.travel,
      speed: p.speed,
      alert: p.alert,
      lit: p.lit,
      detectRange: p.detectRange,
      hearingRange: p.hearingRange,
      hearingLock: p.hearingLock,
      flareCharging: p.flareCharging,
      flaring: p.flaring,
      flareRadius: p.flareRadius,
    })),
    drifters: s.drifters.map((p) => ({
      x: p.x,
      y: p.y,
      tx: p.tx,
      ty: p.ty,
      lit: p.lit,
      mind: p.mind,
      travel: p.travel,
    })),
    pulses: s.pulses.map((p) => ({
      source: p.source,
      tint: p.tint,
      ox: p.ox,
      oy: p.oy,
      front: p.front,
      range: p.range,
    })),
  };
}
export const debug: FathomDebugApi = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s) => {
    const n = fresh(s.art as Record<string, ImageBitmap[]>);
    n.muted = s.muted;
    return n;
  },
  snapshot,
  reconcile: (s) => reconcile(clone(s)),
  setScreen: (s, v) => {
    check(
      [
        "title",
        "howto",
        "countdown",
        "playing",
        "paused",
        "cleared",
        "gameover",
      ].includes(v),
    );
    return arrive(clone(s), v);
  },
  setMenuIndex: (s, i) => {
    number(i, 0, items(s.screen).length - 1, true);
    return pose(s, (n) => {
      n.menuIndex = i;
    });
  },
  setTitleIndex: (s, i) => {
    number(i, 0, C.TITLE_ITEMS.length - 1, true);
    return pose(s, (n) => {
      n.titleIndex = i;
    });
  },
  menuItemRect,
  setScore: (s, v) => {
    number(v, 0, Infinity, true);
    return pose(s, (n) => {
      n.score = v;
    });
  },
  setLives: (s, v) => {
    number(v, 0, Infinity, true);
    return pose(s, (n) => {
      n.lives = v;
    });
  },
  setDepth: (s, v) => {
    number(v, 1, Infinity, true);
    return pose(s, (n) => {
      n.depth = v;
      n.predators = roster(v, n.tiles);
    });
  },
  setMaze: (s, rows) => {
    check(
      rows.length === C.GRID_ROWS &&
        rows.every((r) => r.length === C.GRID_COLS && /^[#.gd]+$/.test(r)),
    );
    const gates = rows.join("").split("g").length - 1;
    check(!/[gd]/.test(rows.join("")) || gates === 1);
    return pose(s, (n) => {
      n.tiles = [...rows];
    });
  },
  setPlankton: (s, x, y, v) => {
    cell(s, x, y);
    bool(v);
    return pose(s, (n) => put(n.plankton, x, y, v ? "*" : "-"));
  },
  clearPlankton: (s) =>
    pose(s, (n) => {
      n.plankton = layer("-");
    }),
  clearFog: (s) =>
    pose(s, (n) => {
      n.visibility = layer("u");
    }),
  setForagerTile: (s, x, y) => {
    cell(s, x, y);
    return pose(s, (n) => {
      Object.assign(n.forager, center(x, y), { moving: false });
      n.desired = n.forager.dir;
    });
  },
  setForagerDir: (s, d) => {
    direction(d);
    return pose(s, (n) => {
      n.forager.dir = d;
      n.desired = d;
      n.forager.moving = false;
    });
  },
  setBrightness: (s, v) => {
    number(v, 0, 1);
    return pose(s, (n) => {
      n.brightness = v;
    });
  },
  setBrightHold: (s, v) => {
    number(v, 0, C.BRIGHT_HOLD);
    return pose(s, (n) => {
      n.brightHold = v;
    });
  },
  clearPredators: (s) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s, k, x, y) => {
    check(C.DEN_ORDER.includes(k));
    cell(s, x, y);
    return pose(s, (n) => {
      n.predators.push(hunter(k, x, y));
    });
  },
  setPredatorTile: (s, i, x, y) => {
    cell(s, x, y, true);
    return predator(s, i, (p) => Object.assign(p, center(x, y)));
  },
  setPredatorDir: (s, i, d) => {
    direction(d);
    return predator(s, i, (p) => {
      p.dir = d;
    });
  },
  setPredatorState: (s, i, v) => {
    check(["den", "wander", "chase"].includes(v));
    return predator(s, i, (p, n) => {
      check(
        v === "den"
          ? ["d", "g"].includes(tile(s, p.tx, p.ty))
          : tile(s, p.tx, p.ty) === ".",
      );
      p.state = v;
      p.fix = v === "chase" ? [n.forager.tx, n.forager.ty] : null;
      p.linger = C.LINGER_TIME;
      p.alert = false;
      p.alertLeft = 0;
      p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
      p.flareIn = C.FLARE_INTERVAL;
      p.flareAge = -1;
      p.fade = 0;
      if (p.kind === "flarefish") {
        p.flareCharging = false;
        p.flaring = false;
        p.flareRadius = 0;
      }
    });
  },
  setPredatorReleased: (s, i, v) => {
    bool(v);
    return predator(s, i, (p) => {
      p.released = v;
    });
  },
  setPredatorMind: (s, i, v) => {
    bool(v);
    return predator(s, i, (p) => {
      p.mind = v;
    });
  },
  setPredatorTravel: (s, i, v) => {
    bool(v);
    return predator(s, i, (p) => {
      p.travel = v;
    });
  },
  spawnDrifter: (s, x, y) => {
    cell(s, x, y);
    return pose(s, (n) => {
      n.drifters.push({
        ...center(x, y),
        dir: "up",
        lit: false,
        mind: true,
        travel: true,
      });
    });
  },
  clearDrifters: (s) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s, i, v) => {
    bool(v);
    number(i, 0, s.drifters.length - 1, true);
    return pose(s, (n) => {
      n.drifters[i].mind = v;
    });
  },
  setDrifterTravel: (s, i, v) => {
    bool(v);
    number(i, 0, s.drifters.length - 1, true);
    return pose(s, (n) => {
      n.drifters[i].travel = v;
    });
  },
  setDrifterIn: (s, v) => {
    number(v, 0, C.DRIFTER_INTERVAL);
    return pose(s, (n) => {
      n.drifterIn = v;
    });
  },
  setSonarCooldown: (s, v) => {
    number(v);
    return pose(s, (n) => {
      n.sonar.cooldown = v;
    });
  },
  setInkCooldown: (s, v) => {
    number(v);
    return pose(s, (n) => {
      n.ink.cooldown = v;
    });
  },
};
