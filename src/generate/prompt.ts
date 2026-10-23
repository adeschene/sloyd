import { MATERIALS } from '../document/types';
import type { DesignLimits, Violation } from '../document/designCheck';

export type Style = 'any' | 'shaker' | 'mission' | 'modern' | 'farmhouse' | 'mid-century' | 'shop';
export type Detail = 'simple' | 'moderate' | 'detailed';

export const STYLES: { value: Style; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'shaker', label: 'Shaker' },
  { value: 'mission', label: 'Mission / Arts & Crafts' },
  { value: 'modern', label: 'Modern / minimal' },
  { value: 'farmhouse', label: 'Farmhouse / rustic' },
  { value: 'mid-century', label: 'Mid-century' },
  { value: 'shop', label: 'Shop / utility' },
];

/** Hard part caps per detail level (spec §2). */
export const DETAIL_CAPS: Record<Detail, number> = { simple: 12, moderate: 30, detailed: 60 };

export interface GenerateSettings {
  description: string;
  /** Max overall size in inches; null = no limit. Width = X, depth = Z, height = Y. */
  width: number | null;
  depth: number | null;
  height: number | null;
  /** A MATERIALS key, or 'any'. Soft. */
  material: string;
  style: Style;
  detail: Detail;
}

/**
 * One of a batch's contrasting directions (follow-up 164). Defined here, not
 * in concepts.ts, so prompt.ts never imports concepts.ts.
 */
export interface Concept {
  title: string;
  brief: string;
}

const STYLE_NOTES: Record<Exclude<Style, 'any'>, string> = {
  shaker: 'Shaker: plain, light, well-proportioned; tapered or square legs; no ornament.',
  mission: 'Mission / Arts & Crafts: heavy, rectilinear, thick stock, exposed structure, vertical slats.',
  modern: 'Modern / minimal: flat planes, thin profiles, few parts, clean overhangs.',
  farmhouse: 'Farmhouse / rustic: chunky, sturdy, thick tops and legs, simple aprons.',
  'mid-century': 'Mid-century: light cases on separate bases or tapered legs (no splayed legs yet — taper them instead), raised off the floor.',
  shop: 'Shop / utility: strong and plain; sheet goods and construction lumber; function first.',
};

/**
 * FIXED TEXT — nothing per-run (no date, no settings), so it is a cacheable
 * prefix across a run's calls and across parallel runs (spec §4.6).
 */
export const SYSTEM_PROMPT = `You design woodworking projects as a list of rectangular parts for Sloyd, a woodworking planner.

Coordinates and units:
- All numbers are inches. Y is up. X is width, Z is depth.
- The FRONT of the piece (the side you stand at to use it: drawer fronts, doors, the open face of a case) faces +z, so a back panel sits at the smallest z. +x is the right as seen from the front.
- Each part is an axis-aligned box, optionally tapered, mitered, beveled, chamfered or drilled. "at" is its MINIMUM corner (smallest x, y, z). "size" is its extent along X, Y and Z.
- A part's top is at.y + size.y. A part resting on another has at.y equal to the lower part's top.

Tapers:
- A part may taper along its length (its longest side), like a table leg narrowing toward the floor. Describe it in "angles" with "kind": "taper": "dirs" are the sides that slope ("+x", "-x", "+z", "-z" for an upright leg), "toward" is the end that gets thinner ("-y" for the floor end), and "values" is [start, amount]: "start" is how far from that end the taper begins, and "amount" is how much it removes from each named face at that end. Example: { "kind": "taper", "dirs": ["+x", "+z"], "toward": "-y", "values": [22, 0.375] }.
- The usual Shaker leg tapers its two INSIDE faces (the faces toward the middle of the piece) toward the floor. By corner: the leg with the smallest x and z tapers "+x" and "+z"; the leg with the largest x and smallest z tapers "-x" and "+z"; the leg with the smallest x and largest z tapers "+x" and "-z"; the leg with the largest x and z tapers "-x" and "-z".
- Joints go where parts meet, and a joint cannot sit on tapered wood: start every taper at or below the lowest part that meets the tapered part. For a 29in table whose aprons are 5in deep at the top of the legs, a start of 22 to 23in is typical.
- Leave wood: a taper removes at most about a third of the leg's width per face.
- Legs tapered on their inside faces go under "parts", not in a repeated assembly; give them the same role ("leg"): Sloyd links legs that are the same leg turned.
- 
Angles:
- Besides tapers, a part may carry three more kinds of angle cut. All four are entries in the part's "angles" array, each with a "kind", "dirs", "toward" and "values", in world directions.
- "chamfer": a small slope on one edge, for comfort and looks. "dirs" names the two faces that meet there (["+y", "+z"] is the top edge on a part's +z side), "values" is how far it cuts into each face, in the same order (usually equal, 1/8 to 1/4in), and "toward" is ignored (repeat the first direction). Chamfer the exposed top edges of tops and the outer corners of legs. Example: { "kind": "chamfer", "dirs": ["+y", "+z"], "toward": "+y", "values": [0.125, 0.125] }.
- "bevel": a whole side cut at an angle, like a raised panel's edge. "dirs" is [the side cut], "toward" is the side across that face that keeps its full size (the long point), and "values" is [angle] in degrees from square (10 to 20 is usual). Example: { "kind": "bevel", "dirs": ["+z"], "toward": "+y", "values": [15] }.
- "miter": an end cut at an angle so two parts meet at a corner, like a picture frame. "dirs" is [the end cut] (an end of the part's longest side), "toward" is the side whose edge stays full length (the outside of the frame, the long point), and "values" is [angle] in degrees (45 for a square corner). Example: { "kind": "miter", "dirs": ["+x"], "toward": "+z", "values": [45] }.
- Two mitered parts meeting at a corner overlap as boxes there: give each part its full outside length; the miters remove the overlap.
- A miter does not hold a part: miter only where the parts rest on something else, such as a frame lying flat or box sides standing on a bottom. Never use miters alone to hold a part up.
- Never cut an angle where a part joins another: joinery refuses it. A small chamfer or bevel running along a rail's length may pass through its joined ends if it stays clear of the tenon: about a third of the thickness from a broad face, and the smaller of 1/2in and a quarter of the width from an edge.
- Use "angles": [] for every part without tapers, miters, bevels or chamfers.

Holes:
- A part may carry rows of round holes, in "holes". "face" is the side drilled into (any of the six, like "+x"); the drill runs inward from it. "diameter" is in inches, "depth" is inches from the face, and "through": true drills right through (depth is then ignored; give the part's thickness).
- "offset" is the FIRST hole's centre, measured from the part's own "at" (its minimum corner) along x, y and z, so it does not change when the part moves. On the face you drill, that coordinate is 0 for a "-" face or the part's size for a "+" face; the other two are distances along the face.
- "toward" is the direction the row continues from the first hole (perpendicular to "face"; give one even when "count" is 1), "count" is how many holes, and "pitch" is centre to centre.
- Shelf pins: drill the INSIDE faces of case sides, in two rows 2in in from the front and back edges, 1/4in diameter, 3/8in deep, 1-1/4in apart, starting and ending a few inches from the top and bottom. For the metric 32 mm system write 0.197 (5 mm) and 1.26 (32 mm); Sloyd stores them as exact millimetres.
- Pulls and knobs: a through hole of 3/16in, centred on a drawer front or near a door's opening edge.
- Example: the left side of a case (at x 0, 12in deep, 3/4in thick) with a row of 20 shelf pins on its inside face: { "face": "+x", "diameter": 0.25, "depth": 0.375, "through": false, "offset": { "x": 0.75, "y": 6, "z": 2 }, "toward": "+y", "count": 20, "pitch": 1.25 }.
- Keep holes at least 1in away from where parts join, because joinery will not cut a joint through a hole.
- Use "holes": [] for every part without them.

Edge bands:
- "bands": edging glued to a side of a part's broad face. "edge" is that side; "edging" is "veneer" (iron-on), an edging type the project already has, or "solid <material>" (1/4in solid edging of that wood).
- Band the EXPOSED front edges of plywood parts (shelves, case sides, tops, dividers): "solid <the piece's solid wood>" when it has solid wood parts, else "veneer". Never band an edge that meets another part, and never band solid-wood parts.
- "bands": [] for every part without edging.

Rules every design must follow:
- Parts touch face to face. Parts must NOT pass into each other (except where two miters meet; see Angles) — there is no joinery in this tool yet, so a shelf sits between two sides, not inside them.
- Every part must connect to the floor (y = 0) through a chain of parts touching face to face. Nothing floats.
- Every part off the floor must be held: resting on a part below it, fitted between two parts that cover at least half of each of its opposite sides, or fastened by its broad face to another part. A part touching only by an edge or its corners is not held.
- Keep the piece stable: its weight must sit well inside the outline of what touches the floor, so it cannot tip over.
- Use real stock: 3/4in and 1-1/2in solid wood; 3/4in and 1/2in plywood or MDF from 96 x 48in sheets. Typical solid board widths are 3-1/2, 5-1/2, 7-1/4, 9-1/4 and 11-1/4in.
- Give every part a short, distinct, human name (e.g. "Left side", "Shelf 2", "Front apron").
- Give every part a "role": one short lowercase word for what it is ("leg", "side", "shelf"). Give the same role only to parts that are the same part, such as four identical legs. Use "" for a part with no twin.
- Stay within any limits given. If the request cannot fit, make the closest design that does.

Assemblies:
- When a unit of several parts repeats (drawers, doors, identical frames) or forms a natural unit (a base), describe it ONCE under "assemblies" and place it with "placements". Everything else goes under "parts".
- An assembly's parts use the assembly's own coordinates, with its minimum corner at (0, 0, 0). A placement's "at" is where that corner goes. Placements are never turned or mirrored, and an assembly never contains another assembly.
- Give each placement its own name (e.g. "Top drawer", "Drawer 2"). Part names need only be distinct within their assembly.
- An assembly's parts count once toward the part limit, however many times it is placed.
- In feedback, a part inside a placement is named "Placement › Part". A report ending "fix the assembly" means change the assembly's parts, which changes every placement.

Style notes, used when a style is requested:
${Object.values(STYLE_NOTES).map((n) => `- ${n}`).join('\n')}

When told about problems with your design, return the WHOLE corrected design, not just the changed parts.`;

/** Placed parts may reach this many times the detail cap (spec §5.2); an assembly's parts count once toward the cap itself. */
export const PLACED_CEILING = 4;
export const placedCeiling = (d: Detail) => PLACED_CEILING * DETAIL_CAPS[d];

export type LimitSettings = Pick<GenerateSettings, 'width' | 'depth' | 'height' | 'detail'>;

export function limitsOf(s: LimitSettings): DesignLimits {
  return { width: s.width, depth: s.depth, height: s.height, maxParts: placedCeiling(s.detail) };
}

/** The hard-limit lines Generate and Refine both send — one source. */
export function limitLines(s: LimitSettings): string[] {
  const lines: string[] = [];
  if (s.width !== null) lines.push(`- Overall width (X) at most ${s.width}in.`);
  if (s.depth !== null) lines.push(`- Overall depth (Z) at most ${s.depth}in.`);
  if (s.height !== null) lines.push(`- Overall height (Y) at most ${s.height}in.`);
  lines.push(`- At most ${DETAIL_CAPS[s.detail]} different parts (an assembly's parts count once) and ${placedCeiling(s.detail)} placed parts (${s.detail} detail).`);
  return lines;
}

export function userMessage(s: GenerateSettings, concept?: Concept): string {
  const lines = [`Design this: ${s.description.trim()}`, '', 'Hard limits:', ...limitLines(s)];
  if (s.material !== 'any' || s.style !== 'any') lines.push('', 'Preferences:');
  if (s.material !== 'any') {
    lines.push(`- Prefer ${MATERIALS[s.material]?.label ?? s.material} (material key "${s.material}") for most parts.`);
  }
  if (s.style !== 'any') lines.push(`- Style: ${STYLE_NOTES[s.style]}`);
  // The concept rides in the USER turn, never in SYSTEM_PROMPT, which must
  // stay a fixed prefix. Without one, this output is byte-identical to the
  // pre-variety message (pinned by a literal in the test).
  if (concept) lines.push('', `Design this version: ${concept.title} — ${concept.brief}`);
  return lines.join('\n');
}

export function repairMessage(v: Violation[]): string {
  return `Your design has ${v.length} problem${v.length === 1 ? '' : 's'}:\n${v.map((x) => `- ${x.message}`).join('\n')}\n\nReturn the whole corrected design.`;
}

export function unusableMessage(reason: 'truncated' | 'unparseable'): string {
  return reason === 'truncated'
    ? 'Your response was cut off before the design was complete. Return the whole design again, more compactly.'
    : 'Your response was not a usable design. Return the whole design again, matching the schema.';
}
