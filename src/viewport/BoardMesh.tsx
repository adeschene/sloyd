import type { ToggleModifiers } from '../store/selectionGesture';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  boardCenter, boardExtents, holeRims, holeTouchesBox, partGeometry, pointToLocalXYZ, stockChecks,
  solidWorldBox, wholeBoard,
} from '../document/document';
import type { Board, V3 } from '../document/document';
import { faceGrainKinds, grainFamily } from './grainFaces';
import { bodyMesh, boardUVs, boardUVSignature, holeMesh } from './grainTiling';
import { grainTexture } from './grainTexture';
import { CLICK_DRAG_SLOP_PX, clickPairStartedWithDrag } from './pointer';

/** Oak — the one live colour in the app. */
const SELECTED = '#c8955a';

/**
 * How dark an edge line is relative to the stock it outlines. A single flat
 * edge colour reads on pine and vanishes on walnut; deriving it from the wood
 * keeps every joint visible whatever the species.
 */
const EDGE_DARKEN = 0.3;

/**
 * How solid the placeholder ghost is when a board's own cuts have removed all
 * of its stock (`boardBodies` returning `[]` — follow-ups 48 and 49).
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

/**
 * A part outside the open assembly (assemblies spec §3.3). Plain and nearly
 * grey (the material's hue at FADED_SATURATION of its saturation, no grain
 * map) so it reads as context, not as stock. Its edges stay a little stronger
 * than its faces so the shape still reads.
 *
 * It WRITES depth and draws at FADED_RENDER_ORDER, before the grid (also a
 * transparent object, at 0). Without both, three.js sorts transparent objects
 * by distance and, wherever the grid sorted later, painted grid lines over
 * the faded part. Drawn first with depth, the grid behind it is hidden, while
 * opaque parts (drawn in the earlier opaque pass) still show through.
 * Faded parts cast no shadow: a near-invisible ghost with a solid shadow
 * reads wrong.
 */
const FADED_OPACITY = 0.15;
const FADED_EDGE_OPACITY = 0.3;
const FADED_SATURATION = 0.15;
const FADED_RENDER_ORDER = -1;

interface Props {
  /** View-only exploded translation (plans-sheet spec §4.3); never written back (invariant 1). */
  offset?: [number, number, number];
  board: Board;
  selected: boolean;
  // outside the open assembly: drawn faded, still clickable (a click closes the assembly), still a snap target
  faded: boolean;
  /** Double-click: open the assembly the part belongs to. */
  onOpen: (id: string) => void;
  /** Called with the click's modifiers: plain selects, Shift/Ctrl/Cmd toggles. */
  onSelect: (id: string, modifiers: ToggleModifiers) => void;
  /**
   * False while a viewport tool other than Select owns the pointer.
   *
   * Passed from Viewport rather than read from the store: it is one prop from
   * this component's own parent, not a thread from App, and it keeps BoardMesh
   * prop-driven the way it already is.
   *
   * Without it the Move tool's commit click — which lands ON a board, having
   * travelled ~0 px, so it passes the slop test below — would also select that
   * board, jumping the Properties panel to the part the user just snapped TO
   * rather than the one they moved.
   */
  selectable: boolean;
  /** The material's colour, from the document's catalog (custom materials spec §3) — Viewport reads it. */
  color: string;
}

export function BoardMesh({ board, selected, faded, onOpen, onSelect, selectable, offset, color }: Props) {
  // Geometry is derived from the document on every render — the mesh is never
  // the source of truth. Extents already account for rotation and posture,
  // so the mesh itself is axis-aligned and never carries a rotation.
  const extents = boardExtents(board);
  const center = boardCenter(board);
  const edgeColor = useMemo(
    () => new THREE.Color(color).multiplyScalar(EDGE_DARKEN),
    [color],
  );
  const fadedColor = useMemo(() => {
    const c = new THREE.Color(color);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    return c.setHSL(hsl.h, hsl.s * FADED_SATURATION, hsl.l);
  }, [color]);
  const fadedEdgeColor = useMemo(
    () => fadedColor.clone().multiplyScalar(EDGE_DARKEN),
    [fadedColor],
  );

  // One geometry per solid. Keyed on boardUVSignature — see its doc comment —
  // which now covers cuts, so adding a dado rebuilds these. extents stay in
  // the array for the same reason as before: the box's own size belongs on
  // the memo that builds the box.
  //
  // `boardBodies` can legitimately return `[]` — a board whose own cuts have
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
    const { bodies, holes } = partGeometry(board);
    const checks = stockChecks(board);   // once per rebuild, for every hole's clean test (ruling R15)
    // A ghost has no holes to draw: the placeholder branch is unchanged.
    if (bodies.length === 0) {
      const { center, size } = solidWorldBox(board, wholeBoard(board));
      return {
        placeholder: true,
        items: [{ geo: new THREE.BoxGeometry(size[0], size[1], size[2]), center }],
      };
    }
    return {
      placeholder: false,
      items: [
        ...bodies.map((body) => {
          if (body.box && !holes.some((h) => holeTouchesBox(h, body.box!))) {
            // Today's path, byte-for-byte (angle-cuts spec §3.3; holes spec §3.2: a part with no holes keeps it).
            const { center, size } = solidWorldBox(board, body.box);
            const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
            geo.setAttribute('uv', new THREE.BufferAttribute(boardUVs(board, body.box), 2));
            return { geo, center };
          }
          const m = bodyMesh(board, body, holes, bodies);   // seams between holed bodies skipped (ruling R11)
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
          geo.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
          for (const g of m.groups) geo.addGroup(g.start, g.count, g.materialIndex);
          geo.computeVertexNormals();
          return { geo, center: [0, 0, 0] as [number, number, number] };
        }),
        // Each hole's wall and bottom (holes spec §3.2): explicit normals, so NO computeVertexNormals here.
        ...holes.map((h) => {
          const m = holeMesh(board, h, bodies, checks);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
          geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
          geo.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
          for (const g of m.groups) geo.addGroup(g.start, g.count, g.materialIndex);
          return { geo, center: [0, 0, 0] as [number, number, number] };
        }),
      ],
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
    const points = partGeometry(board).edges.flatMap(([a, b]) => [
      ...pointToLocalXYZ(board, a),
      ...pointToLocalXYZ(board, b),
    ]);
    // Each hole's rims (holes spec §3.3, amended): the entry ring and the far ring.
    const toPt = (p: V3) => ({ length: p[0], width: p[1], thickness: p[2] });
    const rims = partGeometry(board).holes.flatMap((h) => holeRims(h).flatMap(([a, b]) => [
      ...pointToLocalXYZ(board, toPt(a)), ...pointToLocalXYZ(board, toPt(b)),
    ]));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...points, ...rims], 3));
    return geo;
  }, [extents[0], extents[1], extents[2], boardUVSignature(board), geometries]);

  useEffect(() => () => edges.dispose(), [edges]);

  const kinds = faceGrainKinds(board);
  const family = grainFamily(board.material);

  return (
    <group position={offset ? [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]] : center}>
      {geometries.items.map(({ geo, center: offset }, index) => (
        <mesh
          key={index}
          geometry={geo}
          position={offset}
          // A ghost casts no shadow and receives none — there is no stock here
          // to do either, and a shadow would assert the part is solid.
          castShadow={!geometries.placeholder && !faded}
          receiveShadow={!geometries.placeholder}
          renderOrder={faded ? FADED_RENDER_ORDER : 0}
          onClick={(e) => {
            if (!selectable) return;
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
            // stopPropagation is LOAD-BEARING since multi-select: a ray through
            // a board split by a dado hits two of its solids, R3F would deliver
            // onClick to each, and a toggle delivered twice is a no-op.
            e.stopPropagation();
            onSelect(board.id, e.nativeEvent);
          }}
          onDoubleClick={(e) => {
            if (!selectable) return;
            // An orbit and then a click is not a double-click (see
            // clickPairStartedWithDrag); the click already ran as a select.
            if (clickPairStartedWithDrag()) return;
            e.stopPropagation();
            onOpen(board.id);
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
            // Keyed on `faded` so the material remounts when the grain map
            // comes or goes: three.js compiles map use into the shader and
            // a prop change alone would not recompile it.
            <meshStandardMaterial
              key={`${i}-${kind}-${faded}`}
              attach={`material-${i}`}
              map={faded ? null : grainTexture(family, kind)}
              color={faded ? fadedColor : color}
              roughness={0.72}
              metalness={0}
              emissive={selected ? SELECTED : '#000000'}
              emissiveIntensity={selected ? 0.16 : 0}
              transparent={faded}
              opacity={faded ? FADED_OPACITY : 1}
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
          color={selected ? SELECTED : faded ? fadedEdgeColor : edgeColor}
          transparent
          opacity={faded ? FADED_EDGE_OPACITY : selected ? 1 : 0.8}
        />
      </lineSegments>
    </group>
  );
}
