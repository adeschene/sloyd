import type { Axis, Edge } from './align';

/** Align and space evenly's copy (align spec §6): every string the Align section shows. No lengths, so no `units`. */
export const AXIS_WORDS: Record<Axis, { min: string; centre: string; max: string; letter: 'X' | 'Y' | 'Z' }> = {
  0: { min: 'Left', centre: 'Centre', max: 'Right', letter: 'X' },
  1: { min: 'Bottom', centre: 'Middle', max: 'Top', letter: 'Y' },
  2: { min: 'Back', centre: 'Centre', max: 'Front', letter: 'Z' },
};

/** `Align left (X)` — a button's accessible name. */
export const alignLabel = (axis: Axis, edge: Edge) => `Align ${AXIS_WORDS[axis][edge].toLowerCase()} (${AXIS_WORDS[axis].letter})`;
/** `Space evenly along Y`. */
export const spaceLabel = (axis: Axis) => `Space evenly along ${AXIS_WORDS[axis].letter}`;
/** The section's words: its heading, the space-evenly row's label and its buttons (`Along X`). */
export const ALIGN_HEADING = 'Align';
export const SPACE_EVENLY = 'Space evenly';
export const alongWord = (axis: Axis) => `Along ${AXIS_WORDS[axis].letter}`;
/** `to Left side (selected first)`. */
export const anchorNote = (name: string) => `to ${name} (selected first)`;
/** The refusal: the inner items do not fit between the outer two. */
export const noRoomText = (first: string, last: string, axis: Axis) =>
  `These parts don't fit between ${first} and ${last} along ${AXIS_WORDS[axis].letter}.`;
