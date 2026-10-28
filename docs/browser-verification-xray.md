# Browser verification — X-ray

Date: 2026-10-28. Dev server `http://localhost:5199` on branch `xray`, in the USER's own Chrome over their MobaXterm tunnel (real
GPU), Claude driving through claude-in-chrome. Project `Real-hardware 2 — joinery` (a stool with round-tenoned stretchers, a
box-jointed maple box, a dovetailed cherry box). No paid call; production not touched; no test project created.

| Check (spec §7) | Result |
|---|---|
| Select `Stretcher`, press R | X-ray button `aria-pressed="true"`; the stretcher solid, its round tenons visible inside the faded legs (`img/xray-stretcher.jpg`) |
| Click a faded leg | `Front right` selected (Properties name) and drawn solid, the stretcher now faded (`img/xray-click-leg.jpg`) |
| Click empty space | selection cleared (`Select a part to edit it.`), every part solid, button still pressed |
| Explode at 100% with the stretcher selected | the stretcher solid, the exploded legs faded with their sockets showing |
| Section cut on (Front, centred) | both together, no error; the faded parts' caps fade with them |
| The button | off: `aria-pressed="false"` and the model solid; on again |
| Open `Real-hardware 1`, then back | X-ray `false` after the switch (reset by `replaceDocument`) |
| Select `Side left` (box joints), R | the side solid, the mating fingers in the faded front/back readable (`img/xray-box-joint.jpg`) |

Not run here: **Save image with X-ray on** (it downloads a file; owed to the user — expected to keep the x-rayed look, spec §3),
and **inside an opened assembly** (this project has no assembly; `fadedFor`'s unit tests pin the assembly-fade interplay).
X-ray was left OFF afterwards.
