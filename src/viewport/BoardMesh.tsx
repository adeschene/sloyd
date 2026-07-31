import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  boardCenter, boardEdges, boardExtents, boardSolids, pointToLocalXYZ,
  solidWorldBox, MATERIALS, DEFAULT_MATERIAL,
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
  const geometries = useMemo(() => {
    return boardSolids(board).map((solid) => {
      const { center, size } = solidWorldBox(board, solid);
      const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
      geo.setAttribute('uv', new THREE.BufferAttribute(boardUVs(board, solid), 2));
      return { geo, center };
    });
  }, [
    extents[0], extents[1], extents[2],
    boardUVSignature(board),
  ]);

  // Every geometry, not just the first — disposing one of N leaks the rest
  // on every rebuild.
  useEffect(() => () => geometries.forEach(({ geo }) => geo.dispose()), [geometries]);

  // Edges come from the cell grid, not from the solids: the remainder around
  // a dado is L-shaped in section, so per-solid EdgesGeometry would draw
  // seams across the board's own uncut faces. See boardEdges.
  const edges = useMemo(() => {
    const points = boardEdges(board).flatMap(([a, b]) => [
      ...pointToLocalXYZ(board, a),
      ...pointToLocalXYZ(board, b),
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geo;
  }, [extents[0], extents[1], extents[2], boardUVSignature(board)]);

  useEffect(() => () => edges.dispose(), [edges]);

  const kinds = faceGrainKinds(board);
  const family = grainFamily(board.material);

  return (
    <group position={center}>
      {geometries.map(({ geo, center: offset }, index) => (
        <mesh
          key={index}
          geometry={geo}
          position={offset}
          castShadow
          receiveShadow
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
          {/* One material per face, in BoxGeometry's group order, so a face, an
              edge and an end can each show their own cut of the wood. The texture
              is a shared greyscale mask; the species colour tints it.
              polygonOffset pushes the faces back a hair so the edge lines below —
              which sit exactly on those faces — draw solid instead of stippling
              through the depth test. */}
          {kinds.map((kind, i) => (
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
