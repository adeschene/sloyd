import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { boardCenter, boardExtents, MATERIALS, DEFAULT_MATERIAL } from '../document/document';
import type { Board } from '../document/document';

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
        <meshStandardMaterial
          color={color}
          roughness={0.75}
          metalness={0}
          emissive={selected ? '#e07a3f' : '#000000'}
          emissiveIntensity={selected ? 0.18 : 0}
        />
      </mesh>

      <lineSegments geometry={edges}>
        <lineBasicMaterial color={selected ? '#e07a3f' : '#00000055'} />
      </lineSegments>
    </group>
  );
}
