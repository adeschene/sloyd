import { useMemo } from 'react';
import { useStore } from '../store/store';
import { guideSnapPoints } from '../document/document';
import { visibleGuides } from '../store/visibility';
import { SnapMarker } from './SnapMarker';

/**
 * Every guide point in the document, drawn whenever guides are shown.
 *
 * Independent of any tool: a guide is document data, so it is visible in
 * Select mode too — unlike a snap marker, which is transient chrome that only
 * exists while a tool is hovering something.
 *
 * Reuses SnapMarker rather than drawing its own disc, in its RESTING variant.
 * A guide's hue names what it is in both states; the SIZE is what says whether
 * it is currently picked. Without that distinction a guide would be the one
 * kind of point where hovering gives no confirmation at all, because the
 * marker was already there — see design §5.2.
 *
 * The hovered marker is drawn by whichever tool is hovering it (MoveTool,
 * TapeTool), on top of this one and at full size. Two markers at one position
 * is correct and is what produces the growth — same hue, so the small one
 * simply disappears inside the large one.
 *
 * A HIDDEN guide is not drawn (selectable-guides spec §3.5: through `visibleGuides`, in the memo, never a selector). A
 * SELECTED guide point is drawn emphasised by the same mechanism a hover uses: a full-size marker over its resting one
 * (spec §6), so a selected point reads exactly as a hovered one does.
 */
export function GuideMarkers({ emphasise }: { emphasise: boolean }) {
  const guides = useStore((s) => s.doc.guides);
  const hiddenGuideIds = useStore((s) => s.hiddenGuideIds);
  const selectedGuideIds = useStore((s) => s.selectedGuideIds);
  const points = useMemo(() => guideSnapPoints(visibleGuides(guides, hiddenGuideIds)), [guides, hiddenGuideIds]);
  // None in the capture's clean frame (`emphasise` false): a selected look is chrome, as a part's is.
  const selected = useMemo(() => new Set(emphasise ? selectedGuideIds : []), [emphasise, selectedGuideIds]);
  return (
    <>
      {points.map((p) => (
        <SnapMarker key={p.owner.id} point={p} resting />
      ))}
      {points.filter((p) => selected.has(p.owner.id)).map((p) => (
        <SnapMarker key={`selected-${p.owner.id}`} point={p} />
      ))}
    </>
  );
}
