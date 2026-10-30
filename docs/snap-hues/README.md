# Snap-marker hue checks (fu 249, fu 590)

The floors in `src/viewport/SnapMarker.tsx`'s header, measured. Plain Node, no dependencies:

- `cvd.mjs`: sRGB to CIELAB, CIEDE2000, WCAG contrast, and CVD simulation (Machado 2009, severity 1, in linear RGB).
  It reproduces fu 249's and round 2's published figures to within 0.2.
- `node check.mjs ['{"line":"#000070"}']`: every kind against every floor; the JSON argument overrides hues.
- `node search4.mjs [step]`: keeps fu 249's four and finds the sets of four more that clear every floor.
- `node family.mjs CMAX LMIN HUE_TOL CMIN`: anneals all eight within their CIELAB hue families, with chroma bounds.

Floors: WCAG ≥ 3:1 on maple `#ebe3d4`, ≥ 3.4:1 on the ring `#f5f2ec`; CIEDE2000 ≥ 35 from the selected oak `#c8955a`;
mutual CIEDE2000 ≥ 25 under normal vision and ≥ 14 under simulated deuteranopia and protanopia.
