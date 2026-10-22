import type { GeneratedAssembly, GeneratedDesign, GeneratedPart, PartCarry } from './generated';
import type { Board, SloydDocument } from './types';
import { copyHoleRow } from './holes';
import { copyCurve } from './curves';
import { copyProfile } from './profiles';
import { copyBand } from './bandModel';
import { copyHardwareUse } from './hardwareModel';
import { NAME_SEPARATOR, flatDocument } from './tree';

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
  holes: b.holes.map(copyHoleRow), curves: b.curves.map(copyCurve), profiles: b.profiles.map(copyProfile),
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
