# CLAUDE.md — Sloyd

> A woodworking-focused 3D modelling/planning web app — a purpose-built alternative to
> using SketchUp for shop projects.
> Parent context: `/srv/CLAUDE.md` (Docker hub), `/srv/vps-admin/CLAUDE.md` (VPS).

---

## Status

**Pre-v1 — design phase.** This directory currently contains only this file and the
design docs. Nothing is deployed. The architecture section below is intentionally
empty until the v1 design is approved.

## What Sloyd is

Modelling and planning for woodworking projects: lay out the parts of a build in 3D,
see how they fit, and get the numbers you need at the bench (dimensions, cut list).
Not a general-purpose CAD tool — the domain assumptions (boards, stock thickness,
fractional inches) are the point.

The name is from *sloyd* (Swedish *slöjd*), the Scandinavian handicraft education
tradition built around hand woodworking.

## Architecture

_TBD — filled in once the v1 design is approved. See `docs/superpowers/specs/`._

## Deployment conventions (inherited from the hub)

Nothing here is wired up yet, but when it is, it follows the house pattern:

- Own compose project; operate from inside this directory (`docker compose ...`).
- Public-facing containers join the external **`proxy_network`** and get a proxy host
  added by hand in the nginx-proxy-manager admin UI on `:81`. Claude cannot do that
  step — it needs a human in the NPM UI, plus a DNS record.
- Persistent state as bind mounts under this directory. No named volumes.
- Secrets in a gitignored `.env`. Never commit, never echo.
- Add a `sloyd/` row to the hub's "Projects at a glance" table once it goes live.

## Working agreements

- Build incrementally: small v1, then widen. Prefer shipping a narrow thing that works.
- Design docs live in `docs/superpowers/specs/`; read the latest before changing behavior.
