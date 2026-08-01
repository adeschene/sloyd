import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  boardCenter, boardEdges, boardExtents, boardSolids, pointToLocalXYZ,
  solidWorldBox, wholeBoard, MATERIALS, DEFAULT_MATERIAL,
} from '../document/document';
import type { Board } from '../document/document';
import { faceGrainKinds, grainFamily } from './grainFaces';
import { boardUVs, boardUVSignature } from './grainTiling';
import { grainTexture } from './grainTexture';

/** Brass — the one live colour in the app. */
const SELECTED = '#c99a4e';

/**
 * How dark an edge line is relative to the stock it outlines. A single flat
 * edge colour reads on pine and vanishes on walnut; deriving it from the wood
 * keeps every joint visible whatever the species.
 */
const EDGE_DARKEN = 0.3;

/**
 * How far the pointer may travel between press and release and still count as
 * a click rather than a drag, in screen pixels. Matches the slop R3F applies
 * to its own pointer-missed handling.
 */
const CLICK_DRAG_SLOP_PX = 2;

/**
 * How solid the placeholder ghost is when a board's own cuts have removed all
 * of its stock (`boardSolids` returning `[]` — follow-ups 48 and 49).
 *
 * Browser-settled by comparison, not derived. 0.1 was rendered against this
 * app's near-white ground and rejected: at that value the grid reads straight
 * through the fill and the ghost collapses to outline-only, which is exactly
 * what the fill exists to avoid — see invariant 21 for why an outline alone is
 * not enough. 0.22 gives it a discernible body while staying faint enough to
 * read as absent stock rather than as a board that is merely translucent.
 *
 * Two values compared in one browser on one background, not a sweep. A darker
 * theme would want this re-checked.
 */
const GHOST_OPACITY = 0.22;

interface Props {
  board: Board;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function BoardMesh({ board, selected, onSelect }: Props) {
  // Geometry is derived from the document on every render — the mesh is never
  // the source of truth. Extents already account for rotation and posture,
  // so the mesh itself is axis-aligned and never carries a rotation.
  const extents = boardExtents(board);
  const center = boardCenter(board);
  const color = (MATERIALS[board.material] ?? MATERIALS[DEFAULT_MATERIAL]).color;
  const edgeColor = useMemo(
    () => new THREE.Color(color).multiplyScalar(EDGE_DARKEN),
    [color],
  );

  // One geometry per solid. Keyed on boardUVSignature — see its doc comment —
  // which now covers cuts, so adding a dado rebuilds these. extents stay in
  // the array for the same reason as before: the box's own size belongs on
  // the memo that builds the box.
  //
  // `boardSolids` can legitimately return `[]` — a board whose own cuts have
  // consumed all of its stock, reachable by shrinking a dimension past an
  // existing cut (follow-up 48) or by two individually-legal cuts that jointly
  // remove everything (49). Before this branch existed the board then drew
  // nothing at all: no meshes, and no edges either, since boardEdges' rule
  // draws nothing when every cell is empty. It stayed in the parts list showing
  // its dimensions while being invisible and unclickable in the viewport, and a
  // reload silently repaired it (validateCuts drops the offending cut), which
  // made the state look like a rendering glitch rather than something the user
  // did. So: fall back to one placeholder box at the board's own AABB.
  //
  // The fallback lives in THIS memo rather than a new one on purpose. A second
  // memo would need its own hand-written dependency list, which is exactly
  // invariant 15's failure mode; riding along here inherits the signature key
  // and the disposal effect below for free.
  const geometries = useMemo(() => {
    const solids = boardSolids(board);
    if (solids.length === 0) {
      const { center, size } = solidWorldBox(board, wholeBoard(board));
      return {
        placeholder: true,
        items: [{ geo: new THREE.BoxGeometry(size[0], size[1], size[2]), center }],
      };
    }
    return {
      placeholder: false,
      items: solids.map((solid) => {
        const { center, size } = solidWorldBox(board, solid);
        const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
        geo.setAttribute('uv', new THREE.BufferAttribute(boardUVs(board, solid), 2));
        return { geo, center };
      }),
    };
  }, [
    extents[0], extents[1], extents[2],
    boardUVSignature(board),
  ]);

  // Every geometry, not just the first — disposing one of N leaks the rest
  // on every rebuild.
  useEffect(
    () => () => geometries.items.forEach(({ geo }) => geo.dispose()),
    [geometries],
  );

  // Edges come from the cell grid, not from the solids: the remainder around
  // a dado is L-shaped in section, so per-solid EdgesGeometry would draw
  // seams across the board's own uncut faces. See boardEdges.
  //
  // In the placeholder case boardEdges returns nothing — its rule draws a
  // segment only where filled and empty cells meet, and every cell is empty —
  // so the ghost's outline is taken from its own box instead. That outline is
  // what actually carries the part's shape; the translucent fill only makes it
  // pickable across its whole face rather than within a line's raycast
  // threshold.
  const edges = useMemo(() => {
    if (geometries.placeholder) {
      return new THREE.EdgesGeometry(geometries.items[0].geo);
    }
    const points = boardEdges(board).flatMap(([a, b]) => [
      ...pointToLocalXYZ(board, a),
      ...pointToLocalXYZ(board, b),
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geo;
  }, [extents[0], extents[1], extents[2], boardUVSignature(board), geometries]);

  useEffect(() => () => edges.dispose(), [edges]);

  const kinds = faceGrainKinds(board);
  const family = grainFamily(board.material);

  return (
    <group position={center}>
      {geometries.items.map(({ geo, center: offset }, index) => (
        <mesh
          key={index}
          geometry={geo}
          position={offset}
          // A ghost casts no shadow and receives none — there is no stock here
          // to do either, and a shadow would assert the part is solid.
          castShadow={!geometries.placeholder}
          receiveShadow={!geometries.placeholder}
          onClick={(e) => {
            // Only a click that didn't travel selects. R3F fires onClick for any
            // release whose object was among the pointer-down hits, with no
            // drag threshold of its own (see initialHits in @react-three/fiber's
            // events module), so without this guard a gesture that merely ENDED
            // over a board selected it. Two ways that bit: dragging a board by
            // the gizmo while a second board sat behind the cursor put both in
            // initialHits, so releasing over the second one selected it; and
            // orbiting the camera from a board and releasing re-selected it.
            // e.delta is the pixel distance travelled since pointer-down, which
            // is exactly the drag-versus-click distinction, and 2px matches the
            // threshold R3F itself uses for its miss handling.
            if (e.delta > CLICK_DRAG_SLOP_PX) return;
            e.stopPropagation();
            onSelect(board.id);
          }}
        >
          {/* The ghost takes ONE plain material rather than the six grain
              materials: per-face grain describes how stock was sawn, and this
              board has no stock left to have been sawn from anything. Its job
              is only to be visible and pickable. depthWrite stays off so the
              ghost never occludes real boards standing behind it — a part with
              no stock must not hide one that has some. */}
          {geometries.placeholder ? (
            <meshStandardMaterial
              color={selected ? SELECTED : color}
              roughness={0.9}
              metalness={0}
              transparent
              opacity={GHOST_OPACITY}
              depthWrite={false}
            />
          ) : kinds.map((kind, i) => (
            <meshStandardMaterial
              key={`${i}-${kind}`}
              attach={`material-${i}`}
              map={grainTexture(family, kind)}
              color={color}
              roughness={0.72}
              metalness={0}
              emissive={selected ? SELECTED : '#000000'}
              emissiveIntensity={selected ? 0.16 : 0}
              polygonOffset
              polygonOffsetFactor={1}
              polygonOffsetUnits={1}
            />
          ))}
        </mesh>
      ))}

      {/* THREE.Color cannot parse 8-digit hex — it warns and falls back — so
          the edge's softness lives on the material, not in the colour string. */}
      <lineSegments geometry={edges}>
        <lineBasicMaterial
          color={selected ? SELECTED : edgeColor}
          transparent
          opacity={selected ? 1 : 0.8}
        />
      </lineSegments>
    </group>
  );
}
