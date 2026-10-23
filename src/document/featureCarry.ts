import type { GeneratedAssembly, GeneratedDesign, GeneratedPart, PartCarry } from './generated';
import type { Board, SloydDocument } from './types';
import { copyHoleRow } from './holes';
import { copyCurve } from './curves';
import { copyProfile } from './profiles';
import { copyBand } from './bandModel';
import { copyHardwareUse } from './hardwareModel';
import { NAME_SEPARATOR, flatDocument } from './tree';
import { axisDimensions, boardExtents } from './geometry';
import { kindsText, nounsText } from './carryText';
import type { Violation } from './designCheck';
import type { FlatDocument } from './types';

export type FeatureKind = 'holes' | 'curves' | 'profiles' | 'bands' | 'hardware';

/** The feature kinds a (resolved) part carries, in the canonical order. */
export function featuredKinds(b: Board): FeatureKind[] {
  const out: FeatureKind[] = [];
  if (b.holes.length > 0) out.push('holes');
  if (b.curves.length > 0) out.push('curves');
  if (b.profiles.length > 0) out.push('profiles');
  if (b.bands.length > 0) out.push('bands');
  if (b.hardware.length > 0) out.push('hardware');
  return out;
}

/** Board-local features, which need the original's frame (refine-features spec §3.2). Hardware has none. */
export function hasFrameFeatures(b: Board): boolean {
  return b.holes.length > 0 || b.curves.length > 0 || b.profiles.length > 0 || b.bands.length > 0;
}

const carryOf = (b: Board): PartCarry => ({
  ...(hasFrameFeatures(b) ? { frame: { posture: b.posture, rotation: b.rotation } } : {}),
  originalHoles: b.holes.map(copyHoleRow), curves: b.curves.map(copyCurve), profiles: b.profiles.map(copyProfile),
  bands: b.bands.map(copyBand), cornerRule: b.cornerRule, hardware: b.hardware.map(copyHardwareUse),
});

/**
 * What the model never sees (refine spec §4; refine-features spec §3.1): each returned part whose flat display
 * name matches an original part takes that part's grain and, when it has any, its features (`carry`); an assembly
 * part tries each of its placements in order, and an assembly takes the hardware of the definition behind its
 * first matching placement. Every other part has neither. Runs BEFORE conversion, so role linking's sameShared
 * judges the real values. A part with nothing to carry gets no `carry` key at all.
 */
export function carryFromOriginal(design: GeneratedDesign, original: SloydDocument): GeneratedDesign {
  const byName = new Map(flatDocument(original).boards.map((b) => [b.name, b] as const));
  const set = (p: GeneratedPart, names: string[]): GeneratedPart => {
    const { grain: _grain, carry: _carry, ...rest } = p;
    const hit = names.map((n) => byName.get(n)).find((b) => b !== undefined);
    if (!hit) return rest;
    const out: GeneratedPart = { ...rest, grain: hit.grain };
    return featuredKinds(hit).length > 0 ? { ...out, carry: carryOf(hit) } : out;
  };
  const defHardware = (a: GeneratedAssembly) => {
    for (const pl of a.placements) {
      const inst = original.instances.find((i) => i.name === pl.name);
      const def = inst && original.definitions.find((d) => d.id === inst.definition);
      if (def) return def.hardware;
    }
    return [];
  };
  return {
    ...design,
    parts: design.parts.map((p) => set(p, [p.name])),
    assemblies: (design.assemblies ?? []).map((a) => {
      const { carry: _c, ...rest } = a;
      const hw = defHardware(a);
      return {
        ...rest,
        parts: a.parts.map((p) => set(p, a.placements.map((pl) => `${pl.name}${NAME_SEPARATOR}${p.name}`))),
        ...(hw.length > 0 ? { carry: { hardware: hw.map(copyHardwareUse) } } : {}),
      };
    }),
  };
}

/**
 * A featured part returned lying another way (refine-features spec §4): the original's holes, curves, profiles and bands
 * are anchored to its faces, so a part whose thickness ran along world axis k and whose returned thickest-to-thinnest
 * order no longer puts its smallest extent there has them on the wrong faces. Only a part whose thickness axis is
 * (tied for) its smallest extent is judged, and a tie in the result passes: a turn cannot be told from no turn.
 */
export function featureTurned(refined: FlatDocument, original: FlatDocument): Violation[] {
  const byName = new Map(original.boards.map((b) => [b.name, b] as const));
  const out: Violation[] = [];
  for (const r of refined.boards) {
    const o = byName.get(r.name);
    if (!o || !hasFrameFeatures(o)) continue;
    const k = axisDimensions(o).indexOf('thickness');
    const e0 = boardExtents(o);
    const min0 = Math.min(...e0);
    // T: every world axis tied for the original's smallest extent (exact); the thickness axis must be one of them.
    const tied = [0, 1, 2].filter((a) => e0[a]! === min0);
    if (!tied.includes(k)) continue;
    const e1 = boardExtents(r);
    const min1 = Math.min(...e1);
    // Turned only if NO tied axis is still a smallest axis of the result (a tie in the result passes too).
    if (tied.some((a) => e1[a]! === min1)) continue;
    const kinds = kindsText(o);
    const { text, plural } = nounsText(o);
    out.push({
      kind: 'feature-turned', parts: [r.name],
      message: `${r.name} carries ${kinds} Sloyd keeps on the part; keep it the same way round, ${+e0[k]!.toFixed(3)}in along ${'xyz'[k]}.`,
      shown: `${r.name} was turned onto another face; its ${text} ${plural ? 'are' : 'is'} now on the wrong faces.`,
    });
  }
  return out;
}
