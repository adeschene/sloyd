import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { boardCenter, boardExtents, MATERIALS, DEFAULT_MATERIAL } from '../document/document';
import type { Board } from '../document/document';

/** Brass — the one live colour in the app. */
const SELECTED = '#c99a4e';

/**
 * How dark an edge line is relative to the stock it outlines. A single flat
 * edge colour reads on pine and vanishes on walnut; deriving it from the wood
 * keeps every joint visible whatever the species.
 */
const EDGE_DARKEN = 0.3;

interface Props {
  board: Board;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function BoardMesh({ board, selected, onSelect }: Props) {
  // Geometry is derived from the document on every render — the mesh is never
  // the source of truth. Extents already account for rotation and standing,
  // so the mesh itself is axis-aligned and never carries a rotation.
  const extents = boardExtents(board);
  const center = boardCenter(board);
  const color = (MATERIALS[board.material] ?? MATERIALS[DEFAULT_MATERIAL]).color;
  const edgeColor = useMemo(
    () => new THREE.Color(color).multiplyScalar(EDGE_DARKEN),
    [color],
  );

  // Edge lines make joints legible — the single biggest readability win.
  // Build the geometry once per size and dispose both it and the temporary box
  // it was derived from; constructing these inline would leak GPU memory on
  // every render.
  const edges = useMemo(() => {
    const box = new THREE.BoxGeometry(extents[0], extents[1], extents[2]);
    const geo = new THREE.EdgesGeometry(box);
    box.dispose();
    return geo;
  }, [extents[0], extents[1], extents[2]]);

  useEffect(() => () => edges.dispose(), [edges]);

  return (
    <group position={center}>
      <mesh
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect(board.id);
        }}
      >
        <boxGeometry args={extents} />
        {/* polygonOffset pushes the faces back a hair so the edge lines below —
            which sit exactly on those faces — draw solid instead of stippling
            through the depth test. This is what makes joints legible. */}
        <meshStandardMaterial
          color={color}
          roughness={0.72}
          metalness={0}
          emissive={selected ? SELECTED : '#000000'}
          emissiveIntensity={selected ? 0.16 : 0}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>

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
