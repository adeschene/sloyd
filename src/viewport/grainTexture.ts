import * as THREE from 'three';
import type { GrainFamily, GrainKind } from './grainFaces';
import { BANDS, bandOffset, bandRadius, hash, makeHarmonics, seededRandom, wobbleAt } from './grainLog';

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

/**
 * How far the cut plane sits from the pith, in tile units, per cut.
 *
 * Face grain is a flatsawn slice well off the pith, so the plane grazes the
 * rings and they close into cathedrals. Edge grain is quartersawn, essentially
 * through the pith, which is why it comes out as straight tight lines — the
 * same model, one number apart. It is not exactly zero because a perfectly
 * straight line reads as printed rather than sawn.
 */
const CUT_DISTANCE = { face: 0.62, edge: 0.05 };

/** Bands are drawn as an earlywood-to-latewood gradient rather than a hairline:
 *  a soft wide band darkening into a hard thin line at its outer edge. Wood has
 *  no lines in it; it has bands with edges. */
function band(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  width: number,
  alpha: number,
) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Earlywood: wide and soft.
  ctx.strokeStyle = `rgba(120, 82, 48, ${alpha * 0.35})`;
  ctx.lineWidth = width;
  ctx.stroke();

  // Latewood: the dense line the ring closes on.
  ctx.strokeStyle = `rgba(64, 40, 22, ${alpha})`;
  ctx.lineWidth = Math.max(0.7, width * 0.28);
  ctx.stroke();
}

/**
 * A cut through the log, drawn along u with the pith line down the middle of v.
 *
 * Seamless in both directions, by construction rather than by patching: the
 * wobble has whole periods across the tile, and the bands are evenly spaced by
 * k*delta (see grainLog.bandRadius), so band k and band k + BANDS land exactly
 * one tile apart. The pattern is also symmetric about the pith line, so the
 * tile's two v edges carry the same curve.
 */
function woodCut(d: number): Draw {
  return (ctx) => {
    base(ctx);
    const delta = 1 / BANDS;
    const half = BANDS / 2;
    const STEPS = 64;

    // Band 0 is the ring exactly tangent to the cut plane, so bandOffset
    // returns null for it whenever the pith is not wandering toward the cut.
    // A missing centre band is the model being right, not a bug.
    for (let k = -half; k <= half; k += 1) {
      // EVERY property of a band comes from a PRNG seeded by its index modulo
      // the half-tile, so the bands at k = -half and k = +half — the tile's two
      // v edges — are identical in wobble, width and weight. Drawing any of
      // these from the sequential `rand` instead would give the two edges
      // different bands and put a seam back across the grain, which is the one
      // failure this whole construction exists to avoid.
      const bandRand = seededRandom(hash(`band:${Math.abs(k) % half}`));
      const harmonics = makeHarmonics(bandRand, 3);
      const width = 2.2 + bandRand() * 3.4;
      const alpha = 0.10 + bandRand() * 0.14;

      const points: Array<[number, number]> = [];
      for (let s = 0; s <= STEPS; s += 1) {
        const z = s / STEPS;
        const offset = bandOffset(k, d, delta, wobbleAt(z, harmonics));
        if (offset === null) {
          // The band has closed — this is an arch tip. Draw what we have and
          // start a new run when it reopens.
          band(ctx, points, width, alpha);
          points.length = 0;
          continue;
        }
        const v = 0.5 + Math.sign(k || 1) * offset;
        points.push([z * SIZE, v * SIZE]);
      }
      band(ctx, points, width, alpha);
    }
  };
}

/**
 * The cross-section: the rings themselves. No tiling problem to solve here —
 * end faces use FIT, so exactly one copy is ever shown, which is just as well
 * because concentric circles cannot tile.
 */
const woodEnd: Draw = (ctx, rand) => {
  base(ctx);
  const delta = 1 / BANDS;
  // The pith sits off the tile, so the rings read as the arcs across the end of
  // a flatsawn board rather than a bullseye.
  const pith: [number, number] = [SIZE * 0.5, SIZE * 1.8];
  for (let k = 1; k < BANDS * 3; k += 1) {
    const r = bandRadius(k, CUT_DISTANCE.face, delta) * SIZE * (0.92 + rand() * 0.16);
    ctx.beginPath();
    ctx.arc(pith[0], pith[1], r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(120, 82, 48, ${(0.08 + rand() * 0.10) * 0.35})`;
    ctx.lineWidth = 3 + rand() * 3;
    ctx.stroke();
    ctx.strokeStyle = `rgba(64, 40, 22, ${0.08 + rand() * 0.10})`;
    ctx.lineWidth = 1 + rand() * 1.4;
    ctx.stroke();
  }
  speckle(ctx, rand, 700, 0.045);
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
  wood:    { face: woodCut(CUT_DISTANCE.face), edge: woodCut(CUT_DISTANCE.edge), end: woodEnd },
  plywood: { face: plywoodFace, edge: plywoodPlies, end: plywoodPlies },
  mdf:     { face: mdf,         edge: mdf,          end: mdf },
};
