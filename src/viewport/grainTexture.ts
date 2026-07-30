import * as THREE from 'three';
import type { GrainFamily, GrainKind } from './grainFaces';

/**
 * Grain is drawn as a greyscale mask and tinted by the material's own colour
 * through `material.color`. Two things fall out of that: species colour keeps
 * living only in MATERIALS, and the cache is at most nine textures rather than
 * one per species per kind.
 *
 * Canvas rather than a shader, and that is not a style preference. Browser
 * verification on this host runs on software GL, which returns 1.0 for
 * pow(0.0, 0.0) where real hardware returns NaN — a difference that once hid a
 * grid bug completely and shipped it (follow-up 26a). This is CPU-side and
 * deterministic, so a screenshot taken here means what it says.
 */
const SIZE = 512;

/** Every texture is generated once and shared by every board that needs it.
 *  A texture per board — or worse, per render — is the same GPU-memory bug the
 *  geometry useMemo in BoardMesh exists to prevent, with a bigger footprint.
 *  Nothing disposes these: they live as long as the app does. */
const cache = new Map<string, THREE.Texture>();

export function grainTexture(family: GrainFamily, kind: GrainKind): THREE.Texture {
  const key = `${family}:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('grainTexture needs a 2d canvas context');

  DRAW[family][kind](ctx, seededRandom(hash(key)));

  const texture = new THREE.CanvasTexture(canvas);
  // The UVs run well past 1 — that is how grain scale stays world-relative —
  // so repeat wrapping is required, not cosmetic.
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  cache.set(key, texture);
  return texture;
}

/** Deterministic PRNG (mulberry32). Never Math.random: the same board must look
 *  the same on every load. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Rand = () => number;
type Draw = (ctx: CanvasRenderingContext2D, rand: Rand) => void;

/** White base, dark grain: the mask multiplies the material colour, so 1.0 is
 *  bare stock and anything below it is figure. */
function base(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);
}

/**
 * One wandering grain line, running along u (canvas x).
 *
 * Seamless in both directions: the wander is a sinusoid with an integer number
 * of periods across the tile, so the left and right edges meet, and each line
 * is drawn three times a tile-height apart so a line near an edge wraps instead
 * of being clipped.
 */
function streak(ctx: CanvasRenderingContext2D, rand: Rand, y: number, alpha: number, width: number) {
  const periods = 1 + Math.floor(rand() * 3);
  const amplitude = 2 + rand() * 10;
  const phase = rand() * Math.PI * 2;
  ctx.strokeStyle = `rgba(70, 45, 25, ${alpha})`;
  ctx.lineWidth = width;
  for (const dy of [-SIZE, 0, SIZE]) {
    ctx.beginPath();
    for (let x = 0; x <= SIZE; x += 8) {
      const wander = amplitude * Math.sin((2 * Math.PI * periods * x) / SIZE + phase);
      const yy = y + dy + wander;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

/** A short horizontal fibre mark, wrapped in u. */
function dash(ctx: CanvasRenderingContext2D, rand: Rand, y: number, alpha: number) {
  const x = rand() * SIZE;
  const w = 20 + rand() * 120;
  const h = 1 + rand() * 1.5;
  ctx.fillStyle = `rgba(70, 45, 25, ${alpha})`;
  ctx.fillRect(x, y, w, h);
  if (x + w > SIZE) ctx.fillRect(x - SIZE, y, w, h);
}

function speckle(ctx: CanvasRenderingContext2D, rand: Rand, count: number, alpha: number) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = `rgba(60, 40, 25, ${alpha * rand()})`;
    ctx.fillRect(rand() * SIZE, rand() * SIZE, 1 + rand() * 2, 1 + rand() * 2);
  }
}

const woodFace: Draw = (ctx, rand) => {
  base(ctx);
  for (let i = 0; i < 70; i += 1) {
    streak(ctx, rand, rand() * SIZE, 0.05 + rand() * 0.13, 0.8 + rand() * 3);
  }
};

/** Quartersawn: the lines an edge shows are tighter and straighter than a face's. */
const woodEdge: Draw = (ctx, rand) => {
  base(ctx);
  for (let i = 0; i < 110; i += 1) {
    streak(ctx, rand, rand() * SIZE, 0.04 + rand() * 0.10, 0.6 + rand() * 1.2);
  }
};

/** Growth rings, centred well outside the tile so they read as the gentle arcs
 *  across the end of a flatsawn board rather than a bullseye. */
const woodEnd: Draw = (ctx, rand) => {
  base(ctx);
  const cx = SIZE * 0.5;
  const cy = SIZE * 2.2;
  for (let r = 40; r < SIZE * 3; r += 9 + rand() * 12) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(70, 45, 25, ${0.05 + rand() * 0.10})`;
    ctx.lineWidth = 1 + rand() * 2.5;
    ctx.stroke();
  }
  speckle(ctx, rand, 900, 0.05);
};

const plywoodFace: Draw = (ctx, rand) => {
  base(ctx);
  for (let i = 0; i < 40; i += 1) {
    streak(ctx, rand, rand() * SIZE, 0.03 + rand() * 0.07, 0.6 + rand() * 1.6);
  }
};

/** Plies stack across v, and the tiling puts exactly one stack across the
 *  board's thickness — so what is drawn here is one whole sheet's edge. */
const plywoodPlies: Draw = (ctx, rand) => {
  base(ctx);
  const PLIES = 5;
  const h = SIZE / PLIES;
  for (let p = 0; p < PLIES; p += 1) {
    const top = p * h;
    if (p % 2) {
      ctx.fillStyle = 'rgba(70, 45, 25, 0.10)';
      ctx.fillRect(0, top, SIZE, h);
    }
    ctx.fillStyle = 'rgba(50, 32, 18, 0.22)';
    ctx.fillRect(0, top, SIZE, 2);
    for (let i = 0; i < 25; i += 1) {
      dash(ctx, rand, top + 4 + rand() * (h - 8), 0.05 + rand() * 0.08);
    }
  }
};

/** MDF has no grain and should not pretend to. */
const mdf: Draw = (ctx, rand) => {
  base(ctx);
  speckle(ctx, rand, 6000, 0.05);
};

const DRAW: Record<GrainFamily, Record<GrainKind, Draw>> = {
  wood:    { face: woodFace,    edge: woodEdge,     end: woodEnd },
  plywood: { face: plywoodFace, edge: plywoodPlies, end: plywoodPlies },
  mdf:     { face: mdf,         edge: mdf,          end: mdf },
};
