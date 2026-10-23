import type { Band, BandType, Board, ProfileSide } from './types';
import { BUILT_IN_BAND_ID, canonicalBands, freeName, newBandType, sideIndex } from './bandModel';
import type { MaterialCatalog } from './materials';
import { DIRS, dirToLocal, localToDir } from './taperWorld';
import type { WorldBand } from './generated';

/**
 * Edge bands in WORLD words (AI-bands spec §3): the design schema's form. The ONE place a design band crosses to a
 * stored `Band` and back, and the ONE place `"solid <material>"` keys become band types. Directions go through
 * `dirToLocal`/`localToDir` (inv 44). Model-facing text only (no `→ units`).
 */

/** The thickness a minted solid type takes, and the only thickness a `"solid <m>"` key reuses (spec §3.2). */
const SOLID_THICKNESS = 0.25;
const SOLID_PREFIX = 'solid ';

/**
 * The design-wide pass (spec §3.2): `keys` are every `edging` in the design. Returns the types (the input first, then
 * any minted) and the key → type id map. `"veneer"` is the built-in type; a type id is itself; `"solid <m>"` reuses the
 * project's first solid type of material `m` at 1/4in, else mints ONE (however many keys name it) called
 * `<label> edging`, unique by `freeName`. `idOf` throws on a key it was never given.
 */
export function mintBandTypes(
  keys: readonly string[], types: readonly BandType[], catalog: MaterialCatalog,
): { types: BandType[]; idOf: (key: string) => string } {
  const all: BandType[] = [...types];
  const ids = new Map<string, string>();
  for (const key of keys) {
    if (ids.has(key)) continue;
    if (key === 'veneer') { ids.set(key, BUILT_IN_BAND_ID); continue; }
    if (key.startsWith(SOLID_PREFIX)) {
      const material = key.slice(SOLID_PREFIX.length);
      let found = all.find((t) => t.kind === 'solid' && t.material === material && t.thickness === SOLID_THICKNESS);
      if (!found) {
        const fresh = newBandType('solid', all);
        found = { ...fresh, material, thickness: SOLID_THICKNESS, name: freeName(`${catalog.label(material)} edging`, all) } as BandType;
        all.push(found);
      }
      ids.set(key, found.id);
      continue;
    }
    ids.set(key, key);
  }
  return {
    types: all,
    idOf: (key) => {
      const id = ids.get(key);
      if (id === undefined) throw new Error(`bandWorld: unknown edging key ${key}`);
      return id;
    },
  };
}

/**
 * Design bands → stored bands on `b` (oriented), canonical; or the first SHAPE fault, as a phrase the caller prefixes
 * with the part's name. An edge on the thickness axis is a broad face, not an edge.
 */
export function bandsFor(b: Board, entries: readonly WorldBand[], idOf: (key: string) => string): { bands: Band[] } | { fault: string } {
  const seen = new Set<number>();
  const out: Band[] = [];
  for (const e of entries) {
    if (!DIRS.includes(e.edge)) return { fault: `has edging on ${String(e.edge)}, which is not a direction` };
    const l = dirToLocal(b, e.edge);
    if (l.dim === 'thickness') return { fault: `has edging on a broad face (${e.edge})` };
    const side: ProfileSide = { across: l.dim, from: l.from };
    const i = sideIndex(side);
    if (seen.has(i)) return { fault: `has two edgings on ${e.edge}` };
    seen.add(i);
    out.push({ side, type: idOf(e.edging) });
  }
  return { bands: canonicalBands(out) };
}

/** A part's stored bands in world words, canonical order. */
export function worldBands(b: Board): WorldBand[] {
  return canonicalBands(b.bands).map((x) => ({
    edge: localToDir(b, x.side.across, x.side.from),
    edging: x.type === BUILT_IN_BAND_ID ? 'veneer' : x.type,
  }));
}
