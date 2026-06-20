import { useState, useEffect, useRef, useCallback, memo } from "react";

interface Props {
  hint?: string;
  onPinEntered: (pin: string) => void | Promise<false | void>;
  onBypass?: () => void;
}

// ── Map size (bigger) ──
const CELL = 18;
const COLS = 50;
const ROWS = 32;
const WIDTH = COLS * CELL;
const HEIGHT = ROWS * CELL;

type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";
type Point = { x: number; y: number };

// ── Power-ups (expanded) ──
type PowerUpType = "speed" | "ghost" | "magnet" | "double" | "shrink" | "hyper" | "clone" | "shield" | "freeze";

interface PowerUp {
  pos: Point;
  type: PowerUpType;
  spawnedAt: number;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

const POWER_UP_COLORS: Record<PowerUpType, string> = {
  speed: "#ffcc00", ghost: "#aa44ff", magnet: "#ff66aa",
  double: "#44ff44", shrink: "#ff4444", hyper: "#ff00ff", clone: "#00ffaa",
  shield: "#00ddff", freeze: "#88ccff",
};

const POWER_UP_LABELS: Record<PowerUpType, string> = {
  speed: "TURBO", ghost: "PHASE", magnet: "MAGNET",
  double: "x2 PTS", shrink: "SHRINK", hyper: "HYPER", clone: "CLONE",
  shield: "SHIELD", freeze: "FREEZE",
};

const POWER_UP_DURATION = 200;
const HYPER_DURATION = 300; // ~10s at hyper speed
const CLONE_DURATION = 300;

// ── Food variety ──
interface FoodType { emoji: string; points: number; color: string; weight: number; }
const FOOD_TYPES: FoodType[] = [
  { emoji: "\u26A1", points: 10, color: "#ffcc00", weight: 40 },
  { emoji: "\uD83C\uDF4E", points: 15, color: "#ff4444", weight: 25 },
  { emoji: "\uD83C\uDF52", points: 20, color: "#ff2266", weight: 18 },
  { emoji: "\u2B50", points: 30, color: "#ffaa00", weight: 12 },
  { emoji: "\uD83C\uDF47", points: 35, color: "#aa66ff", weight: 9 },   // grapes
  { emoji: "\uD83C\uDF49", points: 40, color: "#44ff88", weight: 7 },   // watermelon
  { emoji: "\uD83D\uDC8E", points: 50, color: "#44ddff", weight: 5 },
  { emoji: "\uD83D\uDC51", points: 100, color: "#ffd700", weight: 2 },  // crown (jackpot)
];

function pickFood(): FoodType {
  const total = FOOD_TYPES.reduce((s, f) => s + f.weight, 0);
  let r = Math.random() * total;
  for (const f of FOOD_TYPES) { r -= f.weight; if (r <= 0) return f; }
  return FOOD_TYPES[0];
}

// ── Snake skins ──
type SnakeSkin = "solid" | "striped" | "gradient" | "dotted" | "pulsing";

const SKIN_LABELS: Record<SnakeSkin, string> = {
  solid: "Solid", striped: "Striped", gradient: "Gradient", dotted: "Dotted", pulsing: "Pulsing",
};

// ── Game modes ──
type GameMode = "normal" | "challenge" | "2player";

// ── AI settings ──
type AIDifficulty = "easy" | "medium" | "hard" | "insane";
type AIPersonality = "normal" | "aggressive" | "defensive" | "hunter" | "coward" | "greedy" | "ambush";

// ── Sound engine (WebAudio, zero assets) ──
// A tiny synth that gives the game dramatic feedback: blips for food, sweeps
// for power-ups, a thud + noise burst for death, rising arpeggios on level-up.
let _audioCtx: AudioContext | null = null;
let _soundOn = true;
function setSoundOn(on: boolean) { _soundOn = on; }
function audioCtx(): AudioContext | null {
  if (!_soundOn) return null;
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    return _audioCtx;
  } catch { return null; }
}
function blip(freq: number, dur = 0.08, type: OscillatorType = "square", vol = 0.05, slideTo?: number) {
  const ctx = audioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), ctx.currentTime + dur);
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + dur);
}
function noiseBurst(dur = 0.25, vol = 0.12) {
  const ctx = audioCtx();
  if (!ctx) return;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  src.buffer = buf; src.connect(gain); gain.connect(ctx.destination);
  src.start();
}
const SFX = {
  eat: (combo: number) => blip(440 + Math.min(combo, 12) * 60, 0.06, "square", 0.045),
  bigEat: () => { blip(660, 0.08, "triangle", 0.05); setTimeout(() => blip(990, 0.1, "triangle", 0.05), 50); },
  powerUp: () => { blip(300, 0.18, "sawtooth", 0.05, 900); },
  levelUp: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.12, "triangle", 0.05), i * 70)); },
  combo: (n: number) => blip(500 + n * 40, 0.05, "sine", 0.04),
  death: () => { blip(200, 0.4, "sawtooth", 0.07, 40); noiseBurst(0.35, 0.1); },
  shield: () => { blip(180, 0.3, "sine", 0.06, 700); },
  spawn: () => blip(120, 0.12, "sine", 0.03, 320),
};

// ── Themes ──
type SnakeTheme = "neon" | "ice" | "fire" | "matrix" | "sunset" | "galaxy" | "toxic" | "blood" | "gold" | "vapor";

interface ThemeConfig {
  label: string; head: string; body: string; glow: string;
  bg: string; gridLine: string; border: string; accent: string;
  accentDim: string; canvasBorder: string; titleColor: string; mutedText: string;
}

const SNAKE_THEMES: Record<SnakeTheme, ThemeConfig> = {
  neon: {
    label: "Neon", head: "#ff4466", body: "#ff003c", glow: "#ff003c",
    bg: "#0a0a0f", gridLine: "#1a1a24", border: "#2a1020", accent: "#ff003c",
    accentDim: "rgba(255,0,60,0.15)", canvasBorder: "#660022", titleColor: "#ff4466", mutedText: "#665566",
  },
  ice: {
    label: "Ice", head: "#66eeff", body: "#00bbdd", glow: "#00ccff",
    bg: "#060e14", gridLine: "#0e1e2a", border: "#102838", accent: "#00ccff",
    accentDim: "rgba(0,204,255,0.12)", canvasBorder: "#004466", titleColor: "#66eeff", mutedText: "#556677",
  },
  fire: {
    label: "Fire", head: "#ffaa22", body: "#ff4400", glow: "#ff6600",
    bg: "#100a04", gridLine: "#241a0e", border: "#382010", accent: "#ff6600",
    accentDim: "rgba(255,102,0,0.12)", canvasBorder: "#663300", titleColor: "#ffaa22", mutedText: "#776655",
  },
  matrix: {
    label: "Matrix", head: "#44ff44", body: "#00cc00", glow: "#00ff00",
    bg: "#040e04", gridLine: "#0e1e0e", border: "#103810", accent: "#00ff00",
    accentDim: "rgba(0,255,0,0.1)", canvasBorder: "#004400", titleColor: "#44ff44", mutedText: "#557755",
  },
  sunset: {
    label: "Sunset", head: "#ff88cc", body: "#cc44aa", glow: "#ff66bb",
    bg: "#0e0610", gridLine: "#201424", border: "#301838", accent: "#ff66bb",
    accentDim: "rgba(255,102,187,0.12)", canvasBorder: "#662244", titleColor: "#ff88cc", mutedText: "#776677",
  },
  galaxy: {
    label: "Galaxy", head: "#bb88ff", body: "#7744dd", glow: "#9966ff",
    bg: "#08061a", gridLine: "#161230", border: "#1e1840", accent: "#9966ff",
    accentDim: "rgba(153,102,255,0.12)", canvasBorder: "#442288", titleColor: "#bb88ff", mutedText: "#667788",
  },
  toxic: {
    label: "Toxic", head: "#ccff33", body: "#88cc00", glow: "#aaff00",
    bg: "#0a0e04", gridLine: "#1a240c", border: "#283810", accent: "#aaff00",
    accentDim: "rgba(170,255,0,0.12)", canvasBorder: "#446600", titleColor: "#ccff33", mutedText: "#778855",
  },
  blood: {
    label: "Blood", head: "#ff2222", body: "#aa0000", glow: "#ff0000",
    bg: "#0e0404", gridLine: "#240c0c", border: "#380f0f", accent: "#cc0000",
    accentDim: "rgba(204,0,0,0.14)", canvasBorder: "#660000", titleColor: "#ff4444", mutedText: "#886655",
  },
  gold: {
    label: "Gold", head: "#ffe680", body: "#ddaa22", glow: "#ffcc00",
    bg: "#0e0c04", gridLine: "#241e0a", border: "#382e10", accent: "#ffcc00",
    accentDim: "rgba(255,204,0,0.12)", canvasBorder: "#665200", titleColor: "#ffe680", mutedText: "#887755",
  },
  vapor: {
    label: "Vapor", head: "#ff71ce", body: "#01cdfe", glow: "#b967ff",
    bg: "#0c0618", gridLine: "#1c1238", border: "#281a48", accent: "#ff71ce",
    accentDim: "rgba(255,113,206,0.14)", canvasBorder: "#5522aa", titleColor: "#05ffa1", mutedText: "#9988bb",
  },
};

// ── Stats ──
interface SnakeStats {
  totalGames: number; totalScore: number; totalFood: number;
  totalTime: number; bestScore: number; bestLevel: number;
  bestCombo: number; powerUpsCollected: number; longestSnake: number;
  challengeBestTime: number; crownsEaten: number;
}

const DEFAULT_STATS: SnakeStats = {
  totalGames: 0, totalScore: 0, totalFood: 0, totalTime: 0,
  bestScore: 0, bestLevel: 0, bestCombo: 0, powerUpsCollected: 0,
  longestSnake: 3, challengeBestTime: 0, crownsEaten: 0,
};

function loadStats(): SnakeStats {
  // One-time stats reset (v2)
  if (!localStorage.getItem("cybervault_snake_stats_v2")) {
    localStorage.removeItem("cybervault_snake_stats");
    localStorage.removeItem("cybervault_snake_highscore");
    localStorage.removeItem("cybervault_snake_achievements");
    localStorage.setItem("cybervault_snake_stats_v2", "1");
  }
  try {
    const s = localStorage.getItem("cybervault_snake_stats");
    return s ? { ...DEFAULT_STATS, ...JSON.parse(s) } : { ...DEFAULT_STATS };
  } catch { return { ...DEFAULT_STATS }; }
}

function saveStats(s: SnakeStats) {
  localStorage.setItem("cybervault_snake_stats", JSON.stringify(s));
}

// ── Achievements ──
interface Achievement {
  id: string; label: string; desc: string; icon: string;
  check: (s: SnakeStats, game: { score: number; level: number; combo: number; length: number; challengeTime: number }) => boolean;
}

const ACHIEVEMENTS: Achievement[] = [
  { id: "first_blood", label: "First Blood", desc: "Score 100 points", icon: "\uD83D\uDDE1\uFE0F",
    check: (_, g) => g.score >= 100 },
  { id: "combo_king", label: "Combo King", desc: "Get a x5 combo", icon: "\uD83D\uDD25",
    check: (_, g) => g.combo >= 5 },
  { id: "lvl10", label: "Level 10", desc: "Reach level 10", icon: "\uD83C\uDFC6",
    check: (_, g) => g.level >= 10 },
  { id: "high_roller", label: "High Roller", desc: "Score 500 points", icon: "\uD83D\uDCB0",
    check: (_, g) => g.score >= 500 },
  { id: "survivor", label: "Survivor", desc: "Play 2 minutes", icon: "\u23F0",
    check: (s) => s.totalTime >= 120 },
  { id: "power_hungry", label: "Power Hungry", desc: "Collect 10 power-ups total", icon: "\uD83D\uDCA5",
    check: (s) => s.powerUpsCollected >= 10 },
  { id: "giant", label: "Giant Snake", desc: "Reach length 20", icon: "\uD83D\uDC0D",
    check: (_, g) => g.length >= 20 },
  { id: "thousand", label: "Legendary", desc: "Score 1000 points", icon: "\u2B50",
    check: (_, g) => g.score >= 1000 },
  { id: "veteran", label: "Veteran", desc: "Play 50 games", icon: "\uD83C\uDF96\uFE0F",
    check: (s) => s.totalGames >= 50 },
  { id: "challenger", label: "Challenger", desc: "Survive 60s in challenge", icon: "\uD83D\uDEE1\uFE0F",
    check: (_, g) => g.challengeTime >= 60 },
  { id: "combo_god", label: "Combo God", desc: "Get a x10 combo", icon: "\uD83C\uDF00",
    check: (_, g) => g.combo >= 10 },
  { id: "anaconda", label: "Anaconda", desc: "Reach length 40", icon: "\uD83D\uDC09",
    check: (_, g) => g.length >= 40 },
  { id: "score_5k", label: "Untouchable", desc: "Score 5000 points", icon: "\uD83D\uDCAB",
    check: (_, g) => g.score >= 5000 },
  { id: "marathon", label: "Marathon", desc: "Play 10 minutes total", icon: "\uD83C\uDFC3",
    check: (s) => s.totalTime >= 600 },
  { id: "gourmet", label: "Gourmet", desc: "Eat 500 food total", icon: "\uD83C\uDF7D\uFE0F",
    check: (s) => s.totalFood >= 500 },
  { id: "century", label: "Centurion", desc: "Play 100 games", icon: "\uD83D\uDCAF",
    check: (s) => s.totalGames >= 100 },
  { id: "lvl25", label: "Ascended", desc: "Reach level 25", icon: "\uD83D\uDE80",
    check: (_, g) => g.level >= 25 },
  { id: "jackpot", label: "Jackpot", desc: "Eat a \uD83D\uDC51 crown (100pt)", icon: "\uD83D\uDC51",
    check: (s) => s.crownsEaten >= 1 },
  { id: "power_addict", label: "Power Addict", desc: "Collect 50 power-ups total", icon: "\u269B\uFE0F",
    check: (s) => s.powerUpsCollected >= 50 },
  { id: "challenge_2m", label: "Iron Will", desc: "Survive 120s in challenge", icon: "\u2694\uFE0F",
    check: (_, g) => g.challengeTime >= 120 },
];

function loadUnlocked(): Set<string> {
  try {
    const s = localStorage.getItem("cybervault_snake_achievements");
    return s ? new Set(JSON.parse(s)) : new Set();
  } catch { return new Set(); }
}

function saveUnlocked(u: Set<string>) {
  localStorage.setItem("cybervault_snake_achievements", JSON.stringify([...u]));
}

// ── Helpers ──
function randomPos(exclude: Point[], cols: number = COLS, rows: number = ROWS, margin = 0): Point {
  let pos: Point;
  do {
    pos = {
      x: margin + Math.floor(Math.random() * (cols - margin * 2)),
      y: margin + Math.floor(Math.random() * (rows - margin * 2)),
    };
  } while (exclude.some((s) => s.x === pos.x && s.y === pos.y));
  return pos;
}

function wrapDist(ax: number, ay: number, bx: number, by: number, cols = COLS, rows = ROWS): number {
  return Math.min(Math.abs(ax - bx), cols - Math.abs(ax - bx))
       + Math.min(Math.abs(ay - by), rows - Math.abs(ay - by));
}

function nearestFood(head: Point, f1: Point, f2: Point): Point {
  const d1 = wrapDist(head.x, head.y, f1.x, f1.y);
  const d2 = wrapDist(head.x, head.y, f2.x, f2.y);
  return d1 <= d2 ? f1 : f2;
}

// ── AI with difficulty & personality ──
//
// The brain (hard / insane) does proper survival-first planning:
//  1. A* path to the chosen target on the toroidal grid.
//  2. For every candidate move it SIMULATES the resulting body, then scores it
//     by: can the snake still reach its own tail afterwards (the classic
//     "stay alive" guarantee), how much open space it keeps (flood fill), and
//     finally distance to the target. Edge/own-trapping moves are penalised.
//  3. When no safe path to food exists it falls back to chasing its tail —
//     the survival strategy that lets a strong snake fill the whole board.
// Easy/medium keep the lighter greedy/flood behaviour so the difficulty
// dropdown is a real difficulty curve.
const DIRS4: { dir: Dir; dx: number; dy: number }[] = [
  { dir: "UP", dx: 0, dy: -1 }, { dir: "DOWN", dx: 0, dy: 1 },
  { dir: "LEFT", dx: -1, dy: 0 }, { dir: "RIGHT", dx: 1, dy: 0 },
];
const OPPOSITE: Record<Dir, Dir> = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT" };

function smartAI(
  head: Point, snake: Point[], food: Point, powerUp: PowerUp | null,
  currentDir: Dir, isGhost: boolean, otherSnake: Point[],
  difficulty: AIDifficulty = "medium", personality: AIPersonality = "normal",
  playerHead?: Point,
  cols = COLS, rows = ROWS,
): Dir {
  const wrap = (x: number, y: number): Point => ({ x: (x + cols) % cols, y: (y + rows) % rows });
  const k = (x: number, y: number) => `${x},${y}`;

  // Obstacles: own body (tail tip vacates this tick) plus the rival snake.
  const bodySet = new Set<string>();
  for (let i = 0; i < snake.length - 1; i++) bodySet.add(k(snake[i].x, snake[i].y));
  for (const seg of otherSnake) bodySet.add(k(seg.x, seg.y));
  const tail = snake[snake.length - 1];

  // ── Target selection by personality ──
  let target = food;
  if (personality === "hunter" && playerHead) {
    // Cut the player off: aim a step AHEAD of where they're heading.
    target = playerHead;
  } else if (personality === "ambush" && playerHead) {
    // Aim for the food, but if the player is near it, intercept the food first.
    const pToFood = wrapDist(playerHead.x, playerHead.y, food.x, food.y, cols, rows);
    if (pToFood < 6) target = food;
  } else if (personality === "greedy") {
    // Always grab the power-up if one exists, else nearest food.
    if (powerUp) target = powerUp.pos;
  } else if ((personality === "defensive" || personality === "coward") && playerHead) {
    const distToPlayer = wrapDist(head.x, head.y, playerHead.x, playerHead.y, cols, rows);
    const flee = personality === "coward" ? 8 : 5;
    if (distToPlayer < flee) {
      target = wrap(head.x + (head.x - playerHead.x), head.y + (head.y - playerHead.y));
    }
  } else if (personality === "aggressive" && powerUp) {
    const puDist = wrapDist(head.x, head.y, powerUp.pos.x, powerUp.pos.y, cols, rows);
    if (puDist < 8) target = powerUp.pos;
  } else if (powerUp) {
    const foodDist = wrapDist(head.x, head.y, food.x, food.y, cols, rows);
    const puDist = wrapDist(head.x, head.y, powerUp.pos.x, powerUp.pos.y, cols, rows);
    if (puDist < foodDist + 5) target = powerUp.pos;
  }

  const safe = DIRS4.filter(c => {
    if (c.dir === OPPOSITE[currentDir]) return false;
    const n = wrap(head.x + c.dx, head.y + c.dy);
    return isGhost || !bodySet.has(k(n.x, n.y));
  });
  if (safe.length === 0) return currentDir;

  // ── Easy / medium: original light behaviour ──
  if (difficulty === "easy" || difficulty === "medium") {
    const floodCap = difficulty === "easy" ? 10 : 60;
    const flood = (sx: number, sy: number): number => {
      const seen = new Set<string>([k(sx, sy)]);
      const q: Point[] = [{ x: sx, y: sy }];
      let count = 0;
      while (q.length && count < floodCap) {
        const p = q.shift()!; count++;
        for (const [ddx, ddy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
          const f = wrap(p.x + ddx, p.y + ddy);
          const key = k(f.x, f.y);
          if (!seen.has(key) && !bodySet.has(key)) { seen.add(key); q.push(f); }
        }
      }
      return count;
    };
    safe.sort((a, b) => {
      const an = wrap(head.x + a.dx, head.y + a.dy), bn = wrap(head.x + b.dx, head.y + b.dy);
      if (difficulty === "medium") {
        const fA = flood(an.x, an.y), fB = flood(bn.x, bn.y);
        if (fA < snake.length && fB >= snake.length) return 1;
        if (fB < snake.length && fA >= snake.length) return -1;
      }
      return wrapDist(an.x, an.y, target.x, target.y, cols, rows) - wrapDist(bn.x, bn.y, target.x, target.y, cols, rows);
    });
    return safe[0].dir;
  }

  // ════════ HARD / INSANE: survival-first planner ════════
  const cellCount = cols * rows;
  const cap = difficulty === "insane" ? cellCount : 320;

  // Flood-fill reachable space from a start cell given a blocked set.
  const reachable = (sx: number, sy: number, blocked: Set<string>): number => {
    if (blocked.has(k(sx, sy))) return 0;
    const seen = new Set<string>([k(sx, sy)]);
    const q: Point[] = [{ x: sx, y: sy }];
    let count = 0;
    while (q.length && count < cap) {
      const p = q.shift()!; count++;
      for (const [ddx, ddy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const f = wrap(p.x + ddx, p.y + ddy);
        const key = k(f.x, f.y);
        if (!seen.has(key) && !blocked.has(key)) { seen.add(key); q.push(f); }
      }
    }
    return count;
  };

  // BFS: is `goal` reachable from (sx,sy) avoiding `blocked`?
  const canReach = (sx: number, sy: number, goal: Point, blocked: Set<string>): boolean => {
    if (sx === goal.x && sy === goal.y) return true;
    const seen = new Set<string>([k(sx, sy)]);
    const q: Point[] = [{ x: sx, y: sy }];
    let guard = 0;
    while (q.length && guard++ < cellCount) {
      const p = q.shift()!;
      for (const [ddx, ddy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const f = wrap(p.x + ddx, p.y + ddy);
        if (f.x === goal.x && f.y === goal.y) return true;
        const key = k(f.x, f.y);
        if (!seen.has(key) && !blocked.has(key)) { seen.add(key); q.push(f); }
      }
    }
    return false;
  };

  // Score each candidate by simulating the move.
  const evaluate = (c: { dir: Dir; dx: number; dy: number }) => {
    const n = wrap(head.x + c.dx, head.y + c.dy);
    const eats = n.x === food.x && n.y === food.y;
    // Body after the move: new head in front, tail vacates UNLESS we just ate.
    const newBody = [n, ...snake];
    if (!eats) newBody.pop();
    const blocked = new Set<string>();
    for (let i = 0; i < newBody.length - 1; i++) blocked.add(k(newBody[i].x, newBody[i].y));
    for (const seg of otherSnake) blocked.add(k(seg.x, seg.y));
    const newTail = newBody[newBody.length - 1];
    const space = reachable(n.x, n.y, blocked);
    // Survivable if the snake can still trace a route to its own tail.
    const tailReachable = isGhost || canReach(n.x, n.y, newTail, blocked);
    const dist = wrapDist(n.x, n.y, target.x, target.y, cols, rows);
    // Insane hates hugging the rail (fewer escape routes near the wrap seam
    // only matters when space is already tight).
    const edgePenalty = difficulty === "insane" && space < snake.length + 4
      ? (n.x === 0 || n.x === cols - 1 || n.y === 0 || n.y === rows - 1 ? 1 : 0)
      : 0;
    return { dir: c.dir, space, tailReachable, dist, edgePenalty };
  };

  const scored = safe.map(evaluate);

  scored.sort((a, b) => {
    // 1. Never trap yourself: survivable moves win outright.
    if (a.tailReachable !== b.tailReachable) return a.tailReachable ? -1 : 1;
    // 2. Among survivable moves, when space is tight, maximise breathing room.
    const tight = snake.length + 6;
    if (a.space < tight || b.space < tight) {
      if (b.space !== a.space) return b.space - a.space;
    }
    // 3. Otherwise head straight for the target.
    if (a.dist !== b.dist) return a.dist - b.dist;
    return a.edgePenalty - b.edgePenalty;
  });

  // If every move is a death-trap, pick the one with the most space (delay).
  if (!scored.some(s => s.tailReachable)) {
    scored.sort((a, b) => b.space - a.space);
  }

  return scored[0].dir;
}

// ══════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════
const DecoySnakeGame = memo(function DecoySnakeGame({ hint, onPinEntered, onBypass }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [level, setLevel] = useState(1);
  const [combo, setCombo] = useState(0);
  const [activePowerUp, setActivePowerUp] = useState<PowerUpType | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const autoPlayRef = useRef(false);
  const [showAI2, setShowAI2] = useState(false);
  const showAI2Ref = useRef(false);
  const [snakeTheme, setSnakeTheme] = useState<SnakeTheme>("neon");
  const snakeThemeRef = useRef<SnakeTheme>("neon");
  const [snakeSkin, setSnakeSkin] = useState<SnakeSkin>("solid");
  const snakeSkinRef = useRef<SnakeSkin>("solid");
  const [gameMode, setGameMode] = useState<GameMode>("normal");
  const gameModeRef = useRef<GameMode>("normal");
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>("medium");
  const aiDifficultyRef = useRef<AIDifficulty>("medium");
  const [aiPersonality, setAiPersonality] = useState<AIPersonality>("normal");
  const aiPersonalityRef = useRef<AIPersonality>("normal");
  const failedAttemptsRef = useRef(0);
  const hintClickCountRef = useRef(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem("cybervault_snake_highscore");
    return saved ? Number(saved) : 0;
  });

  // Stats & achievements
  const statsRef = useRef<SnakeStats>(loadStats());
  const [stats, setStatsState] = useState<SnakeStats>(statsRef.current);
  const unlockedRef = useRef<Set<string>>(loadUnlocked());
  const [unlocked, setUnlocked] = useState<Set<string>>(unlockedRef.current);
  const [newAchievement, setNewAchievement] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState<"stats" | "achievements" | null>(null);
  const gameStartTimeRef = useRef(Date.now());

  // Hidden PIN buffer
  const pinBufferRef = useRef("");
  const pinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Player snake state
  const snakeRef = useRef<Point[]>([{ x: 25, y: 16 }, { x: 24, y: 16 }, { x: 23, y: 16 }]);
  const dirRef = useRef<Dir>("RIGHT");
  const nextDirRef = useRef<Dir>("RIGHT");
  const foodRef = useRef<Point>(randomPos(snakeRef.current));
  const foodTypeRef = useRef<FoodType>(pickFood());
  const food2Ref = useRef<Point>(randomPos([...snakeRef.current, foodRef.current]));
  const food2TypeRef = useRef<FoodType>(pickFood());
  const gameOverRef = useRef(false);
  const scoreRef = useRef(0);
  const speedRef = useRef(110);
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickCountRef = useRef(0);
  const levelRef = useRef(1);
  const comboRef = useRef(0);
  const comboTimerRef = useRef(0);
  const foodEatenRef = useRef(0);

  // Screen shake
  const shakeRef = useRef(0);

  // Challenge mode
  const challengeMarginRef = useRef(0);
  const challengeTickRef = useRef(0);
  const challengeTimeRef = useRef(0);

  // Clone
  const cloneSnakeRef = useRef<Point[] | null>(null);
  const cloneDirRef = useRef<Dir>("RIGHT");
  const cloneScoreRef = useRef(0);
  const cloneTimerRef = useRef(0);

  // AI Snake 2 / Player 2 state
  const ai2SnakeRef = useRef<Point[]>([{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]);
  const ai2DirRef = useRef<Dir>("RIGHT");
  const ai2NextDirRef = useRef<Dir>("RIGHT");
  const ai2ScoreRef = useRef(0);
  const [ai2Score, setAi2Score] = useState(0);
  const ai2ActivePowerUpRef = useRef<{ type: PowerUpType; remaining: number } | null>(null);
  const ai2FoodEatenRef = useRef(0);

  // Power-up state
  const powerUpRef = useRef<PowerUp | null>(null);
  const activePowerUpRef = useRef<{ type: PowerUpType; remaining: number } | null>(null);

  // Shield (survive one death) and freeze (stop AI2) refs
  const shieldRef = useRef(false);
  const [hasShield, setHasShield] = useState(false);
  const freezeRef = useRef(0);

  // Pause / sound / extras
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("cybervault_snake_sound") !== "false");
  const [showFps, setShowFps] = useState(false);
  const showFpsRef = useRef(false);
  const fpsRef = useRef({ frames: 0, last: performance.now(), fps: 0 });

  // Dramatic visual effects
  const ripplesRef = useRef<{ x: number; y: number; born: number; color: string; max: number }[]>([]);
  const starsRef = useRef<{ x: number; y: number; z: number }[]>([]);
  const bannerRef = useRef<{ text: string; born: number; color: string } | null>(null);
  const flashRef = useRef<{ born: number; color: string } | null>(null);
  const levelFlashRef = useRef(0);

  // Particles & trail
  const particlesRef = useRef<Particle[]>([]);
  const trailRef = useRef<{ x: number; y: number; alpha: number; color: string }[]>([]);

  // Trigger a full-screen banner (level up, milestones).
  const showBanner = useCallback((text: string, color: string) => {
    bannerRef.current = { text, born: tickCountRef.current, color };
  }, []);
  // Trigger an expanding ripple ring at a cell.
  const ripple = useCallback((x: number, y: number, color: string, max = 40) => {
    ripplesRef.current.push({ x: x * CELL + CELL / 2, y: y * CELL + CELL / 2, born: tickCountRef.current, color, max });
  }, []);

  const spawnParticles = useCallback((x: number, y: number, color: string, count: number) => {
    const np: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const spd = 1.5 + Math.random() * 3;
      np.push({
        x: x * CELL + CELL / 2, y: y * CELL + CELL / 2,
        vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
        life: 30 + Math.random() * 20, maxLife: 50, color, size: 2 + Math.random() * 3,
      });
    }
    particlesRef.current = [...particlesRef.current, ...np];
  }, []);

  // Death explosion: each segment becomes a particle
  const deathExplosion = useCallback((snake: Point[], color: string) => {
    const head = snake[0];
    for (const seg of snake) {
      const angle = Math.atan2(seg.y - head.y, seg.x - head.x) + (Math.random() - 0.5) * 1.5;
      const spd = 2 + Math.random() * 4;
      particlesRef.current.push({
        x: seg.x * CELL + CELL / 2, y: seg.y * CELL + CELL / 2,
        vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
        life: 40 + Math.random() * 30, maxLife: 70, color, size: CELL / 3,
      });
    }
    shakeRef.current = 15;
  }, []);

  const updateStats = useCallback((partial: Partial<SnakeStats>) => {
    const s = statsRef.current;
    Object.assign(s, partial);
    // Update bests
    if (partial.totalScore !== undefined || partial.bestScore !== undefined) {
      s.bestScore = Math.max(s.bestScore, scoreRef.current);
    }
    statsRef.current = { ...s };
    saveStats(s);
    setStatsState({ ...s });
  }, []);

  const checkAchievements = useCallback(() => {
    const gameData = {
      score: scoreRef.current,
      level: levelRef.current,
      combo: comboRef.current,
      length: snakeRef.current.length,
      challengeTime: challengeTimeRef.current,
    };
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (!unlockedRef.current.has(a.id) && a.check(statsRef.current, gameData)) {
        unlockedRef.current.add(a.id);
        changed = true;
        setNewAchievement(a.label);
        setTimeout(() => setNewAchievement(null), 3000);
      }
    }
    if (changed) {
      saveUnlocked(unlockedRef.current);
      setUnlocked(new Set(unlockedRef.current));
    }
  }, []);

  const resetGame = useCallback(() => {
    // Record stats for ended game — only for manual play (not AI)
    const elapsed = (Date.now() - gameStartTimeRef.current) / 1000;
    if (!autoPlayRef.current && (scoreRef.current > 0 || foodEatenRef.current > 0)) {
      const s = statsRef.current;
      s.totalGames++;
      s.totalScore += scoreRef.current;
      s.totalFood += foodEatenRef.current;
      s.totalTime += elapsed;
      s.bestScore = Math.max(s.bestScore, scoreRef.current);
      s.bestLevel = Math.max(s.bestLevel, levelRef.current);
      s.bestCombo = Math.max(s.bestCombo, comboRef.current);
      s.longestSnake = Math.max(s.longestSnake, snakeRef.current.length);
      if (gameModeRef.current === "challenge") {
        s.challengeBestTime = Math.max(s.challengeBestTime, challengeTimeRef.current);
      }
      saveStats(s);
      setStatsState({ ...s });
    }

    snakeRef.current = [{ x: 25, y: 16 }, { x: 24, y: 16 }, { x: 23, y: 16 }];
    dirRef.current = "RIGHT";
    nextDirRef.current = "RIGHT";
    foodRef.current = randomPos(snakeRef.current);
    foodTypeRef.current = pickFood();
    food2Ref.current = randomPos([...snakeRef.current, foodRef.current]);
    food2TypeRef.current = pickFood();
    gameOverRef.current = false;
    scoreRef.current = 0;
    speedRef.current = 110;
    tickCountRef.current = 0;
    levelRef.current = 1;
    comboRef.current = 0;
    comboTimerRef.current = 0;
    foodEatenRef.current = 0;
    powerUpRef.current = null;
    activePowerUpRef.current = null;
    shieldRef.current = false;
    setHasShield(false);
    freezeRef.current = 0;
    ripplesRef.current = [];
    bannerRef.current = null;
    flashRef.current = null;
    levelFlashRef.current = 0;
    particlesRef.current = [];
    trailRef.current = [];
    shakeRef.current = 0;
    challengeMarginRef.current = 0;
    challengeTickRef.current = 0;
    challengeTimeRef.current = 0;
    cloneSnakeRef.current = null;
    cloneScoreRef.current = 0;
    cloneTimerRef.current = 0;
    gameStartTimeRef.current = Date.now();

    ai2SnakeRef.current = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    ai2DirRef.current = "RIGHT";
    ai2NextDirRef.current = "RIGHT";
    ai2ScoreRef.current = 0;
    ai2ActivePowerUpRef.current = null;
    ai2FoodEatenRef.current = 0;
    setAi2Score(0);
    setScore(0);
    setGameOver(false);
    setLevel(1);
    setCombo(0);
    setActivePowerUp(null);
  }, []);

  // ── Draw snake with skin ──
  const drawSnake = useCallback((
    ctx: CanvasRenderingContext2D, snake: Point[], dir: Dir,
    headColor: string, bodyColor: string, glowColor: string,
    isGhostMode: boolean, isDoubleMode: boolean, bgColor: string,
    skin: SnakeSkin, tick: number,
  ) => {
    snake.forEach((seg, i) => {
      const isHead = i === 0;
      const alpha = 1 - (i / snake.length) * 0.6;

      if (isHead) {
        ctx.shadowColor = isGhostMode ? "#aa44ff" : isDoubleMode ? "#44ff44" : glowColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = isGhostMode ? "#bb66ff" : isDoubleMode ? "#66ff66" : headColor;
      } else {
        ctx.shadowBlur = 0;
        if (isGhostMode) {
          ctx.fillStyle = `rgba(170, 68, 255, ${alpha})`;
        } else if (skin === "striped") {
          ctx.fillStyle = i % 2 === 0 ? bodyColor : headColor;
        } else if (skin === "gradient") {
          const hue = (i * 12 + tick * 2) % 360;
          ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
        } else {
          ctx.fillStyle = bodyColor;
        }
        ctx.globalAlpha = alpha;
      }

      const pad = isHead ? 1 : 2;
      if (skin === "dotted" && !isHead) {
        ctx.beginPath();
        ctx.arc(seg.x * CELL + CELL / 2, seg.y * CELL + CELL / 2, (CELL - pad * 2) / 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (skin === "pulsing" && !isHead) {
        const pulse = Math.sin(tick * 0.15 + i * 0.5) * 2;
        ctx.fillRect(seg.x * CELL + pad - pulse / 2, seg.y * CELL + pad - pulse / 2, CELL - pad * 2 + pulse, CELL - pad * 2 + pulse);
      } else {
        ctx.fillRect(seg.x * CELL + pad, seg.y * CELL + pad, CELL - pad * 2, CELL - pad * 2);
      }

      if (isHead) {
        ctx.fillStyle = bgColor;
        const eyeSize = 2.5;
        const cx = seg.x * CELL + CELL / 2;
        const cy = seg.y * CELL + CELL / 2;
        let ex1 = 0, ey1 = 0, ex2 = 0, ey2 = 0;
        if (dir === "RIGHT") { ex1 = cx + 3; ey1 = cy - 3; ex2 = cx + 3; ey2 = cy + 3; }
        else if (dir === "LEFT") { ex1 = cx - 3; ey1 = cy - 3; ex2 = cx - 3; ey2 = cy + 3; }
        else if (dir === "UP") { ex1 = cx - 3; ey1 = cy - 3; ex2 = cx + 3; ey2 = cy - 3; }
        else { ex1 = cx - 3; ey1 = cy + 3; ex2 = cx + 3; ey2 = cy + 3; }
        ctx.beginPath(); ctx.arc(ex1, ey1, eyeSize, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex2, ey2, eyeSize, 0, Math.PI * 2); ctx.fill();

        if (isGhostMode) {
          ctx.strokeStyle = `rgba(170, 68, 255, ${0.4 + Math.sin(tick * 0.15) * 0.3})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(cx, cy, CELL / 1.5, 0, Math.PI * 2); ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    });
  }, []);

  // ── Draw ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const t = SNAKE_THEMES[snakeThemeRef.current];
    const isGhost = activePowerUpRef.current?.type === "ghost";
    const tc = tickCountRef.current;
    const skin = snakeSkinRef.current;
    const mode = gameModeRef.current;

    // Screen shake offset
    const shk = shakeRef.current;
    const sx = shk > 0 ? (Math.random() - 0.5) * shk : 0;
    const sy = shk > 0 ? (Math.random() - 0.5) * shk : 0;
    if (shk > 0) shakeRef.current = Math.max(0, shk - 1);

    ctx.save();
    ctx.translate(sx, sy);

    // Background
    ctx.fillStyle = t.bg;
    ctx.fillRect(-10, -10, WIDTH + 20, HEIGHT + 20);

    // Parallax starfield drifting toward the snake's heading — depth & motion.
    if (starsRef.current.length) {
      const d = dirRef.current;
      const vx = d === "LEFT" ? 1 : d === "RIGHT" ? -1 : 0;
      const vy = d === "UP" ? 1 : d === "DOWN" ? -1 : 0;
      for (const s of starsRef.current) {
        s.x += vx * s.z * 1.4; s.y += vy * s.z * 1.4;
        if (s.x < 0) s.x += WIDTH; else if (s.x > WIDTH) s.x -= WIDTH;
        if (s.y < 0) s.y += HEIGHT; else if (s.y > HEIGHT) s.y -= HEIGHT;
        ctx.globalAlpha = 0.15 + s.z * 0.35;
        ctx.fillStyle = t.accent;
        ctx.fillRect(s.x, s.y, s.z * 1.6, s.z * 1.6);
      }
      ctx.globalAlpha = 1;
    }

    // Level-up screen flash (brief radial bloom).
    if (levelFlashRef.current > 0) {
      const a = levelFlashRef.current / 20;
      const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 0, WIDTH / 2, HEIGHT / 2, WIDTH / 1.4);
      g.addColorStop(0, `${t.accent}${Math.floor(a * 40).toString(16).padStart(2, "0")}`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      levelFlashRef.current--;
    }

    // Grid lines
    const gridPulse = 0.2 + Math.sin(tc * 0.03) * 0.1;
    ctx.strokeStyle = t.gridLine;
    ctx.lineWidth = gridPulse;
    for (let x = 0; x <= WIDTH; x += CELL) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke(); }
    for (let y = 0; y <= HEIGHT; y += CELL) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke(); }

    // Challenge mode: draw shrinking border
    if (mode === "challenge" && challengeMarginRef.current > 0) {
      const m = challengeMarginRef.current;
      ctx.fillStyle = "rgba(255,0,0,0.15)";
      ctx.fillRect(0, 0, m * CELL, HEIGHT);
      ctx.fillRect(WIDTH - m * CELL, 0, m * CELL, HEIGHT);
      ctx.fillRect(m * CELL, 0, WIDTH - m * CELL * 2, m * CELL);
      ctx.fillRect(m * CELL, HEIGHT - m * CELL, WIDTH - m * CELL * 2, m * CELL);
      ctx.strokeStyle = `rgba(255,60,60,${0.5 + Math.sin(tc * 0.1) * 0.3})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(m * CELL, m * CELL, WIDTH - m * CELL * 2, HEIGHT - m * CELL * 2);
    }

    // Ghost mode border
    if (isGhost) {
      ctx.strokeStyle = `rgba(170, 68, 255, ${0.4 + Math.sin(tc * 0.1) * 0.3})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);
    }

    // Trail (always-on, brighter in ghost mode)
    for (const tr of trailRef.current) {
      ctx.fillStyle = tr.color.replace(/[\d.]+\)$/, `${tr.alpha * (isGhost ? 0.4 : 0.15)})`);
      ctx.fillRect(tr.x * CELL + 4, tr.y * CELL + 4, CELL - 8, CELL - 8);
    }

    // Food — very bright with glowing background circle
    const drawFood = (fp: Point, ftype: FoodType) => {
      const fx = fp.x * CELL + CELL / 2;
      const fy = fp.y * CELL + CELL / 2;
      // Bright pulsing background circle
      const pulse = Math.sin(tc * 0.15) * 0.3 + 0.7;
      ctx.shadowColor = ftype.color;
      ctx.shadowBlur = 22;
      ctx.fillStyle = ftype.color + "50";
      ctx.beginPath();
      ctx.arc(fx, fy, CELL / 2 + 2, 0, Math.PI * 2);
      ctx.fill();
      // Inner bright circle
      ctx.shadowBlur = 14;
      ctx.fillStyle = ftype.color + "30";
      ctx.beginPath();
      ctx.arc(fx, fy, CELL / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
      // White highlight ring
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255,255,255,${0.3 * pulse})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(fx, fy, CELL / 2 + 1, 0, Math.PI * 2);
      ctx.stroke();
      // Emoji
      ctx.shadowColor = ftype.color;
      ctx.shadowBlur = 20 + Math.sin(tc * 0.15) * 10;
      ctx.font = `${CELL}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ftype.emoji, fx, fy + 1);
      ctx.shadowBlur = 0;
    };
    drawFood(foodRef.current, foodTypeRef.current);
    drawFood(food2Ref.current, food2TypeRef.current);

    // Power-up (bright & visible)
    const pu = powerUpRef.current;
    if (pu) {
      const puColor = POWER_UP_COLORS[pu.type];
      const px = pu.pos.x * CELL + CELL / 2;
      const py = pu.pos.y * CELL + CELL / 2;
      const sz = CELL / 2.2;
      // Outer glow ring
      ctx.shadowColor = puColor;
      ctx.shadowBlur = 18 + Math.sin(tc * 0.2) * 8;
      ctx.fillStyle = puColor + "40";
      ctx.beginPath();
      ctx.arc(px, py, sz + 3, 0, Math.PI * 2);
      ctx.fill();
      // Inner diamond
      ctx.shadowBlur = 14 + Math.sin(tc * 0.2) * 6;
      ctx.fillStyle = puColor;
      ctx.beginPath();
      ctx.moveTo(px, py - sz); ctx.lineTo(px + sz, py); ctx.lineTo(px, py + sz); ctx.lineTo(px - sz, py);
      ctx.closePath(); ctx.fill();
      // Bright border
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py - sz); ctx.lineTo(px + sz, py); ctx.lineTo(px, py + sz); ctx.lineTo(px - sz, py);
      ctx.closePath(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = t.bg;
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const icon = pu.type === "speed" ? "S" : pu.type === "ghost" ? "G" : pu.type === "magnet" ? "M"
        : pu.type === "double" ? "2" : pu.type === "shrink" ? "-" : pu.type === "hyper" ? "H" : "C";
      ctx.fillText(icon, px, py + 1);
      ctx.textBaseline = "alphabetic";
    }

    // Player snake
    const isDouble = activePowerUpRef.current?.type === "double";
    drawSnake(ctx, snakeRef.current, dirRef.current, t.head, t.body, t.glow, !!isGhost, !!isDouble, t.bg, skin, tc);

    // Clone snake
    if (cloneSnakeRef.current) {
      drawSnake(ctx, cloneSnakeRef.current, cloneDirRef.current,
        t.head + "88", t.body + "66", t.glow, false, false, t.bg, skin, tc);
    }

    // AI2 / Player 2
    if ((showAI2Ref.current || gameModeRef.current === "2player") && ai2SnakeRef.current.length > 0) {
      const ai2Ghost = ai2ActivePowerUpRef.current?.type === "ghost";
      const ai2Double = ai2ActivePowerUpRef.current?.type === "double";
      drawSnake(ctx, ai2SnakeRef.current, ai2DirRef.current, "#ff6600", "#cc4400", "#ff8833", !!ai2Ghost, !!ai2Double, t.bg, "striped", tc);
    }

    // Expanding ripple rings (food / power-up pickups).
    ripplesRef.current = ripplesRef.current.filter(r => tc - r.born < 22);
    for (const r of ripplesRef.current) {
      const prog = (tc - r.born) / 22;
      ctx.globalAlpha = (1 - prog) * 0.7;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2 * (1 - prog);
      ctx.beginPath();
      ctx.arc(r.x, r.y, prog * r.max, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Shield aura around the player's head.
    if (shieldRef.current && snakeRef.current.length) {
      const h = snakeRef.current[0];
      const cx = h.x * CELL + CELL / 2, cy = h.y * CELL + CELL / 2;
      ctx.strokeStyle = `rgba(0,221,255,${0.5 + Math.sin(tc * 0.2) * 0.3})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.9, 0, Math.PI * 2); ctx.stroke();
    }

    // Particles
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    for (const p of particlesRef.current) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2); ctx.fill();
      p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy *= 0.96; p.life--;
    }
    ctx.globalAlpha = 1;

    // Combo text
    if (comboRef.current >= 2) {
      ctx.fillStyle = `rgba(255, 204, 0, ${0.5 + Math.sin(tc * 0.2) * 0.3})`;
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`x${comboRef.current} COMBO!`, WIDTH - 8, 18);
    }

    // HUD
    ctx.fillStyle = t.mutedText;
    ctx.font = "14px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`LVL ${levelRef.current}`, 6, 18);

    if (mode === "challenge") {
      ctx.fillStyle = "#ff4444";
      ctx.textAlign = "center";
      ctx.fillText(`CHALLENGE: ${Math.floor(challengeTimeRef.current)}s`, WIDTH / 2, 18);
    }

    // Power-up timer bar
    const ap = activePowerUpRef.current;
    if (ap) {
      const bw = 80, bh = 4, bx = WIDTH / 2 - bw / 2, by = HEIGHT - 10;
      const ratio = ap.remaining / (ap.type === "hyper" ? HYPER_DURATION : ap.type === "clone" ? CLONE_DURATION : POWER_UP_DURATION);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = POWER_UP_COLORS[ap.type];
      ctx.fillRect(bx, by, bw * ratio, bh);
    }

    // Game over overlay
    if (gameOverRef.current) {
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(-10, -10, WIDTH + 20, HEIGHT + 20);
      ctx.fillStyle = t.head;
      ctx.font = "bold 26px monospace";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", WIDTH / 2, HEIGHT / 2 - 40);
      ctx.fillStyle = t.mutedText;
      ctx.font = "15px monospace";
      ctx.fillText(`Score: ${scoreRef.current}`, WIDTH / 2, HEIGHT / 2 - 5);
      ctx.fillText(`Level: ${levelRef.current}`, WIDTH / 2, HEIGHT / 2 + 18);
      if (comboRef.current >= 2) {
        ctx.fillStyle = "#ffcc00";
        ctx.fillText(`Best combo: x${comboRef.current}`, WIDTH / 2, HEIGHT / 2 + 41);
      }
      if (mode === "challenge") {
        ctx.fillStyle = "#ff6644";
        ctx.fillText(`Survived: ${Math.floor(challengeTimeRef.current)}s`, WIDTH / 2, HEIGHT / 2 + 64);
      }
      ctx.fillStyle = t.mutedText;
      ctx.fillText("Press SPACE to restart", WIDTH / 2, HEIGHT / 2 + 90);
    }

    // Freeze tint overlay while the rival is frozen.
    if (freezeRef.current > 0) {
      ctx.fillStyle = `rgba(136,204,255,${0.06 + Math.sin(tc * 0.2) * 0.03})`;
      ctx.fillRect(-10, -10, WIDTH + 20, HEIGHT + 20);
    }

    // Shield-save / impact flash.
    if (flashRef.current) {
      const a = 1 - (tc - flashRef.current.born) / 12;
      if (a <= 0) flashRef.current = null;
      else { ctx.fillStyle = `rgba(0,221,255,${a * 0.3})`; ctx.fillRect(-10, -10, WIDTH + 20, HEIGHT + 20); }
    }

    // Big dramatic banner (level up, jackpot, combo milestones).
    if (bannerRef.current) {
      const age = tc - bannerRef.current.born;
      if (age > 36) bannerRef.current = null;
      else {
        const a = age < 6 ? age / 6 : age > 28 ? (36 - age) / 8 : 1;
        const scale = age < 6 ? 0.6 + (age / 6) * 0.4 : 1;
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        ctx.translate(WIDTH / 2, HEIGHT / 2 - 70);
        ctx.scale(scale, scale);
        ctx.shadowColor = bannerRef.current.color;
        ctx.shadowBlur = 24;
        ctx.fillStyle = bannerRef.current.color;
        ctx.font = "bold 34px monospace";
        ctx.textAlign = "center";
        ctx.fillText(bannerRef.current.text, 0, 0);
        ctx.restore();
        ctx.shadowBlur = 0;
      }
    }

    // CRT scanlines + vignette for cinematic grit.
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#000";
    for (let y = 0; y < HEIGHT; y += 3) ctx.fillRect(0, y, WIDTH, 1);
    ctx.globalAlpha = 1;
    const vg = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT / 3, WIDTH / 2, HEIGHT / 2, WIDTH / 1.2);
    vg.addColorStop(0, "transparent");
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Pause overlay.
    if (pausedRef.current && !gameOverRef.current) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(-10, -10, WIDTH + 20, HEIGHT + 20);
      ctx.fillStyle = t.titleColor;
      ctx.font = "bold 28px monospace";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", WIDTH / 2, HEIGHT / 2);
      ctx.fillStyle = t.mutedText;
      ctx.font = "13px monospace";
      ctx.fillText("Press P to resume", WIDTH / 2, HEIGHT / 2 + 28);
    }

    // FPS counter (toggle).
    if (showFpsRef.current) {
      const f = fpsRef.current;
      f.frames++;
      const now = performance.now();
      if (now - f.last >= 500) { f.fps = Math.round((f.frames * 1000) / (now - f.last)); f.frames = 0; f.last = now; }
      ctx.fillStyle = t.mutedText;
      ctx.font = "11px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${f.fps} FPS`, WIDTH - 6, HEIGHT - 6);
    }

    ctx.restore();
  }, [drawSnake]);

  // ── Game tick ──
  const tick = useCallback(() => {
    if (gameOverRef.current) {
      if (autoPlayRef.current) { resetGame(); } else { draw(); return; }
    }

    // Pause: keep rendering (so the PAUSED overlay shows) but freeze logic.
    if (pausedRef.current) {
      draw();
      tickRef.current = setTimeout(tick, 80);
      return;
    }

    tickCountRef.current++;
    const tc = tickCountRef.current;
    const mode = gameModeRef.current;
    const margin = challengeMarginRef.current;

    // Challenge mode: shrink border every ~500 ticks (~15s)
    if (mode === "challenge") {
      challengeTickRef.current++;
      challengeTimeRef.current += speedRef.current / 1000;
      if (challengeTickRef.current % 500 === 0 && margin < Math.floor(Math.min(COLS, ROWS) / 2) - 2) {
        challengeMarginRef.current++;
      }
    }

    // Auto-play AI
    if (autoPlayRef.current) {
      const isGh = activePowerUpRef.current?.type === "ghost";
      nextDirRef.current = smartAI(
        snakeRef.current[0], snakeRef.current, nearestFood(snakeRef.current[0], foodRef.current, food2Ref.current), powerUpRef.current,
        dirRef.current, !!isGh,
        showAI2Ref.current ? ai2SnakeRef.current : [],
        aiDifficultyRef.current, aiPersonalityRef.current,
        showAI2Ref.current ? ai2SnakeRef.current[0] : undefined,
      );
    }

    dirRef.current = nextDirRef.current;
    const snake = snakeRef.current;
    const head = snake[0];
    const dir = dirRef.current;

    let nx = head.x, ny = head.y;
    if (dir === "UP") ny--; else if (dir === "DOWN") ny++; else if (dir === "LEFT") nx--; else nx++;

    const isGhost = activePowerUpRef.current?.type === "ghost";

    // Wall wrap (or challenge border death)
    if (mode === "challenge") {
      if (nx < margin || nx >= COLS - margin || ny < margin || ny >= ROWS - margin) {
        if (!isGhost) {
          if (shieldRef.current) {
            // Shield absorbs the hit: bounce back inside, consume the shield.
            shieldRef.current = false; setHasShield(false);
            SFX.shield(); shakeRef.current = 10; flashRef.current = { born: tc, color: "#00ddff" };
            nx = Math.min(COLS - margin - 1, Math.max(margin, head.x));
            ny = Math.min(ROWS - margin - 1, Math.max(margin, head.y));
          } else {
            gameOverRef.current = true;
            setGameOver(true);
            SFX.death();
            deathExplosion(snake, SNAKE_THEMES[snakeThemeRef.current].head);
            if (scoreRef.current > highScore) {
              setHighScore(scoreRef.current);
              localStorage.setItem("cybervault_snake_highscore", String(scoreRef.current));
            }
            checkAchievements();
            draw();
            return;
          }
        }
      }
    }
    if (nx < 0) nx = COLS - 1; else if (nx >= COLS) nx = 0;
    if (ny < 0) ny = ROWS - 1; else if (ny >= ROWS) ny = 0;

    // Collision (exclude own tail — it will vacate this tick unless food is eaten,
    // but food can't spawn on the tail, so tail collision is always a false positive)
    const otherBodies = (showAI2Ref.current || mode === "2player") ? ai2SnakeRef.current : [];
    const allBodies = [...snake.slice(0, -1), ...otherBodies.slice(1)];
    if (!isGhost && allBodies.some(s => s.x === nx && s.y === ny)) {
      if (shieldRef.current) {
        // Shield saves the run: consume it, phase through this one tick.
        shieldRef.current = false; setHasShield(false);
        SFX.shield(); shakeRef.current = 12; flashRef.current = { born: tc, color: "#00ddff" };
      } else {
        gameOverRef.current = true;
        setGameOver(true);
        SFX.death();
        deathExplosion(snake, SNAKE_THEMES[snakeThemeRef.current].head);
        if (scoreRef.current > highScore) {
          setHighScore(scoreRef.current);
          localStorage.setItem("cybervault_snake_highscore", String(scoreRef.current));
        }
        checkAchievements();
        draw();
        return;
      }
    }

    // Always-on trail
    const thm = SNAKE_THEMES[snakeThemeRef.current];
    trailRef.current.push({ x: head.x, y: head.y, alpha: 1, color: isGhost ? "rgba(170,68,255,1)" : `rgba(${parseInt(thm.body.slice(1,3),16)},${parseInt(thm.body.slice(3,5),16)},${parseInt(thm.body.slice(5,7),16)},1)` });
    trailRef.current = trailRef.current.map(tr => ({ ...tr, alpha: tr.alpha - 0.08 })).filter(tr => tr.alpha > 0);

    const newSnake = [{ x: nx, y: ny }, ...snake];

    // Magnet (pulls nearest food)
    if (activePowerUpRef.current?.type === "magnet") {
      for (const fRef of [foodRef, food2Ref]) {
        const fd = fRef.current;
        const dx = nx - fd.x, dy = ny - fd.y;
        if (Math.abs(dx) + Math.abs(dy) > 1) {
          fRef.current = { x: fd.x + Math.sign(dx), y: fd.y + Math.sign(dy) };
        }
      }
    }

    // Eat food (check both food items)
    let ateFood = false;
    const eatCheck = (fRef: React.MutableRefObject<Point>, ftRef: React.MutableRefObject<FoodType>) => {
      if (nx === fRef.current.x && ny === fRef.current.y) {
        foodEatenRef.current++;
        const isDouble = activePowerUpRef.current?.type === "double";
        if (comboTimerRef.current > 0) comboRef.current++; else comboRef.current = 1;
        comboTimerRef.current = 40;
        setCombo(comboRef.current);

        const pts = ftRef.current.points * comboRef.current * (isDouble ? 2 : 1);
        scoreRef.current += pts;
        setScore(scoreRef.current);
        spawnParticles(nx, ny, ftRef.current.color, 8);
        ripple(nx, ny, ftRef.current.color);
        // Sound + extra drama for high-value food.
        if (ftRef.current.points >= 50) {
          SFX.bigEat();
          if (ftRef.current.emoji === "👑") { statsRef.current.crownsEaten++; showBanner("JACKPOT!", "#ffd700"); shakeRef.current = 8; }
        } else {
          SFX.eat(comboRef.current);
        }
        if (comboRef.current >= 2) SFX.combo(comboRef.current);
        // Combo milestone fanfare.
        if (comboRef.current === 5 || comboRef.current === 10) {
          showBanner(`x${comboRef.current} COMBO!`, "#ff8800");
          shakeRef.current = Math.max(shakeRef.current, comboRef.current);
        }

        if (foodEatenRef.current % 5 === 0) {
          levelRef.current++;
          setLevel(levelRef.current);
          spawnParticles(nx, ny, "#ffcc00", 15);
          levelFlashRef.current = 20;
          showBanner(`LEVEL ${levelRef.current}`, SNAKE_THEMES[snakeThemeRef.current].accent);
          SFX.levelUp();
        }

        const excl = [...newSnake, ...(showAI2Ref.current || mode === "2player" ? ai2SnakeRef.current : []), foodRef.current, food2Ref.current];
        fRef.current = randomPos(excl, COLS, ROWS, mode === "challenge" ? margin : 0);
        ftRef.current = pickFood();

        const minSpeed = Math.max(35, 70 - levelRef.current * 2);
        speedRef.current = Math.max(minSpeed, speedRef.current - 1.5);

        statsRef.current.longestSnake = Math.max(statsRef.current.longestSnake, newSnake.length);
        checkAchievements();
        ateFood = true;
      }
    };
    eatCheck(foodRef, foodTypeRef);
    if (!ateFood) eatCheck(food2Ref, food2TypeRef);
    if (!ateFood) {
      newSnake.pop();
    }

    // Power-up collision (player)
    const pu = powerUpRef.current;
    if (pu && nx === pu.pos.x && ny === pu.pos.y) {
      spawnParticles(nx, ny, POWER_UP_COLORS[pu.type], 12);
      ripple(nx, ny, POWER_UP_COLORS[pu.type], 50);
      SFX.powerUp();
      powerUpRef.current = null;
      if (!autoPlayRef.current) statsRef.current.powerUpsCollected++;

      // Clean up clone if picking up a new power-up while clone is active
      if (activePowerUpRef.current?.type === "clone" && cloneSnakeRef.current && pu.type !== "clone") {
        scoreRef.current += cloneScoreRef.current;
        setScore(scoreRef.current);
        cloneSnakeRef.current = null;
        cloneScoreRef.current = 0;
      }
      // Restore speed if replacing speed/hyper power-up
      if (activePowerUpRef.current?.type === "speed") speedRef.current = Math.min(110, speedRef.current + 40);
      if (activePowerUpRef.current?.type === "hyper") speedRef.current = Math.min(110, speedRef.current + 60);

      if (pu.type === "shield") {
        shieldRef.current = true;
        setHasShield(true);
        showBanner("SHIELD UP", "#00ddff");
      } else if (pu.type === "freeze") {
        // Freeze the rival snake for ~3.5s.
        freezeRef.current = 120;
        showBanner("ENEMY FROZEN", "#88ccff");
      } else if (pu.type === "shrink") {
        // Cut 10% of snake
        const cut = Math.max(1, Math.floor(newSnake.length * 0.1));
        newSnake.splice(newSnake.length - cut, cut);
        spawnParticles(nx, ny, "#ff4444", 15);
      } else if (pu.type === "hyper") {
        activePowerUpRef.current = { type: "hyper", remaining: HYPER_DURATION };
        setActivePowerUp("hyper");
        speedRef.current = Math.max(20, speedRef.current - 60);
      } else if (pu.type === "clone") {
        activePowerUpRef.current = { type: "clone", remaining: CLONE_DURATION };
        setActivePowerUp("clone");
        cloneSnakeRef.current = [...newSnake.slice(0, 5)].map(p => ({ x: (p.x + 3) % COLS, y: p.y }));
        cloneDirRef.current = dirRef.current;
        cloneScoreRef.current = 0;
      } else {
        activePowerUpRef.current = { type: pu.type, remaining: POWER_UP_DURATION };
        setActivePowerUp(pu.type);
        if (pu.type === "speed") speedRef.current = Math.max(30, speedRef.current - 40);
      }
      checkAchievements();
    }

    // Clone snake tick
    if (cloneSnakeRef.current && activePowerUpRef.current?.type === "clone") {
      const cloneHead = cloneSnakeRef.current[0];
      const cloneDir = smartAI(
        cloneHead, cloneSnakeRef.current, nearestFood(cloneHead, foodRef.current, food2Ref.current), null,
        cloneDirRef.current, false, newSnake, "medium", "normal", undefined,
      );
      cloneDirRef.current = cloneDir;
      let cnx = cloneHead.x, cny = cloneHead.y;
      if (cloneDir === "UP") cny--; else if (cloneDir === "DOWN") cny++; else if (cloneDir === "LEFT") cnx--; else cnx++;
      if (cnx < 0) cnx = COLS - 1; else if (cnx >= COLS) cnx = 0;
      if (cny < 0) cny = ROWS - 1; else if (cny >= ROWS) cny = 0;

      const newClone = [{ x: cnx, y: cny }, ...cloneSnakeRef.current];
      let cloneAte = false;
      for (const [fRef, ftRef] of [[foodRef, foodTypeRef], [food2Ref, food2TypeRef]] as const) {
        if (cnx === fRef.current.x && cny === fRef.current.y) {
          cloneScoreRef.current += ftRef.current.points;
          spawnParticles(cnx, cny, "#00ffaa", 6);
          fRef.current = randomPos([...newSnake, ...newClone, foodRef.current, food2Ref.current], COLS, ROWS, mode === "challenge" ? margin : 0);
          ftRef.current = pickFood();
          cloneAte = true;
          break;
        }
      }
      if (!cloneAte) {
        newClone.pop();
      }
      cloneSnakeRef.current = newClone;
    }

    // Freeze countdown: while active the rival snake is held in place.
    if (freezeRef.current > 0) freezeRef.current--;

    // AI Snake 2 / Player 2 logic (skipped entirely while frozen)
    if ((showAI2Ref.current || mode === "2player") && freezeRef.current <= 0) {
      const ai2Snake = ai2SnakeRef.current;
      const ai2Head = ai2Snake[0];
      const ai2Ghost = ai2ActivePowerUpRef.current?.type === "ghost";

      if (mode !== "2player") {
        // AI controls
        ai2DirRef.current = smartAI(
          ai2Head, ai2Snake, nearestFood(ai2Head, foodRef.current, food2Ref.current), powerUpRef.current,
          ai2DirRef.current, !!ai2Ghost, newSnake,
          aiDifficultyRef.current, aiPersonalityRef.current, newSnake[0],
        );
      } else {
        // Player 2 uses ai2NextDirRef (set by keyboard)
        ai2DirRef.current = ai2NextDirRef.current;
      }

      const ai2Dir = ai2DirRef.current;
      let anx = ai2Head.x, any = ai2Head.y;
      if (ai2Dir === "UP") any--; else if (ai2Dir === "DOWN") any++; else if (ai2Dir === "LEFT") anx--; else anx++;
      if (anx < 0) anx = COLS - 1; else if (anx >= COLS) anx = 0;
      if (any < 0) any = ROWS - 1; else if (any >= ROWS) any = 0;

      // Challenge border check for AI2
      if (mode === "challenge" && !ai2Ghost && (anx < margin || anx >= COLS - margin || any < margin || any >= ROWS - margin)) {
        ai2SnakeRef.current = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
        ai2DirRef.current = "RIGHT";
        ai2NextDirRef.current = "RIGHT";
        ai2ActivePowerUpRef.current = null;
      } else {
        const ai2AllBodies = [...ai2Snake, ...newSnake.slice(1)];
        if (!ai2Ghost && ai2AllBodies.some(s => s.x === anx && s.y === any)) {
          if (mode === "2player") {
            // Player 2 dies — game over for them, respawn
            deathExplosion(ai2Snake, "#ff6600");
          }
          ai2SnakeRef.current = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
          ai2DirRef.current = "RIGHT";
          ai2NextDirRef.current = "RIGHT";
          ai2ActivePowerUpRef.current = null;
        } else {
          const newAi2 = [{ x: anx, y: any }, ...ai2Snake];
          let ai2Ate = false;
          for (const [fRef, ftRef] of [[foodRef, foodTypeRef], [food2Ref, food2TypeRef]] as const) {
            if (anx === fRef.current.x && any === fRef.current.y) {
              ai2FoodEatenRef.current++;
              ai2ScoreRef.current += ftRef.current.points;
              setAi2Score(ai2ScoreRef.current);
              spawnParticles(anx, any, "#ff6600", 8);
              fRef.current = randomPos([...newSnake, ...newAi2, foodRef.current, food2Ref.current], COLS, ROWS, mode === "challenge" ? margin : 0);
              ftRef.current = pickFood();
              ai2Ate = true;
              break;
            }
          }
          if (!ai2Ate) { newAi2.pop(); }

          const pu2 = powerUpRef.current;
          if (pu2 && anx === pu2.pos.x && any === pu2.pos.y) {
            ai2ActivePowerUpRef.current = { type: pu2.type, remaining: POWER_UP_DURATION };
            spawnParticles(anx, any, POWER_UP_COLORS[pu2.type], 12);
            powerUpRef.current = null;
          }
          ai2SnakeRef.current = newAi2;
        }
      }

      if (ai2ActivePowerUpRef.current) {
        ai2ActivePowerUpRef.current.remaining--;
        if (ai2ActivePowerUpRef.current.remaining <= 0) ai2ActivePowerUpRef.current = null;
      }
    }

    // Spawn power-ups
    if (!powerUpRef.current && tc % 70 === 0 && Math.random() < 0.55) {
      const types: PowerUpType[] = ["speed", "ghost", "magnet", "double", "shrink", "hyper", "clone", "shield", "freeze"];
      const type = types[Math.floor(Math.random() * types.length)];
      const excl = [...newSnake, foodRef.current, food2Ref.current, ...((showAI2Ref.current || mode === "2player") ? ai2SnakeRef.current : [])];
      powerUpRef.current = { pos: randomPos(excl, COLS, ROWS, mode === "challenge" ? margin : 0), type, spawnedAt: tc };
      SFX.spawn();
      ripple(powerUpRef.current.pos.x, powerUpRef.current.pos.y, POWER_UP_COLORS[type], 30);
    }

    // Despawn old power-up
    if (powerUpRef.current && tc - powerUpRef.current.spawnedAt > 150) powerUpRef.current = null;

    // Tick active power-up
    if (activePowerUpRef.current) {
      activePowerUpRef.current.remaining--;
      if (activePowerUpRef.current.remaining <= 0) {
        if (activePowerUpRef.current.type === "speed") speedRef.current = Math.min(110, speedRef.current + 40);
        if (activePowerUpRef.current.type === "hyper") speedRef.current = Math.min(110, speedRef.current + 60);
        if (activePowerUpRef.current.type === "clone" && cloneSnakeRef.current) {
          // Merge clone: add score and length
          scoreRef.current += cloneScoreRef.current;
          setScore(scoreRef.current);
          const extra = cloneSnakeRef.current.slice(1);
          newSnake.push(...extra);
          cloneSnakeRef.current = null;
          cloneScoreRef.current = 0;
          spawnParticles(newSnake[0].x, newSnake[0].y, "#00ffaa", 20);
        }
        activePowerUpRef.current = null;
        setActivePowerUp(null);
      }
    }

    // Combo countdown
    if (comboTimerRef.current > 0) {
      comboTimerRef.current--;
      if (comboTimerRef.current === 0) { comboRef.current = 0; setCombo(0); }
    }

    snakeRef.current = newSnake;
    draw();
    tickRef.current = setTimeout(tick, speedRef.current);
  }, [draw, highScore, spawnParticles, deathExplosion, resetGame, checkAchievements]);

  // Keep the global sound flag in sync + persist it.
  useEffect(() => {
    setSoundOn(soundEnabled);
    localStorage.setItem("cybervault_snake_sound", String(soundEnabled));
  }, [soundEnabled]);

  // Restore saved theme/skin once on mount, and seed the parallax starfield.
  useEffect(() => {
    const savedTheme = localStorage.getItem("cybervault_snake_theme") as SnakeTheme | null;
    if (savedTheme && SNAKE_THEMES[savedTheme]) { setSnakeTheme(savedTheme); snakeThemeRef.current = savedTheme; }
    const savedSkin = localStorage.getItem("cybervault_snake_skin") as SnakeSkin | null;
    if (savedSkin && SKIN_LABELS[savedSkin]) { setSnakeSkin(savedSkin); snakeSkinRef.current = savedSkin; }
    starsRef.current = Array.from({ length: 70 }, () => ({
      x: Math.random() * WIDTH, y: Math.random() * HEIGHT, z: 0.2 + Math.random() * 0.8,
    }));
  }, []);

  // Start game loop
  useEffect(() => {
    tickRef.current = setTimeout(tick, speedRef.current);
    return () => { if (tickRef.current) clearTimeout(tickRef.current); };
  }, [tick]);

  // Keyboard handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const dir = dirRef.current;
      const mode = gameModeRef.current;

      // Player 1 controls: WASD always, arrows only if not 2player
      if (mode === "2player") {
        // P1: WASD
        if (e.key === "w" && dir !== "DOWN") { e.preventDefault(); nextDirRef.current = "UP"; }
        else if (e.key === "s" && dir !== "UP") { e.preventDefault(); nextDirRef.current = "DOWN"; }
        else if (e.key === "a" && dir !== "RIGHT") { e.preventDefault(); nextDirRef.current = "LEFT"; }
        else if (e.key === "d" && dir !== "LEFT") { e.preventDefault(); nextDirRef.current = "RIGHT"; }

        // P2: Arrow keys
        const ai2Dir = ai2DirRef.current;
        if (e.key === "ArrowUp" && ai2Dir !== "DOWN") { e.preventDefault(); ai2NextDirRef.current = "UP"; }
        else if (e.key === "ArrowDown" && ai2Dir !== "UP") { e.preventDefault(); ai2NextDirRef.current = "DOWN"; }
        else if (e.key === "ArrowLeft" && ai2Dir !== "RIGHT") { e.preventDefault(); ai2NextDirRef.current = "LEFT"; }
        else if (e.key === "ArrowRight" && ai2Dir !== "LEFT") { e.preventDefault(); ai2NextDirRef.current = "RIGHT"; }
      } else {
        // Single player: both WASD and arrows
        if ((e.key === "ArrowUp" || e.key === "w") && dir !== "DOWN") { e.preventDefault(); nextDirRef.current = "UP"; }
        else if ((e.key === "ArrowDown" || e.key === "s") && dir !== "UP") { e.preventDefault(); nextDirRef.current = "DOWN"; }
        else if ((e.key === "ArrowLeft" || e.key === "a") && dir !== "RIGHT") { e.preventDefault(); nextDirRef.current = "LEFT"; }
        else if ((e.key === "ArrowRight" || e.key === "d") && dir !== "LEFT") { e.preventDefault(); nextDirRef.current = "RIGHT"; }
      }

      if (e.key === " " && gameOverRef.current) {
        e.preventDefault();
        resetGame();
        tickRef.current = setTimeout(tick, speedRef.current);
      }

      // Pause / mute / FPS hotkeys (ignored while typing a PIN digit is fine —
      // these are single letters not used in numeric PINs).
      if ((e.key === "p" || e.key === "P") && !gameOverRef.current) {
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
      } else if (e.key === "m" || e.key === "M") {
        setSoundEnabled((v) => { const n = !v; setSoundOn(n); return n; });
      } else if (e.key === "f" || e.key === "F") {
        showFpsRef.current = !showFpsRef.current;
        setShowFps(showFpsRef.current);
      }

      // Hidden PIN
      if (e.key === "Enter") {
        if (pinBufferRef.current.length >= 4) {
          const result = onPinEntered(pinBufferRef.current);
          if (result && typeof (result as Promise<false | void>).then === "function") {
            (result as Promise<false | void>).then((val) => {
              if (val === false) failedAttemptsRef.current++;
            });
          }
        }
        pinBufferRef.current = "";
        if (pinTimeoutRef.current) { clearTimeout(pinTimeoutRef.current); pinTimeoutRef.current = null; }
      } else if (e.key === "Backspace") {
        pinBufferRef.current = pinBufferRef.current.slice(0, -1);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
          pinBufferRef.current += e.key;
          if (pinTimeoutRef.current) clearTimeout(pinTimeoutRef.current);
          pinTimeoutRef.current = setTimeout(() => { pinBufferRef.current = ""; }, 10000);
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      if (pinTimeoutRef.current) clearTimeout(pinTimeoutRef.current);
    };
  }, [onPinEntered, onBypass, resetGame, tick]);

  const thm = SNAKE_THEMES[snakeTheme];

  // Button helper
  const btn = (active: boolean, color?: string) => ({
    color: active ? (color || thm.titleColor) : thm.mutedText,
    border: `1px solid ${active ? (color || thm.accent) : thm.border}`,
    backgroundColor: active ? `${color || thm.accent}18` : "transparent",
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center gap-4 overflow-auto py-4" style={{ backgroundColor: thm.bg, transition: "background-color 0.4s" }}>
      {/* Left panel: controls (dropdowns) */}
      <div className="flex flex-col gap-3 p-3 rounded-sm shrink-0" style={{ border: `1px solid ${thm.border}`, backgroundColor: `${thm.bg}cc`, minWidth: 140, maxHeight: "90vh", overflowY: "auto" }}>
        {/* Mode dropdown */}
        <div>
          <span className="font-mono text-[17px] uppercase tracking-wider block mb-1" style={{ color: thm.mutedText }}>Mode</span>
          <select
            value={gameMode}
            onChange={e => { const m = e.target.value as GameMode; setGameMode(m); gameModeRef.current = m; resetGame(); if (m === "2player") { showAI2Ref.current = false; setShowAI2(false); } }}
            className="w-full font-mono text-[17px] uppercase tracking-wider px-2 py-1.5 rounded-sm outline-none cursor-pointer"
            style={{ color: thm.titleColor, backgroundColor: `${thm.accent}18`, border: `1px solid ${thm.accent}` }}
          >
            <option value="normal" style={{ backgroundColor: thm.bg }}>Normal</option>
            <option value="challenge" style={{ backgroundColor: thm.bg }}>Challenge</option>
            <option value="2player" style={{ backgroundColor: thm.bg }}>2 Player</option>
          </select>
        </div>

        {/* Quick toggles: sound, pause, fps */}
        <div className="grid grid-cols-3 gap-1">
          <button onClick={() => setSoundEnabled((v) => { const n = !v; setSoundOn(n); return n; })}
            title="Sound (M)" className="font-mono text-[17px] px-1 py-1.5 rounded-sm transition-all" style={btn(soundEnabled)}>
            {soundEnabled ? "🔊" : "🔇"}
          </button>
          <button onClick={() => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); }}
            title="Pause (P)" className="font-mono text-[17px] px-1 py-1.5 rounded-sm transition-all" style={btn(paused)}>
            {paused ? "▶" : "⏸"}
          </button>
          <button onClick={() => { showFpsRef.current = !showFpsRef.current; setShowFps(showFpsRef.current); }}
            title="FPS (F)" className="font-mono text-[17px] px-1 py-1.5 rounded-sm transition-all" style={btn(showFps)}>
            FPS
          </button>
        </div>

        {/* Skin dropdown */}
        <div>
          <span className="font-mono text-[17px] uppercase tracking-wider block mb-1" style={{ color: thm.mutedText }}>Skin</span>
          <select
            value={snakeSkin}
            onChange={e => { const s = e.target.value as SnakeSkin; setSnakeSkin(s); snakeSkinRef.current = s; localStorage.setItem("cybervault_snake_skin", s); }}
            className="w-full font-mono text-[17px] uppercase tracking-wider px-2 py-1.5 rounded-sm outline-none cursor-pointer"
            style={{ color: thm.titleColor, backgroundColor: `${thm.accent}18`, border: `1px solid ${thm.accent}` }}
          >
            {(Object.keys(SKIN_LABELS) as SnakeSkin[]).map(s => (
              <option key={s} value={s} style={{ backgroundColor: thm.bg }}>{SKIN_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {gameMode !== "2player" && (
          <>
            {/* AI toggle buttons */}
            <div>
              <span className="font-mono text-[17px] uppercase tracking-wider block mb-1" style={{ color: thm.mutedText }}>AI</span>
              <button onClick={() => { const n = !autoPlay; setAutoPlay(n); autoPlayRef.current = n; if (n && gameOverRef.current) { resetGame(); tickRef.current = setTimeout(tick, speedRef.current); } }}
                className="w-full font-mono text-[17px] uppercase tracking-wider px-2 py-1.5 rounded-sm transition-all mb-1" style={btn(autoPlay)}>
                {autoPlay ? "Auto: ON" : "Auto-play"}
              </button>
              <button onClick={() => { const n = !showAI2; setShowAI2(n); showAI2Ref.current = n; if (n) { ai2SnakeRef.current = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]; ai2DirRef.current = "RIGHT"; } }}
                className="w-full font-mono text-[17px] uppercase tracking-wider px-2 py-1.5 rounded-sm transition-all" style={btn(showAI2, "#ff6600")}>
                {showAI2 ? "AI2: ON" : "AI Snake"}
              </button>
            </div>

            {showAI2 && (
              <>
                {/* Difficulty dropdown */}
                <div>
                  <span className="font-mono text-[17px] uppercase tracking-wider block mb-1" style={{ color: thm.mutedText }}>Difficulty</span>
                  <select
                    value={aiDifficulty}
                    onChange={e => { const d = e.target.value as AIDifficulty; setAiDifficulty(d); aiDifficultyRef.current = d; }}
                    className="w-full font-mono text-[17px] uppercase tracking-wider px-2 py-1.5 rounded-sm outline-none cursor-pointer"
                    style={{ color: thm.titleColor, backgroundColor: `${thm.accent}18`, border: `1px solid ${thm.accent}` }}
                  >
                    <option value="easy" style={{ backgroundColor: thm.bg }}>Easy</option>
                    <option value="medium" style={{ backgroundColor: thm.bg }}>Medium</option>
                    <option value="hard" style={{ backgroundColor: thm.bg }}>Hard</option>
                    <option value="insane" style={{ backgroundColor: thm.bg }}>☠ Insane</option>
                  </select>
                </div>

                {/* Personality dropdown */}
                <div>
                  <span className="font-mono text-[17px] uppercase tracking-wider block mb-1" style={{ color: thm.mutedText }}>Personality</span>
                  <select
                    value={aiPersonality}
                    onChange={e => { const p = e.target.value as AIPersonality; setAiPersonality(p); aiPersonalityRef.current = p; }}
                    className="w-full font-mono text-[17px] uppercase tracking-wider px-2 py-1.5 rounded-sm outline-none cursor-pointer"
                    style={{ color: thm.titleColor, backgroundColor: `${thm.accent}18`, border: `1px solid ${thm.accent}` }}
                  >
                    <option value="normal" style={{ backgroundColor: thm.bg }}>Normal</option>
                    <option value="aggressive" style={{ backgroundColor: thm.bg }}>Aggressive</option>
                    <option value="defensive" style={{ backgroundColor: thm.bg }}>Defensive</option>
                    <option value="hunter" style={{ backgroundColor: thm.bg }}>Hunter</option>
                    <option value="coward" style={{ backgroundColor: thm.bg }}>Coward</option>
                    <option value="greedy" style={{ backgroundColor: thm.bg }}>Greedy</option>
                    <option value="ambush" style={{ backgroundColor: thm.bg }}>Ambush</option>
                  </select>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Center: game */}
      <div className="flex flex-col items-center shrink-0">
        <div className="mb-3 text-center">
          <h1 className="font-mono text-[17px] font-bold tracking-[0.3em] uppercase" style={{ color: thm.titleColor, transition: "color 0.4s" }}>
            CYBER SNAKE
          </h1>
          <p className="font-mono text-[17px] mt-1" style={{ color: thm.mutedText }}>
            {gameMode === "2player" ? "P1: WASD \u00b7 P2: Arrows" : "Arrow keys or WASD"} &bull; P pause &bull; M mute &bull; F fps
          </p>
        </div>

        {/* Score bar */}
        <div className="flex items-center gap-4 mb-2 flex-wrap justify-center">
          <span className="font-mono text-[17px] uppercase tracking-wider" style={{ color: thm.head }}>
            {gameMode === "2player" ? "P1" : "Score"}: {score}
          </span>
          <span className="font-mono text-[17px] uppercase tracking-wider" style={{ color: thm.mutedText }}>Best: {highScore}</span>
          <span className="font-mono text-[17px] uppercase tracking-wider" style={{ color: thm.accent }}>Lvl {level}</span>
          {(showAI2 || gameMode === "2player") && (
            <span className="font-mono text-[17px] uppercase tracking-wider" style={{ color: "#ff6600" }}>
              {gameMode === "2player" ? "P2" : "AI2"}: {ai2Score}
            </span>
          )}
          {combo >= 2 && (
            <span className="font-mono text-[17px] uppercase tracking-wider animate-pulse" style={{ color: "#ff8800" }}>x{combo}</span>
          )}
          {hasShield && (
            <span className="font-mono text-[17px] uppercase tracking-wider animate-pulse" style={{ color: "#00ddff" }}>🛡 SHIELD</span>
          )}
          {activePowerUp && (
            <span className="font-mono text-[17px] uppercase tracking-wider px-2 py-0.5 rounded-sm animate-pulse"
              style={{ color: POWER_UP_COLORS[activePowerUp], border: `1px solid ${POWER_UP_COLORS[activePowerUp]}44`, backgroundColor: `${POWER_UP_COLORS[activePowerUp]}11` }}>
              {POWER_UP_LABELS[activePowerUp]}
            </span>
          )}
        </div>

        {/* Achievement toast */}
        {newAchievement && (
          <div className="mb-2 px-4 py-1.5 rounded font-mono text-[17px] uppercase tracking-wider animate-pulse"
            style={{ color: "#ffcc00", border: "1px solid #ffcc0044", backgroundColor: "rgba(255,204,0,0.1)" }}>
            Achievement Unlocked: {newAchievement}!
          </div>
        )}

        {/* Canvas */}
        <div className="rounded-sm overflow-hidden" style={{
          border: `1px solid ${thm.canvasBorder}`,
          boxShadow: `0 0 20px ${thm.accentDim}, inset 0 0 20px rgba(0,0,0,0.5)`,
          transition: "border-color 0.4s, box-shadow 0.4s",
        }}>
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="block" />
        </div>

        {/* Power-up legend */}
        <div className="flex items-center justify-center gap-3 mt-2 flex-wrap">
          {(Object.keys(POWER_UP_LABELS) as PowerUpType[]).map(type => (
            <span key={type} className="font-mono text-[17px] flex items-center gap-1" style={{ color: POWER_UP_COLORS[type] }}>
              <span className="inline-block w-1.5 h-1.5 rotate-45" style={{ backgroundColor: POWER_UP_COLORS[type] }} />
              {POWER_UP_LABELS[type]}
            </span>
          ))}
        </div>

        {/* Food legend */}
        <div className="flex items-center justify-center gap-3 mt-1">
          {FOOD_TYPES.map((f, i) => (
            <span key={i} className="font-mono text-[17px]" style={{ color: f.color }}>
              {f.emoji}{f.points}pt
            </span>
          ))}
        </div>
      </div>

      {/* Right panel: theme + stats + achievements */}
      <div className="flex flex-col gap-2 p-3 rounded-sm shrink-0" style={{ border: `1px solid ${thm.border}`, backgroundColor: `${thm.bg}cc`, minWidth: 130, maxHeight: "90vh", overflowY: "auto" }}>
        <span className="font-mono text-[17px] uppercase tracking-wider text-center mb-1" style={{ color: thm.mutedText }}>Theme</span>
        {(Object.keys(SNAKE_THEMES) as SnakeTheme[]).map(key => {
          const st = SNAKE_THEMES[key];
          const isActive = snakeTheme === key;
          return (
            <button key={key} onClick={() => { setSnakeTheme(key); snakeThemeRef.current = key; localStorage.setItem("cybervault_snake_theme", key); }}
              className="flex items-center gap-2 px-2 py-1 rounded-sm font-mono text-[17px] uppercase tracking-wider transition-all"
              style={{ color: isActive ? st.head : thm.mutedText, border: `1px solid ${isActive ? st.head : "transparent"}`, backgroundColor: isActive ? `${st.head}15` : "transparent" }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.head }} />
              {st.label}
            </button>
          );
        })}

        {/* Stats button */}
        <button onClick={() => setShowPanel(showPanel === "stats" ? null : "stats")}
          className="font-mono text-[17px] uppercase tracking-wider px-2 py-1 rounded-sm transition-all mt-2" style={btn(showPanel === "stats")}>
          Stats
        </button>

        {showPanel === "stats" && (
          <div className="flex flex-col gap-1 mt-1 text-[17px] font-mono" style={{ color: thm.mutedText }}>
            <span>Games: {stats.totalGames}</span>
            <span>Total Score: {stats.totalScore}</span>
            <span>Food Eaten: {stats.totalFood}</span>
            <span>Time: {Math.floor(stats.totalTime / 60)}m</span>
            <span>Best Score: {stats.bestScore}</span>
            <span>Best Level: {stats.bestLevel}</span>
            <span>Best Combo: x{stats.bestCombo}</span>
            <span>Longest: {stats.longestSnake}</span>
            <span>Power-ups: {stats.powerUpsCollected}</span>
            {stats.challengeBestTime > 0 && <span>Challenge: {Math.floor(stats.challengeBestTime)}s</span>}
          </div>
        )}

        {/* Achievements button */}
        <button onClick={() => setShowPanel(showPanel === "achievements" ? null : "achievements")}
          className="font-mono text-[17px] uppercase tracking-wider px-2 py-1 rounded-sm transition-all" style={btn(showPanel === "achievements")}>
          Badges {unlocked.size}/{ACHIEVEMENTS.length}
        </button>

        {showPanel === "achievements" && (
          <div className="flex flex-col gap-1 mt-1 text-[17px] font-mono">
            {ACHIEVEMENTS.map(a => {
              const done = unlocked.has(a.id);
              return (
                <div key={a.id} className="flex items-center gap-1.5" style={{ color: done ? "#ffcc00" : thm.mutedText, opacity: done ? 1 : 0.5 }}>
                  <span>{a.icon}</span>
                  <div>
                    <div className="text-[17px]">{a.label}</div>
                    <div className="text-[17px]" style={{ color: thm.mutedText }}>{a.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hint */}
      {hint && (
        <div className="fixed bottom-3 right-4 z-[101]">
          <button onClick={() => { hintClickCountRef.current++; if (hintClickCountRef.current >= 10 && onBypass) { hintClickCountRef.current = 0; onBypass(); } }}
            className="font-mono cursor-pointer bg-transparent border-none outline-none" style={{ fontSize: "17px", color: thm.mutedText, opacity: 0.4 }}>
            {hint}
          </button>
        </div>
      )}
    </div>
  );
});

export default DecoySnakeGame;
