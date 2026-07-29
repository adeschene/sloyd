import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { useStore } from '../store/store';
import { BoardMesh } from './BoardMesh';
import { Gizmo } from './Gizmo';

export function Viewport() {
  const boards = useStore((s) => s.doc.boards);
  const selectedId = useStore((s) => s.selectedId);
  const selectBoard = useStore((s) => s.selectBoard);

  return (
    <Canvas
      shadows
      camera={{ position: [40, 30, 40], fov: 45, near: 0.1, far: 1000 }}
      onPointerMissed={() => selectBoard(null)}
    >
      <color attach="background" args={['#f2efe9']} />
      <hemisphereLight intensity={0.55} groundColor="#b9b2a6" />
      <directionalLight
        position={[30, 45, 20]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />

      {/* One inch per cell, one foot per section — the units are the grid. */}
      <Grid
        args={[240, 240]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#c9c2b6"
        sectionSize={12}
        sectionThickness={1}
        sectionColor="#9c9384"
        infiniteGrid
        fadeDistance={220}
        followCamera={false}
      />

      {boards.map((board) => (
        <BoardMesh
          key={board.id}
          board={board}
          selected={board.id === selectedId}
          onSelect={selectBoard}
        />
      ))}

      <Gizmo />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
    </Canvas>
  );
}
