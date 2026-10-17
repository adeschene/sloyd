import { describe, expect, it } from 'vitest';
import {
  createBoard, createDocument, migrateDocument, partGeometry, boardEdges, boardBodies, bodyVolume, geometryKey, profileCurve, archCurve, PROFILE_EDGES, PROFILE_KINDS,
} from './document';
import { curveDrawEdges, curveEdgeLifts, curveSilhouettes, silhouetteLines } from './curveDrawing';
import { curveLineEntries } from './curveText';
import { boardSnapPoints } from './snapPoints';
import { stockProbe } from './cuts';
import { buildDiagrams } from './diagram';
import { drawView, FRONT, SIDE, TOP, ISO } from './drawing';
import { partFeatures } from './featureKeys';
import { holeFaults, holeInStock, intoCurve } from './holeFaults';
import { buildCutList } from './cutlist';
import { bodyMesh, boardUVSignature, drawsAsBox } from '../viewport/grainTiling';
import { boardHoles } from './holes';
import { curvedEdges } from './bodies';
import { curvedParts, curvedRefusal } from './curvedRefusal';
import { turnCandidates } from './roleLinks';
import type { Board, CurveCut, HoleRow } from './types';
import type { ProfileFields } from './profiles';

const UNITS = { display: 'imperial-fractional', precision: 16 } as const;
const fields = (f: Partial<ProfileFields> & Pick<ProfileFields, 'kind' | 'size'>): ProfileFields =>
  ({ through: 'length', uFrom: 'max', vFrom: 'max', facing: 'v', ...f });
/** The fixtures: every kind on every edge (both facings when asymmetric), the four-edge sets, a mixed shelf, a holed top. */
function fixtures(): { name: string; board: Board }[] {
  const out: { name: string; board: Board }[] = [];
  const top = (curves: CurveCut[], holes: HoleRow[] = []) => createBoard({ id: 'b1', name: 'Top', length: 36, width: 20, thickness: 0.75, curves, holes });
  for (const e of PROFILE_EDGES) for (const kind of PROFILE_KINDS) for (const facing of ['v', 'u'] as const) {
    const s = kind === 'thumbnail' ? { size: 0.75, depth: 0.25 } : kind === 'bead' ? { size: 0.25, fillet: 0.0625 } : { size: 0.375, fillet: facing === 'u' ? 0.0625 : 0 };
    if (facing === 'u' && kind !== 'ogee' && kind !== 'bead' && kind !== 'thumbnail' && !(s.fillet! > 0)) continue;
    out.push({ name: `${kind} ${JSON.stringify(e)} ${facing}`, board: top([{ id: 'p', ...profileCurve(fields({ ...e, kind, facing, ...s })) }]) });
  }
  for (const kind of PROFILE_KINDS) {
    const s = kind === 'thumbnail' ? { size: 0.75, depth: 0.25 } : kind === 'bead' ? { size: 0.25, fillet: 0.0625 } : { size: 0.375, fillet: 0 };
    out.push({ name: `four-edge ${kind}`, board: top((['length', 'width'] as const).flatMap((through) => (['min', 'max'] as const).map((uFrom) =>
      ({ id: `${through}${uFrom}`, ...profileCurve(fields({ through, uFrom, kind, ...s })) })))) });
  }
  const bore: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.0625, depth: 0.0625, along: 'length', alongFrom: 'min', station: 18, count: 1, pitch: 0, acrossFrom: 'max', inset: 0.1 };
  out.push({ name: 'holed roundover (a hole into the profile)', board: top([{ id: 'p', ...profileCurve(fields({ kind: 'roundover', size: 0.25, fillet: 0 })) }], [bore]) });
  // A groove far from the profiled edge: its bodies on the other side keep their box, so drawsAsBox is asked a real question.
  const groove = { id: 'g1', face: 'thickness' as const, from: 'max' as const, across: 'length' as const, offset: 8, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 };
  out.push({ name: 'grooved roundover (a body the profile never reaches)', board: createBoard({ id: 'b1', name: 'Top', length: 36, width: 20, thickness: 0.75,
    cuts: [groove], curves: [{ id: 'p', ...profileCurve(fields({ kind: 'roundover', size: 0.25, fillet: 0 })) }] }) });
  return out;
}
const migrate = (b: Board): Board => {
  const raw = JSON.parse(JSON.stringify({ ...createDocument('T'), version: 17, boards: [b] }));
  return migrateDocument(raw).boards[0] as Board;
};

describe('every reader sees a migrated profile exactly as chunk 1 did (profile runs a1, Global Constraints)', () => {
  for (const { name, board } of fixtures()) {
    it(name, () => {
      const m = migrate(board);
      expect(m.curves).toEqual([]);
      expect(m.profiles.length).toBe(board.curves.length);
      const g0 = partGeometry(board), g1 = partGeometry(m);
      expect(g1.bodies).toEqual(g0.bodies);
      expect(g1.edges).toEqual(g0.edges);
      expect(boardEdges(m)).toEqual(boardEdges(board));
      expect(boardBodies(m)).toEqual(boardBodies(board));
      expect(curvedEdges(m, g1.bodies)).toEqual(curvedEdges(board, g0.bodies));
      // The cache key: an unrouted key would share the plain box's entry with every same-sized part (and section.ts' cap cache).
      expect(geometryKey(m)).toBe(geometryKey(board));
      expect(curveDrawEdges(m)).toEqual(curveDrawEdges(board));
      for (const v of [FRONT, SIDE, TOP, ISO]) {
        expect(silhouetteLines(m, v.toward)).toEqual(silhouetteLines(board, v.toward));
        expect(curveSilhouettes(m, v.toward)).toEqual(curveSilhouettes(board, v.toward));
        expect(curveEdgeLifts(m, v.toward)).toEqual(curveEdgeLifts(board, v.toward));
        expect(drawView([m], v)).toEqual(drawView([board], v));
      }
      expect(boardSnapPoints(m)).toEqual(boardSnapPoints(board));
      const probe0 = stockProbe(board), probe1 = stockProbe(m);
      for (let i = 0; i < 400; i += 1) {
        const p = { length: (i * 7.31) % 36, width: (i * 3.77) % 20, thickness: (i * 0.0193) % 0.75 };
        expect(probe1(p)).toBe(probe0(p));
      }
      expect(buildDiagrams(m, UNITS)).toEqual(buildDiagrams(board, UNITS));
      expect(curveLineEntries(m, UNITS)).toEqual(curveLineEntries(board, UNITS));
      expect(partFeatures(m, UNITS)).toEqual(partFeatures(board, UNITS));
      for (const r of board.holes) expect(holeFaults(m, r)).toEqual(holeFaults(board, r));
      // intoCurve and holeInStock are called directly by the hole drawing and the viewport's hole mesh (not only via holeFaults).
      boardHoles(board).forEach((h, i) => {
        const h1 = boardHoles(m)[i]!;
        expect(intoCurve(m, h1)).toEqual(intoCurve(board, h));
        expect(holeInStock(m, h1)).toBe(holeInStock(board, h));
      });
      if (board.holes.length > 0) expect(intoCurve(board, boardHoles(board)[0]!)).not.toBeNull();
      expect(boardUVSignature(m)).toEqual(boardUVSignature(board));
      const holes0 = boardHoles(board), holes1 = boardHoles(m);
      if (board.cuts.length > 0) expect(g0.bodies.some((body) => body.box !== null)).toBe(true);
      g0.bodies.forEach((body, i) => {
        expect(drawsAsBox(m, g1.bodies[i]!, holes1)).toBe(drawsAsBox(board, body, holes0));
        expect(bodyMesh(m, g1.bodies[i]!, holes1, g1.bodies)).toEqual(bodyMesh(board, body, holes0, g0.bodies));
      });
      const doc = (b: Board) => ({ ...createDocument('T'), boards: [b] });
      expect(buildCutList(doc(m))).toEqual(buildCutList(doc(board)));
    });
  }
  it('partGeometry of a migrated part computed FIRST (no cache hit from the original) gives the original\'s edges', () => {
    // A geometry no other test mints, so this call is the cache miss: the edges getter must read the view, not the stored part.
    const b = createBoard({ id: 'b1', name: 'Top', length: 35.123, width: 19.877, thickness: 0.75, curves: [{ id: 'p', ...profileCurve(fields({ kind: 'cove', size: 0.375, fillet: 0 })) }] });
    const m = migrate(b);
    const g = partGeometry(m);
    expect(g.edges).toEqual(boardEdges(b));
    expect(g.bodies).toEqual(boardBodies(b));
  });
  it('curveDrawEdges of a migrated part computed FIRST gives the original\'s', () => {
    const b = createBoard({ id: 'b1', name: 'Top', length: 34.567, width: 18.321, thickness: 0.75, curves: [{ id: 'p', ...profileCurve(fields({ kind: 'ogee', size: 0.375, fillet: 0 })) }] });
    const fresh = curveDrawEdges(migrate(b));
    expect(fresh).toEqual(curveDrawEdges(b));
    // Its memo is keyed on the shared edges, so the original's call would hit what this one stored: check it directly.
    expect(fresh.some((e) => e.path)).toBe(true);
  });
  it('a part with an arch and a profile holds the same wood (spec P4: order may differ)', () => {
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) };
    const b = createBoard({ id: 'b1', name: 'Apron', length: 30, width: 5, thickness: 0.75, curves: [{ id: 'p', ...profileCurve(fields({ kind: 'roundover', size: 0.25, fillet: 0 })) }, arch] });
    const vol = (x: Board) => partGeometry(x).bodies.reduce((s, y) => s + bodyVolume(y), 0);
    expect(vol(migrate(b))).toBeCloseTo(vol(b), 8);
  });
});

describe('a migrated profile part still refuses joinery and Refine, and takes no turn (profile runs a1)', () => {
  const b = createBoard({ id: 'b1', name: 'Top', length: 36, width: 20, thickness: 0.75, curves: [{ id: 'p', ...profileCurve(fields({ kind: 'roundover', size: 0.25, fillet: 0 })) }] });
  it('curvedRefusal names it, turnCandidates gives none', () => {
    const m = migrate(b);
    expect(m.curves).toEqual([]);
    const flat = { ...createDocument('T'), boards: [m] };
    expect(curvedParts(flat)).toEqual(['Top']);
    expect(curvedRefusal(flat, 'joinery')).toBe(curvedRefusal({ ...createDocument('T'), boards: [b] }, 'joinery'));
    expect(turnCandidates(m)).toEqual([]);
  });
});
