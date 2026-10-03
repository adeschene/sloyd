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
  'mid-century': 'Mid-century: light cases on separate bases or splayed legs, raised off the floor.',
  shop: 'Shop / utility: strong and plain; sheet goods and construction lumber; function first.',
};

/**
 * FIXED TEXT — nothing per-run (no date, no settings), so it is a cacheable
 * prefix across a run's calls and across parallel runs (spec §4.6).
 */
export const SYSTEM_PROMPT = `You design woodworking projects as a list of rectangular parts for Sloyd, a woodworking planner.

Coordinates and units:
- All numbers are inches. Y is up. X is width, Z is depth.
- Each part is an axis-aligned box. "at" is its MINIMUM corner (smallest x, y, z). "size" is its extent along X, Y and Z.
- A part's top is at.y + size.y. A part resting on another has at.y equal to the lower part's top.

Rules every design must follow:
- Parts touch face to face. Parts must NOT pass into each other — there is no joinery in this tool yet, so a shelf sits between two sides, not inside them.
- Every part must connect to the floor (y = 0) through a chain of parts touching face to face. Nothing floats.
- Every part off the floor must be held: resting on a part below it, fitted between two parts that cover at least half of each of its opposite sides, or fastened by its broad face to another part. A part touching only by an edge or its corners is not held.
- Keep the piece stable: its weight must sit well inside the outline of what touches the floor, so it cannot tip over.
- Use real stock: 3/4in and 1-1/2in solid wood; 3/4in and 1/2in plywood or MDF from 96 x 48in sheets. Typical solid board widths are 3-1/2, 5-1/2, 7-1/4, 9-1/4 and 11-1/4in.
- Give every part a short, distinct, human name (e.g. "Left side", "Shelf 2", "Front apron").
- Stay within any limits given. If the request cannot fit, make the closest design that does.

Style notes, used when a style is requested:
${Object.values(STYLE_NOTES).map((n) => `- ${n}`).join('\n')}

When told about problems with your design, return the WHOLE corrected design, not just the changed parts.`;

export function limitsOf(s: GenerateSettings): DesignLimits {
  return { width: s.width, depth: s.depth, height: s.height, maxParts: DETAIL_CAPS[s.detail] };
}

export function userMessage(s: GenerateSettings, concept?: Concept): string {
  const lines = [`Design this: ${s.description.trim()}`, '', 'Hard limits:'];
  if (s.width !== null) lines.push(`- Overall width (X) at most ${s.width}in.`);
  if (s.depth !== null) lines.push(`- Overall depth (Z) at most ${s.depth}in.`);
  if (s.height !== null) lines.push(`- Overall height (Y) at most ${s.height}in.`);
  lines.push(`- At most ${DETAIL_CAPS[s.detail]} parts (${s.detail} detail).`);
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
