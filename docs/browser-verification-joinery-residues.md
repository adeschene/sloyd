# Browser verification: joinery residues (follow-ups 182, 201)

2026-10-05. A bounded round with the design ruled in chat (201: trim a part in the panel's path;
188: shorter default tenons; 182: `stopped rabbet` accepted). The rules are in each follow-up's
closure in `docs/follow-ups.md`.

## How this was driven

Claude drove the dev server on branch `joinery-residues` (`npm run dev -- --port 5199`, Chromium)
with the Playwright MCP, and **the user watched the same browser**. The user's API key was already
stored in that browser from the previous round's check; it never passed through chat or a file. The
one paid run was approved by the user. The model was `claude-opus-5-5`.

The harness notes from `docs/browser-verification-joinery-fixes.md` still apply:
- clicks were dispatched through `browser_evaluate`;
- the fixture was uploaded from `.playwright-mcp/`;
- there are no screenshots, because they time out on this host.

## The run: a cabinet with a shelf short of the back, ≈ $0.03

**The fixture.** Two 30 × 11-1/4 × 3/4 sides, with a top and a bottom dadoed between them. A shelf
whose back edge sits 1/8in short of the back. A 1/4in plywood back behind everything. Built with
`designToDocument`; `checkDesign` reported nothing; 10 sites.

**Why this one fixture.** It reaches both fixes at once:
- 182: its back is rabbeted into all four case parts, so the side rabbets meet the top and bottom
  rabbets at the corners;
- 201: the shelf sits in the back's 1/4in path without touching it.

**What the model chose.** 4 rabbets for the back and 6 stopped dados.

**The dialog read:** `10 joints: 6 stopped dados, 4 rabbets`, `Moved relative to the rest: Back.
Trimmed: Shelf, Back.` It reported no new problems.

**Measured afterwards.** The joined project was read out of `localStorage` and measured with the
round's void metric, outside the browser: each stock-removing pocket minus what other parts' solids
fill, every pocket included.

- **No voids.** All 16 pockets are completely filled. On master, the same cabinet left four corner
  notches, each 1/8 × 1/4 × 3/8in (the round-1 cabinet in `docs/browser-verification-joinery-fixes.md`
  had them too, unseen, because `checkDesign` cannot see a void).
- **No overlap.** `checkDesign` on the joined design reports nothing. On master, the back drove 1/8in
  into the shelf.
- **201: the shelf is 11in deep, down from 11-1/8in.** It was trimmed by exactly the intrusion.
- **182's word change.** Each side's back rabbet reads `stopped rabbet`, and the cut list prints it
  that way.
- **Not opened.** The result was saved as a new project, not opened (invariant 36).
- **Console.** 0 errors; only the pre-existing three.js warnings.

## Not exercised live

- **188's shorter default tenons** are reachable only through the fallback defaults, which run when
  the model call fails. They are unit-verified only.
- **203's solids-based blockers and 191's epsilon merge** both need a design that arrives already
  cut, and nothing here was. They are unit-verified only.
