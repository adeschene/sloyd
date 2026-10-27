import type { Board, SloydDocument, StoredBoard } from './types';
import type { GeneratedAssembly, GeneratedDesign, GeneratedPart } from './generated';
import { orient } from './generated';
import { hasFrameFeatures } from './featureCarry';
import { distinctParts } from './assemblyChecks';
import { boardExtents } from './geometry';
import { taperCutsFor, worldTapers } from './taperWorld';
import type { TaperFaultCode } from './taperWorld';
import { angleCutsFor, angleRatiosOf, noAngles, worldAngles } from './angleWorld';
import type { AngleFaultCode } from './angleWorld';
import { worldHoles } from './holeWorld';
import { worldBands } from './bandWorld';
import { worldProfiles } from './profileWorld';
import { isShaped, resolveBoard, shapeMap } from './shapes';
import { flatDocument, parentPath, worldParts } from './tree';
import { keptAssemblyLinkRefusal, keptParts, leaningInAssembly } from './leanKeep';
import { fingerSets } from './boxJoints';

/**
 * Refine's input (refine spec §2): the open design in Generate's own format —
 * loose parts as world boxes, each definition as one assembly of local boxes
 * with one placement per instance. The inverse of designToDocument, for the
 * designs that format can express; everything else is REFUSED here, on the
 * document alone, before any model call.
 */
export type RefusalReason = 'empty' | 'cuts' | 'turned' | 'nested' | 'too-large' | 'joints' | 'mirrored' | 'taper-form' | 'angle-form' | 'angle-joint' | 'lean-joint' | 'lean-assembly';
export interface RefineRefusal { reason: RefusalReason; message: string }
export interface RefineMax { distinct: number; placed: number }

/** Each converter fault, in the person's words (never the model-facing fault text). */
const TAPER_REASON: Record<TaperFaultCode, string> = {
  'no-wood': 'it leaves no wood at an end',
  along: "it no longer runs along the part's longest side",
  start: "it starts beyond the part's length",
  faces: "its faces don't describe a taper",
  amount: "its amount doesn't describe a taper",
};

/** Each angle-converter fault, in the person's words (AI-angles spec §6.1). */
const ANGLE_REASON: Record<AngleFaultCode, string> = {
  direction: 'its faces no longer describe it on the reshaped part',
  angle: 'its angle is out of range',
  legs: "its legs don't describe a chamfer",
  'no-wood': 'it would leave no wood',
};

const refuse = (reason: RefusalReason, message: string) => ({ refused: { reason, message } });

type V3 = [number, number, number];
const box = (b: Board, name: string, role: string, shift: V3 = [0, 0, 0]): GeneratedPart => {
  const [x, y, z] = boardExtents(b);
  return { name, role, material: b.material, at: { x: b.position[0] - shift[0], y: b.position[1] - shift[1], z: b.position[2] - shift[2] }, size: { x, y, z }, tapers: worldTapers(b) ?? [], ...(worldAngles(b) ?? noAngles()), holes: worldHoles(b),
    // A curved part's bands stay carried (AI-bands spec §3.2): the design shows none, and any the model returns are ignored.
    bands: b.curves.length > 0 ? [] : worldBands(b),
    // Likewise its profiles, and a part with a run on two sides shows none (worldProfiles: null; AI-profiles spec §4.2, R6.3).
    profiles: b.curves.length > 0 ? [] : worldProfiles(b) ?? [] };
};

/** The smallest local corner of a definition's parts, per axis (a position is an own field, so the stored one). */
export const definitionCorner = (boards: readonly StoredBoard[]): V3 =>
  [0, 1, 2].map((k) => Math.min(...boards.map((b) => b.position[k]!))) as V3;

/** Every number the design carries: positions, sizes, placement origins, taper numbers, chamfer legs, hole numbers
 *  (each row's offset components, depth, pitch and diameter; AI-holes spec §3.3) and profile numbers (size, fillet, depth,
 *  start, end; AI-profiles spec §3.4) (refine spec §4, "exact values"). Angles are kept exactly by the exact-angle map instead (`angleRatiosOf`, AI-angles spec §6.2). */
export function designValues(design: GeneratedDesign): Set<number> {
  const out = new Set<number>();
  const add = (v: { x: number; y: number; z: number }) => { out.add(v.x); out.add(v.y); out.add(v.z); };
  const addTapers = (p: GeneratedPart) => {
    for (const t of p.tapers ?? []) { out.add(t.start); out.add(t.amount); }
    for (const c of p.chamfers ?? []) { out.add(c.legs[0]); out.add(c.legs[1]); }
    for (const h of p.holes ?? []) { add(h.offset); out.add(h.depth); out.add(h.pitch); out.add(h.diameter); }
    for (const f of p.profiles ?? []) { out.add(f.size); out.add(f.fillet); out.add(f.depth); out.add(f.start); out.add(f.end); }
  };
  for (const p of design.parts) { add(p.at); add(p.size); addTapers(p); }
  for (const a of design.assemblies ?? []) {
    for (const p of a.parts) { add(p.at); add(p.size); addTapers(p); }
    for (const pl of a.placements) add(pl.at);
  }
  return out;
}

/** The part as the pre-checks judge it: a featured part keeps its own frame (its features are stored in it); a plain one is re-oriented as the design will encode it. */
const inOwnFrame = (b: Board): Board => (hasFrameFeatures(b) ? b : { ...b, ...orient(boardExtents(b)) });

export function documentToDesign(doc: SloydDocument, max: RefineMax): { design: GeneratedDesign } | { refused: RefineRefusal } {
  const shapes = shapeMap(doc);
  const placed = worldParts(doc).length;
  if (placed === 0) return refuse('empty', 'There is nothing to refine yet.');
  const stored: StoredBoard[] = [...doc.boards, ...doc.definitions.flatMap((d) => d.boards)];
  // Defence in depth: Refine's own path never reaches this with cuts (plainForRefine's joint gate
  // runs first and hands over the plain parts), but documentToDesign can still be called directly.
  // A recognised finger set's cuts are the one exception: they reach here in place (box-joints spec §7), and the part
  // is kept, never described.
  const unclaimedCuts = (b: StoredBoard) => {
    const r = resolveBoard(shapes, b);
    if (!r) return 0;
    const ids = new Set(fingerSets(r).flatMap((f) => f.cutIds));
    return r.cuts.filter((c) => !ids.has(c.id)).length;
  };
  if (stored.some((b) => unclaimedCuts(b) > 0)) {
    return refuse('cuts', 'Refine works on prototypes without joints. Refine first, then add joinery.');
  }
  // A leaning part, one with a tilted hole row or one with a round tenon is KEPT, never described (splayed legs spec §8): it is left out of the design and of every pre-check
  // below (its angle cuts are in its own leaned frame, which no world-word converter reads). Only at the root: an
  // assembly's definition is rebuilt from the model's, so such a part inside one is refused.
  const inAssembly = leaningInAssembly(doc);
  if (inAssembly !== null) return refuse('lean-assembly', `Refine can't keep a leaning part, a part with angled holes or a part with a round tenon inside an assembly yet — Ungroup it first: ${inAssembly}.`);
  // A box-jointed part inside an assembly keeps the WHOLE assembly (box-joints spec §7, Amended): its definition and every
  // root placement are left out of the design and of the pre-checks below, as a kept root part is. Its Shapes go back as
  // stored, so none may have a user outside the kept set (R3).
  const linked = keptAssemblyLinkRefusal(doc);
  if (linked !== null) return refuse('lean-assembly', linked);
  const kept = keptParts(doc);
  const keptIds = new Set(kept.boards.map((b) => b.id));
  const keptPlacements = new Set(kept.instances.map((i) => i.id));
  const keptDefs = new Set(kept.definitions.map((d) => d.id));
  // A kept placement's parts sit one level down (a nested one is refused below, unchanged), so the path's parent is its id.
  const isKept = (b: Board) => { const at = parentPath(b.id); return at === null ? keptIds.has(b.id) : keptPlacements.has(at); };
  const described = flatDocument(doc).boards.filter((b) => !isKept(b));
  // A taper Refine cannot describe exactly is refused, never rewritten (spec §5.2). Flat names, as the person sees them.
  const odd = described.filter((b) => worldTapers(b) === null).map((b) => b.name);
  if (odd.length === 1) return refuse('taper-form', `${odd[0]}'s taper can't be described to Refine — edit it in Properties first.`);
  if (odd.length > 1) return refuse('taper-form', `The tapers on ${odd.slice(0, 3).join(', ')}${odd.length > 3 ? '…' : ''} can't be described to Refine — edit them in Properties first.`);
  // A standard-form taper the CONVERTER would reject is refused here too, by the converter's own rule (taperCutsFor) on
  // the board as the design will encode it (orient: longest side = length) — sent, it would be a new fault every round
  // the model cannot fix without changing the person's taper (fu 309). The reason is worded for the person.
  const unencodable = described.flatMap((b) => {
    const tapers = worldTapers(b);
    if (!tapers || tapers.length === 0) return [];
    const made = taperCutsFor(inOwnFrame(b), tapers);
    return 'fault' in made ? [{ name: b.name, why: TAPER_REASON[made.code] }] : [];
  });
  if (unencodable.length === 1) {
    const [u] = unencodable;
    return refuse('taper-form', `${u!.name}'s taper can't be described to Refine (${u!.why}) — edit it in Properties first.`);
  }
  if (unencodable.length > 1) {
    const names = unencodable.map((u) => u.name);
    const whys = new Set(unencodable.map((u) => u.why));
    const why = whys.size === 1 ? ` (${[...whys][0]})` : '';
    return refuse('taper-form', `The tapers on ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''} can't be described to Refine${why} — edit them in Properties first.`);
  }
  // A miter, bevel or chamfer Refine cannot describe exactly is refused, never rewritten (AI-angles spec §6.1).
  const flatBoards = described;
  const oddKind = (b: Board) => b.angleCuts.find((c) => c.kind !== 'taper' && worldAngles({ ...b, angleCuts: [c] }) === null)?.kind;
  const oddAngles = flatBoards.flatMap((b) => { const k = oddKind(b); return k ? [{ name: b.name, kind: k }] : []; });
  if (oddAngles.length === 1) return refuse('angle-form', `${oddAngles[0]!.name}'s ${oddAngles[0]!.kind} can't be described to Refine — edit it in Properties first.`);
  if (oddAngles.length > 1) return refuse('angle-form', `The angle cuts on ${oddAngles.slice(0, 3).map((o) => o.name).join(', ')}${oddAngles.length > 3 ? '…' : ''} can't be described to Refine — edit them in Properties first.`);
  // …and one the converter would reject on the part as the design re-encodes it (orient), as fu 309 does for tapers.
  const unbuildable = flatBoards.flatMap((b) => {
    const a = worldAngles(b);
    if (!a || a.miters.length + a.bevels.length + a.chamfers.length === 0) return [];
    const made = angleCutsFor(inOwnFrame(b), a, angleRatiosOf([b]));
    if (!('fault' in made)) return [];
    const kind = (['miter', 'bevel', 'chamfer'] as const).find((k) => made.fault.includes(k)) ?? 'angle cut';
    return [{ name: b.name, kind, why: ANGLE_REASON[made.code] }];
  });
  if (unbuildable.length === 1) {
    const [u] = unbuildable;
    return refuse('angle-form', `${u!.name}'s ${u!.kind} can't be described to Refine (${u!.why}) — edit it in Properties first.`);
  }
  if (unbuildable.length > 1) {
    return refuse('angle-form', `The angle cuts on ${unbuildable.slice(0, 3).map((u) => u.name).join(', ')}${unbuildable.length > 3 ? '…' : ''} can't be described to Refine — edit them in Properties first.`);
  }
  if (doc.instances.some((i) => i.mirrored === true) || doc.definitions.some((d) => d.instances.some((i) => i.mirrored === true))) {
    return refuse('mirrored', "Refine can't describe a mirrored assembly yet — Ungroup the mirrored copy first.");
  }
  if (doc.instances.some((i) => i.rotation !== 0)) {
    return refuse('turned', 'Refine cannot keep a turned assembly. Turn it back to 0°, or ungroup it.');
  }
  if (doc.definitions.some((d) => d.instances.length > 0)) {
    return refuse('nested', 'Refine cannot keep an assembly inside another assembly. Ungroup the inner one.');
  }
  const distinct = distinctParts(doc);
  if (distinct > max.distinct) return refuse('too-large', `This design has ${distinct} distinct parts; Refine handles up to ${max.distinct}.`);
  if (placed > max.placed) return refuse('too-large', `${placed} placed parts; Refine handles up to ${max.placed}.`);

  // One role per shape, so the model sees which parts are the same part; it
  // returns roles and Sloyd re-links by role and exact equality (invariant 45).
  const roles = new Map<string, string>();
  const roleOf = (b: StoredBoard) => {
    if (!isShaped(b)) return '';
    let r = roles.get(b.shape);
    if (!r) { r = `linked-${roles.size + 1}`; roles.set(b.shape, r); }
    return r;
  };
  const boxes = (bs: StoredBoard[], shift?: V3) => bs.flatMap((b) => {
    const r = resolveBoard(shapes, b);
    return r ? [box(r, b.name, roleOf(b), shift)] : [];
  });
  const parts = boxes(doc.boards.filter((b) => !keptIds.has(b.id)));
  const assemblies: GeneratedAssembly[] = doc.definitions.filter((d) => !keptDefs.has(d.id)).flatMap((d) => {
    // Normalised: the assembly's parts start at 0 and each placement is the
    // world position of that corner (origin + corner), so what the model sees
    // does not depend on how Group happened to split origin from local (spec §4).
    const corner = d.boards.length === 0 ? ([0, 0, 0] as V3) : definitionCorner(d.boards);
    const placements = doc.instances.filter((i) => i.definition === d.id)
      .map((i) => ({ name: i.name, at: { x: i.position[0] + corner[0], y: i.position[1] + corner[1], z: i.position[2] + corner[2] } }));
    // A Definition has no name; matching never depends on this one (spec §4).
    return placements.length === 0 ? [] : [{ name: placements[0]!.name, parts: boxes(d.boards, corner), placements }];
  });
  return { design: { name: doc.name, parts, assemblies } };
}
