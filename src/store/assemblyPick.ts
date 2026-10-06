/**
 * What a click on a part selects (assemblies spec §3.2–3.3): its ancestor one
 * level below the open assembly. A part outside the open assembly closes it to
 * the deepest level both share, and is picked at that level. Pure; the
 * viewport (clickPart) and the double-click (openPart) both use it.
 */
export function clickTarget(occ: string, openPath: string | null): { open: string | null; target: string } {
  const segs = occ.split('/');
  const open = openPath === null ? [] : openPath.split('/');
  let k = 0;
  while (k < open.length && k < segs.length - 1 && segs[k] === open[k]) k += 1;
  return { open: k === 0 ? null : open.slice(0, k).join('/'), target: segs.slice(0, k + 1).join('/') };
}
