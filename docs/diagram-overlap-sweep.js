/**
 * Cut list diagram — text collision sweep.
 *
 * NOT shipped code and not part of the build: this lives in `docs/` on purpose,
 * so neither `tsc -b` nor vitest ever sees it. It is a diagnostic you paste into
 * a browser (Playwright `browser_evaluate`, or devtools) with the cut list open.
 *
 * WHY IT EXISTS. Every `<text>` in `PartDiagram.tsx` is positioned by geometry
 * alone — centred on a computed point — and nothing anywhere measures the width
 * of the string being placed. SVG text has extent; the code treats it as a
 * point. Every known label defect (follow-up 59) is an instance of that one
 * gap, which means eyeballing screenshots finds them one at a time while a
 * `getBBox()` predicate finds the whole class at once.
 *
 * It also exists because this feature has twice been wrong about layout from
 * the wrong instrument: once from the plan's font-metric arithmetic, once from
 * a `curl` diff. `getBBox()` on rendered text in a real browser is the right
 * instrument. Do not replace it with estimated character widths.
 *
 * USAGE
 *   1. Open the cut list (the sheet must be on screen — getBBox returns zeros
 *      for anything not rendered).
 *   2. Set the Diagrams toggle to "All parts" if you want cut-free rows too.
 *   3. Evaluate `sweepDiagrams()`.
 *
 * Returns one entry per diagram with any violations found. An empty `issues`
 * array is a pass. See `docs/follow-ups.md` items 59 and 65.
 */
function sweepDiagrams() {
  /**
   * Slack, in drawing units, before a boundary breach counts.
   *
   * RE-DERIVED 2026-08-01, after the label layout round, from a fresh run on
   * the `1 baseline` geometry alone — in that order, because the control is
   * what produces the tolerance and checking a guessed tolerance against the
   * cases inverts the calibration.
   *
   * It used to be 1, to absorb a 0.6-unit overhang above the viewBox that every
   * near-side depth label produced at `y = TOP - 8 = 18` with a `getBBox` height
   * of 23.68. That was ascent padding rather than visible ink — and it is now
   * GONE: every number a cut owns lives in that cut's own leader row or column.
   * Measured on the baseline, the worst overhang past any of the four edges is
   * exactly 0.00, and the smallest clearance to any edge is 5.83 units.
   *
   * Since schema 12 (fu 215) the three `vUp` views draw their vertical axis
   * upward, so a leader column's labels CAN sit above the outline; PartDiagram
   * lifts the figure so they start at TOP (4) or below. RE-MEASURED 2026-10-11
   * (fu 246) on a fixture with stopped and positioned cuts on all six views, at
   * two part sizes: 0.00 overhang everywhere; the highest text sits 5.32 units
   * below the viewBox top on a lifted view and 4.75 on an unflipped one.
   *
   * So this is float noise headroom, not an allowance for a known artefact. Do
   * not raise it to make a failure disappear — at ~5 units of real clearance,
   * anything this flags is a genuine breach. If `TOP` or the label font-size
   * changes, re-derive it the same way.
   */
  const TOL = 0.1;

  /**
   * An element's box in the SVG's OWN coordinate system, with its transform applied.
   *
   * `getBBox()` alone is NOT enough and the difference is not subtle. It is
   * measured in the element's user space BEFORE the element's own transform, so
   * a `rotate(-90)` leader-column label reports its UNROTATED extents. Measured
   * on this app: a rotated `100-15/16"` returned a bbox of 120.29 x 23.68 while
   * its true on-screen box was 14 x 71.13 — width and height swapped.
   *
   * Reading `getBBox()` directly would therefore measure every rotated label as
   * if it were horizontal AND STILL PASS. That is the same
   * silently-succeeding-predicate failure that let follow-up 59 ship through a
   * full TDD pass and three reviews, which is why this composes with the CTM
   * rather than trusting the raw box.
   */
  const boxOf = (el, svg) => {
    const b = el.getBBox();
    // ORDER IS LOAD-BEARING: svgInverse x elementCTM, not the reverse.
    // `A.multiply(B)` is A x B, and we want to map element user space -> SVG
    // user space. Writing it backwards happens to be the IDENTITY for an
    // untransformed element (elCTM === svgCTM, so elCTM x svgInv cancels), so a
    // horizontal-label control still reads correctly and the error only shows
    // on the rotated labels this helper exists for — where it put a label at
    // x = -4043 in a 1141-wide viewBox. Caught by sanity-checking an absurd
    // number against the element's own attributes; do not "simplify" the order.
    const m = svg.getScreenCTM().inverse().multiply(el.getScreenCTM());
    const pts = [
      [b.x, b.y], [b.x + b.width, b.y],
      [b.x, b.y + b.height], [b.x + b.width, b.y + b.height],
    ].map(([x, y]) => {
      const p = svg.createSVGPoint();
      p.x = x; p.y = y;
      return p.matrixTransform(m);
    });
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return {
      x: Math.min(...xs), y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  };

  /** Two boxes overlap only if they do so on BOTH axes. Touching is not overlap. */
  const overlaps = (a, b) =>
    a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height;

  const round = (n) => Math.round(n * 10) / 10;

  return [...document.querySelectorAll('.cutlist-diagram')].map((fig, index) => {
    const svg = fig.querySelector('svg');
    const outline = svg.querySelector('.cutlist-diagram-outline');
    const [, , vbWidth, vbHeight] = svg.getAttribute('viewBox').split(/\s+/).map(Number);

    const box = outline.getBBox();
    const texts = [...svg.querySelectorAll('text')].map((el) => ({
      text: el.textContent,
      cls: el.getAttribute('class') || 'leader',
      bbox: boxOf(el, svg),
      rotated: /rotate/.test(el.getAttribute('transform') || ''),
    }));

    // The overall-width label is the LAST <text> in the svg and is deliberately
    // placed to the right of the outline, so P3 must exempt it. Identified by
    // position rather than by class: it now carries `cutlist-diagram-overall`
    // and could be selected by that instead, but position is what this has
    // always keyed on and it survives a class rename — which is exactly what
    // happened to the class it used to share with the per-cut depth labels
    // (`cutlist-diagram-depth`, deleted in the label layout round).
    const widthLabel = texts[texts.length - 1]?.text;

    const issues = [];

    // P1 — pairwise overlap. Catches depth-vs-depth, depth-vs-leader, and
    // offsetLabel-vs-widthLabel in one rule, without naming them separately.
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        if (overlaps(texts[i].bbox, texts[j].bbox)) {
          issues.push({
            kind: 'overlap',
            a: texts[i].text,
            b: texts[j].text,
            overlapX: round(
              Math.min(texts[i].bbox.x + texts[i].bbox.width, texts[j].bbox.x + texts[j].bbox.width) -
              Math.max(texts[i].bbox.x, texts[j].bbox.x),
            ),
          });
        }
      }
    }

    // P2 — anything drawn outside the viewBox. `overflow: visible` means this
    // is visible-but-wrong rather than clipped, which is why it needs asserting.
    for (const t of texts) {
      const { x, y, width, height } = t.bbox;
      if (x < -TOL || y < -TOL || x + width > vbWidth + TOL || y + height > vbHeight + TOL) {
        issues.push({
          kind: 'outside-viewbox',
          text: t.text,
          x: round(x),
          right: round(x + width),
          vbWidth,
          bottom: round(y + height),
          vbHeight,
        });
      }
    }

    // P3 — a depth or leader label reaching left of the board's own edge. The
    // overall-width label is deliberately to the RIGHT of the outline, so it is
    // exempt. So is a rotated leader-column label (a vertical-axis cut) lying
    // WHOLLY in the column band left of the outline: the columns stand there by
    // design (COL each, plus LEFT_PAD), a layout newer than this check, which
    // flagged every one of them (fu 246). A rotated label straddling the
    // outline's left edge is still reported.
    const inColumnBand = (t) => t.rotated && t.bbox.x + t.bbox.width <= box.x + 0.5;
    for (const t of texts) {
      if (t.bbox.x < box.x - 0.5 && t.text !== widthLabel && !inColumnBand(t)) {
        issues.push({
          kind: 'left-of-board',
          text: t.text,
          x: round(t.bbox.x),
          boardLeft: round(box.x),
        });
      }
    }

    return {
      index,
      heading: fig.querySelector('.cutlist-diagram-head')?.textContent,
      drawnWidth: round(box.width),
      issues,
    };
  });
}
