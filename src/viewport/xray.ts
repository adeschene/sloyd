import { isCovered } from '../document/document';

/**
 * The ONE decision of whether a part draws in `BoardMesh`'s faded look (assemblies spec §3.3, x-ray spec §3): faded when
 * it is outside the open assembly, OR when X-ray is on, something is selected and the selection does not cover it.
 *
 * The assembly term is gated on `clean` (Save image's clean frame drops it); the X-ray term is NOT, so a saved image keeps the
 * x-rayed look. Nothing selected fades nothing. X-ray off returns exactly the assembly term.
 */
export function fadedFor(
  id: string,
  view: { clean: boolean; openPath: string | null; xray: boolean; selected: ReadonlySet<string> },
): boolean {
  const { clean, openPath, xray, selected } = view;
  return (!clean && openPath !== null && !id.startsWith(`${openPath}/`))
    || (xray && selected.size > 0 && !isCovered(id, selected));
}
