# Browser verification — saved views

Date: 2026-10-28. Dev server `http://localhost:5199` on branch `saved-views`, in the USER's own Chrome over their MobaXterm tunnel (real
GPU), Claude driving through claude-in-chrome. A NEW project, `Saved views check` (three boards), left in place per the dev-profile rule.
No paid call; production not touched.

| Check (spec §8) | Result |
|---|---|
| Save view in perspective | `View 1` added; the name field took focus with the text selected (`activeElement` the `View name` input, selection `[0, 6]`); typed `Corner` + Enter renamed it |
| Orbit and zoom far away, then go to `Corner` | the same pose as saved (`img/views-corner-saved.jpg` vs `img/views-corner-restored.jpg`, pixel-identical framing) |
| Orthographic, orbit, zoom, hide `Board (2)`, Section on; save `Ortho section` | saved (`img/views-ortho-saved.jpg`) |
| Section off, Show all, Perspective, orbit, explode 100%; go to `Ortho section` | Orthographic pressed, Section pressed, `Board (2)` hidden (`Show all (1)`), explode `0`, and the SAME pose — no re-frame on the restore's projection swap (`img/views-ortho-restored.jpg`) |
| From ortho, go to `Corner` (a perspective view) | Perspective pressed, section off, nothing hidden, the saved pose |
| Reload the page | `Views · 2` — both views persisted |
| Explode 100%: Save view, Update, × | `View 3` saved, updated and deleted while exploded; the view rows are not inside a disabled fieldset |
| An ordinary Orthographic → Perspective toggle afterwards | re-frames as before (the board fitted and centred) |

Not run here: **a window resize between save and go** — the window is maximized and would not resize from the extension; the
height ↔ zoom conversion is pinned by `viewCamera.test.ts` (two canvas heights, one visible height). Owed to the user by eye, with the
rows' look (each row shows the name twice: the go button and the rename field) and the sidebar's fit with Guides and Views both open.
