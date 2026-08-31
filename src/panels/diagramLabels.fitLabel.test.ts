import { fitLabel, labelWidth, labelHeight } from './diagramLabels';

const NAME = 'Side Panel';
// Fractional-inch, not whole-inch: both more representative of what the cut
// list actually formats, and — at 17 characters against NAME's 10 — long
// enough that a box sized to fit NAME genuinely excludes it. A whole-inch
// DIMS ('24" × 12"', 9 chars) is SHORTER than NAME and could never fail to
// fit a box sized for NAME, which made the "dims line too wide" test below
// unfalsifiable no matter how fitLabel's comparisons were written.
const DIMS = '24-1/2" × 12-3/4"';
const wide = Math.max(labelWidth(NAME), labelWidth(DIMS)) + 1;
const tall = labelHeight() * 2 + 1;

describe('fitLabel', () => {
  it('shows both lines when both fit', () => {
    expect(fitLabel([NAME, DIMS], wide, tall)).toBe('full');
  });

  it('drops to the name when the box is too short for two lines', () => {
    expect(fitLabel([NAME, DIMS], wide, labelHeight() + 1)).toBe('name');
  });

  it('drops to the name when the dimensions line is too wide', () => {
    expect(fitLabel([NAME, DIMS], labelWidth(NAME) + 1, tall)).toBe('name');
  });

  // A 3-inch-wide part gets an index rather than a name bleeding across its
  // neighbours. That is follow-up 59's defect and the reason width is measured
  // rather than estimated.
  it('drops to an index when even the name will not fit', () => {
    expect(fitLabel([NAME, DIMS], labelWidth(NAME) - 1, tall)).toBe('index');
  });

  it('drops to an index when nothing fits vertically', () => {
    expect(fitLabel([NAME, DIMS], wide, labelHeight() - 1)).toBe('index');
  });

  it('treats an empty label list as an index', () => {
    expect(fitLabel([], wide, tall)).toBe('index');
  });

  // Exact-fit boundary, both axes. CHAR_W is an upper bound already biased
  // high (see LABEL_EM's doc comment), so a label whose measured width lands
  // exactly on the box edge is still drawable — the comparisons must be
  // inclusive (<=), not strict (<). Every other test above leaves a margin of
  // at least 1 unit on the tight dimension, so none of them can tell <= apart
  // from < on the boundary itself; these two exist to pin that specifically.
  it('fits both lines when the box matches their extent exactly', () => {
    const exactW = Math.max(labelWidth(NAME), labelWidth(DIMS));
    const exactH = labelHeight() * 2;
    expect(fitLabel([NAME, DIMS], exactW, exactH)).toBe('full');
  });

  it('fits the name alone when the box matches its extent exactly', () => {
    expect(fitLabel([NAME, DIMS], labelWidth(NAME), labelHeight())).toBe('name');
  });

  // ---- Follow-up 161: a detail line that must not be dropped --------------
  //
  // The `name` tier prints `lines[0]` and nothing else, so a part whose
  // rectangle fits its name but not its dimension line prints NO dimensions
  // — and, since follow-up 92 put the word `turned` on that line, no word
  // either. `requireDetail` removes the middle rung for a caller whose detail
  // lines carry a FACT rather than only numbers: `full` or `index`, nothing
  // between. `SheetLayout` is the only caller that passes it, and it passes
  // `p.turned`.
  //
  // The flag is an argument rather than something `fitLabel` sniffs out of
  // the strings: recovering `turned` by searching `DIMS` for the word would
  // parse a formatted string to learn something the caller already holds as a
  // boolean, which is why `nesting.ts` keeps `turned` beside `dims` instead
  // of only inside it.
  it('skips the name tier when the detail line is required', () => {
    // Same box as 'drops to the name when the dimensions line is too wide'
    // above, so the ONLY difference between the two results is the flag.
    expect(fitLabel([NAME, DIMS], labelWidth(NAME) + 1, tall, { requireDetail: true }))
      .toBe('index');
  });

  it('skips the name tier when the box is too short for two lines', () => {
    // The other route into `name` — vertical, not horizontal. Both rungs have
    // to go, or a short-and-wide part keeps printing a bare name.
    expect(fitLabel([NAME, DIMS], wide, labelHeight() + 1, { requireDetail: true }))
      .toBe('index');
  });

  it('still shows both lines when both fit and the detail is required', () => {
    // The flag must not demote a label that can print everything. A mutation
    // that returns 'index' whenever `requireDetail` is set passes both tests
    // above and fails this one.
    expect(fitLabel([NAME, DIMS], wide, tall, { requireDetail: true })).toBe('full');
  });

  it('leaves an already-indexed label alone when the detail is required', () => {
    expect(fitLabel([NAME, DIMS], labelWidth(NAME) - 1, tall, { requireDetail: true }))
      .toBe('index');
  });

  it('reaches the name tier when the detail is NOT required', () => {
    // The default, spelled out on the same box as the first test in this
    // block: omitting the option must leave every existing caller's ladder
    // exactly as it was. A mutation that skips the name rung unconditionally
    // turns this red.
    expect(fitLabel([NAME, DIMS], labelWidth(NAME) + 1, tall)).toBe('name');
    expect(fitLabel([NAME, DIMS], labelWidth(NAME) + 1, tall, { requireDetail: false }))
      .toBe('name');
  });
});
