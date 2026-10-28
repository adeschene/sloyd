# Browser verification — weight

Date: 2026-10-28. Dev server (`npm run dev -- --port 5199`, origin `http://localhost:5199`) on branch `weight`. **Nobody watched this
run.** There was no X server (`/tmp/.X11-unix` empty), so the Playwright MCP's headed browser could not start. The pass was driven
headless from a node script using the MCP's own Playwright library: `/opt/google/chrome/chrome` with `--use-gl=angle
--use-angle=swiftshader --enable-unsafe-swiftshader`, `DISPLAY` removed, and a persistent profile in a scratch directory. WebGL 2 was
present. No paid call was made, and production was not touched.

**Harness finding:** after a source edit, Vite's hot reload serves the app's modules with `?t=` stamps, so a script's
`import('/src/store/store.ts')` gets a SECOND store instance. Writes to it never reach the page (the cut list read empty while that
store held 7 parts). Restart the dev server before driving the store from a script.

**Where the test project is:** "Weight check", in the SCRATCH profile on origin `:5199` (under the job's tmp directory), **not in the
user's dev browser profile**. It is left in place, and `localStorage` was not cleared. It reads `version: 28`.

## The project

An oak table and a shelf: a top 36 × 20 × 1; four legs 28-1/4 × 1-3/4 × 1-3/4; a plywood shelf 30 × 12 × 3/4 with 1/4" walnut edging on
its width-max side; and a rail 30 × 3 × 3/4 in a custom **Ash** with no density.

## Readouts (DOM), against hand arithmetic

| Step | Read | Hand |
|---|---|---|
| Cut list, Ash unweighed | Oak 1": `18 lb`; Oak 1-3/4": `8.8 lb`; Plywood: `5.5 lb`; Walnut: `0.1 lb`; Ash: `no density` | top 720 in³ × 44/1728 = 18.3; legs 4 × 86.52 in³ × 44/1728 = 8.81 |
| Project line | `Weight: about 33 lb, not counting Ash (no density)` | 18.33 + 8.81 + 5.5 + 0.1 = 32.8 |
| Materials & prices | Oak's row: `Density 44 lb/ft³`. Typed `42` into `Ash: density` and saved: the stored Ash has `density: 42` | — |
| After the density | Ash: `1.6 lb`; `Weight: about 34 lb` | 67.5 in³ × 42/1728 = 1.64 |
| Properties, the top | `about 18 lb` | 18.33 |
| Properties, the top and a leg | `about 21 lb` | 18.33 + 2.20 = 20.5 |
| Properties, the shelf | `about 5.6 lb` (core plus its own edging) | 5.5 + 0.1 |
| Metric, the top | `about 8.3 kg` | 18.33 × 0.4536 = 8.31 |
| Metric, cut list | `0.7 kg`, `4.0 kg`, `8.3 kg`, `2.5 kg`, `0.1 kg`; `Weight: about 16 kg` | — |
| Metric, dialog | Oak `Density 705 kg/m³`; Ash's field `673` | 44 × 16.018 = 704.8; 42 × 16.018 = 672.8 |

## The look (one finding, fixed)

The first run printed the group weight inline after the stock (`· 18 lb`) in a third grid column. That pushed every subtotal's stock figure
left, out of line with the rows' stock column, which the column exists to keep. **Fixed in the build:** the weight sits on a second line
under the stock, in the same right-aligned column, without the `·` (`18 lb`, `no density`), with a 2px row gap. The spec §5.1 line is
amended. The second run's screenshot shows the stock aligned with the rows again. Properties' line (`Weight about 5.6 lb`) sits under the
action bar. Software GL throughout: the screenshots show layout, not shading (fu 26a).
