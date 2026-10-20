import { bandFaults, bandFaultText, bandsMeetAtCorner, sameSide, withBands } from '../document/banding';
import type { BandType, Board, ProfileSide } from '../document/types';

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** The reason an edit would ADD a band fault to any of `parts` (capitalised, `Needs a straight edge`), or null
 *  (edge banding spec §5.1, §3.4): a (side, kind) the part's bands lack now and would carry after the edit. Clearing is
 *  never refused, and a fault a part already carries does not refuse. */
export function bandEditRefusal(parts: readonly Board[], types: readonly BandType[], sides: readonly ProfileSide[], type: string | null): string | null {
  if (type === null) return null;
  for (const part of parts) {
    const before = bandFaults(part, types);
    const after = bandFaults({ ...part, bands: withBands(part.bands, sides, type) }, types);
    const added = after.find((f) => !before.some((g) => g.kind === f.kind && sameSide(g.side, f.side)));
    if (added) return cap(bandFaultText(added.kind));
  }
  return null;
}

/** Whether the Corners select shows: some part has two adjacent sides banded with thickness, one of them solid — the cut
 *  list's corner-words rule (`bandsMeetAtCorner`, one home). */
export function bandsShownCorner(parts: readonly Board[], types: readonly BandType[]): boolean {
  return parts.some((p) => bandsMeetAtCorner(p, types));
}
