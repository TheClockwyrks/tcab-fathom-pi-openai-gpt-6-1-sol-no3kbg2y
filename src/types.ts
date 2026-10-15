import type { DeepReadonly } from "ts-essentials";
import type { PredatorKind } from "./constants";
export type Dir = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Dir;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
export interface Predator extends Drifter {
  kind: PredatorKind;
  state: "den" | "wander" | "chase" | "search";
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: [number, number] | null;
  linger: number;
  alertLeft: number;
  mark: number;
  pingIn: number;
  pingAgo: number;
  searchAge: number;
  searchPing: boolean;
  chaseSpeed: number;
  flareIn: number;
  flareAge: number;
  fade: number;
  releaseAt: number | null;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  owner: number | null;
  caught: boolean;
}
export interface InkCloud {
  x: number;
  y: number;
  radius: number;
  remaining: number;
}
export interface FathomState {
  version: number;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Body & { moving: boolean };
  drifters: Drifter[];
  predators: Predator[];
  pulses: Pulse[];
  inkClouds: InkCloud[];
  simTime: number;
  // Simulation clocks and decisions, never hidden in the renderer or a closure.
  remainder: number;
  screenAge: number;
  playAge: number;
  desired: Dir;
  seed: number;
  start: [number, number];
  pointerDown: Record<number, number>;
  pendingSonar: boolean;
  pendingInk: boolean;
  art: Record<string, ImageBitmap[]>;
}
export type View = DeepReadonly<FathomState>;
export type Rect = { x: number; y: number; w: number; h: number };
export type Snapshot = Omit<
  FathomState,
  | "art"
  | "remainder"
  | "screenAge"
  | "playAge"
  | "desired"
  | "seed"
  | "start"
  | "pointerDown"
  | "pendingSonar"
  | "pendingInk"
  | "predators"
  | "drifters"
  | "pulses"
> & {
  predators: Omit<
    Predator,
    | "fix"
    | "linger"
    | "alertLeft"
    | "mark"
    | "pingIn"
    | "pingAgo"
    | "searchAge"
    | "searchPing"
    | "chaseSpeed"
    | "flareIn"
    | "flareAge"
    | "fade"
    | "releaseAt"
  >[];
  drifters: Omit<Drifter, "dir">[];
  pulses: Omit<Pulse, "owner" | "caught">[];
};
export interface FathomDebugApi {
  version: number;
  reset(s: View): FathomState;
  snapshot(s: View): Snapshot;
  reconcile(s: View): FathomState;
  setScreen(s: View, screen: Screen): FathomState;
  setMenuIndex(s: View, index: number): FathomState;
  setTitleIndex(s: View, index: number): FathomState;
  menuItemRect(s: View, index: number): Rect | null;
  setScore(s: View, points: number): FathomState;
  setLives(s: View, n: number): FathomState;
  setDepth(s: View, d: number): FathomState;
  setMaze(s: View, rows: string[]): FathomState;
  setPlankton(s: View, tx: number, ty: number, present: boolean): FathomState;
  clearPlankton(s: View): FathomState;
  clearFog(s: View): FathomState;
  setForagerTile(s: View, tx: number, ty: number): FathomState;
  setForagerDir(s: View, dir: Dir): FathomState;
  setBrightness(s: View, g: number): FathomState;
  setBrightHold(s: View, seconds: number): FathomState;
  clearPredators(s: View): FathomState;
  addPredator(s: View, kind: PredatorKind, tx: number, ty: number): FathomState;
  setPredatorTile(s: View, index: number, tx: number, ty: number): FathomState;
  setPredatorDir(s: View, index: number, dir: Dir): FathomState;
  setPredatorState(
    s: View,
    index: number,
    value: "den" | "wander" | "chase",
  ): FathomState;
  setPredatorReleased(s: View, index: number, released: boolean): FathomState;
  setPredatorMind(s: View, index: number, enabled: boolean): FathomState;
  setPredatorTravel(s: View, index: number, enabled: boolean): FathomState;
  spawnDrifter(s: View, tx: number, ty: number): FathomState;
  clearDrifters(s: View): FathomState;
  setDrifterMind(s: View, index: number, enabled: boolean): FathomState;
  setDrifterTravel(s: View, index: number, enabled: boolean): FathomState;
  setDrifterIn(s: View, seconds: number): FathomState;
  setSonarCooldown(s: View, seconds: number): FathomState;
  setInkCooldown(s: View, seconds: number): FathomState;
}
