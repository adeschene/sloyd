import type { Board, SloydDocument, StoredBoard } from './types';
import type { GeneratedAssembly, GeneratedDesign, GeneratedPart } from './generated';
import { distinctParts } from './assemblyChecks';
import { boardExtents } from './geometry';
import { isShaped, resolveBoard, shapeMap } from './shapes';
import { NAME_SEPARATOR, flatDocument, worldParts } from './tree';

/**
 * Refine's input (refine spec §2): the open design in Generate's own format —
 * loose parts as world boxes, each definition as one assembly of local boxes
 * with one placement per instance. The inverse of designToDocument, for the
 * designs that format can express; everything else is REFUSED here, on the
 * document alone, before any model call.
 */
export type RefusalReason = 'empty' | 'cuts' | 'turned' | 'nested' | 'too-large';
export interface RefineRefusal { reason: RefusalReason; message: string }
export interface RefineMax { distinct: number; placed: number }

const refuse = (reason: RefusalReason, message: string) => ({ refused: { reason, message } });

const box = (b: Board, name: string, role: string): GeneratedPart => {
  const [x, y, z] = boardExtents(b);
  return { name, role, material: b.material, at: { x: b.position[0], y: b.position[1], z: b.position[2] }, size: { x, y, z } };
};

export function documentToDesign(doc: SloydDocument, max: RefineMax): { design: GeneratedDesign } | { refused: RefineRefusal } {
  const shapes = shapeMap(doc);
  const placed = worldParts(doc).length;
  if (placed === 0) return refuse('empty', 'There is nothing to refine yet.');
  const stored: StoredBoard[] = [...doc.boards, ...doc.definitions.flatMap((d) => d.boards)];
  if (stored.some((b) => (resolveBoard(shapes, b)?.cuts.length ?? 0) > 0)) {
    return refuse('cuts', 'Refine works on prototypes without joints. Refine first, then add joinery.');
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
  const boxes = (bs: StoredBoard[]) => bs.flatMap((b) => {
    const r = resolveBoard(shapes, b);
    return r ? [box(r, b.name, roleOf(b))] : [];
  });
  const parts = boxes(doc.boards);
  const assemblies: GeneratedAssembly[] = doc.definitions.flatMap((d) => {
    const placements = doc.instances.filter((i) => i.definition === d.id)
      .map((i) => ({ name: i.name, at: { x: i.position[0], y: i.position[1], z: i.position[2] } }));
    // A Definition has no name; matching never depends on this one (spec §4).
    return placements.length === 0 ? [] : [{ name: placements[0]!.name, parts: boxes(d.boards), placements }];
  });
  return { design: { name: doc.name, parts, assemblies } };
}

/**
 * The model never sees grain (refine spec §4): each returned part whose flat
 * display name matches an original part takes that part's grain; an assembly
 * part tries each of its placements in order. Every other part has none, so
 * the converter gives it 'length'. Runs BEFORE conversion, so role linking's
 * sameShared judges the real values.
 */
export function carryGrain(design: GeneratedDesign, original: SloydDocument): GeneratedDesign {
  const grain = new Map(flatDocument(original).boards.map((b) => [b.name, b.grain] as const));
  const set = (p: GeneratedPart, names: string[]): GeneratedPart => {
    const { grain: _old, ...rest } = p;
    const hit = names.map((n) => grain.get(n)).find((g) => g !== undefined);
    return hit ? { ...rest, grain: hit } : rest;
  };
  return {
    ...design,
    parts: design.parts.map((p) => set(p, [p.name])),
    assemblies: (design.assemblies ?? []).map((a) => ({
      ...a,
      parts: a.parts.map((p) => set(p, a.placements.map((pl) => `${pl.name}${NAME_SEPARATOR}${p.name}`))),
    })),
  };
}
