# Roomcraft v1 — Build Plan

Spec: ~/.claude/plans/hi-i-want-to-ethereal-donut.md (approved 2026-07-22)

## Build order

- [x] 1. Scaffold Next.js + TS app, install deps (zustand, konva/react-konva, three/r3f/drei, cheerio, anthropic, vitest)
- [x] 2. Data types (`src/lib/types.ts`)
- [x] 3. `roomGeometry` pure functions + unit tests (17 tests)
- [x] 4. Zustand `Design` store + localStorage persistence
- [x] 5. Starter catalog (16 items) + category→3D model mapping
- [x] 6. 2D PlanView: polygon rooms, vertex editing, dbl-click to add corners, measurements, room drag + wall snapping
- [x] 7. 2D PlanView: furniture place/drag/rotate (transformer, 45° snaps), overlap + outside-room highlight
- [x] 8. Add-by-link: extraction parser + tests (13 tests), API route with Claude fallback, dimension-confirm UI
- [x] 9. Dollhouse 3D: extruded rooms, camera-facing wall cutaway, scaled category models, orbit
- [x] 10. Saved-designs screen + autosave (zustand persist)
- [x] 11. Verify end-to-end

## Review (2026-07-22)

All v1 scope items built and verified:

- **Tests:** 30/30 pass (`npm test`) — roomGeometry (area/L-shapes/angled walls, point-in-polygon,
  SAT overlap, snapping) and the extraction parser (JSON-LD, OG+spec tables, Swedish labels,
  mm/m/comma-decimal units, concatenated-cell HTML, no-dims case).
- **Build/lint/typecheck:** clean (`npm run build`, `npx eslint src`, `tsc --noEmit`).
- **Extraction, real world:** a live IKEA BILLY page extracted name, photo, "699 SEK", 80×28×202 cm,
  category `bookshelf` — no LLM needed. LLM fallback (claude-sonnet-5) only fires when regexes fail
  AND `ANTHROPIC_API_KEY` is set; without a key the user just types dims in the confirm step.
- **Headless browser drive:** created a design, set the room to 547×265 (the reference-image size),
  placed bed + wardrobe, saw the red overlap highlight, orbited the dollhouse (near-wall cutaway
  works), reloaded → design + items persisted. Zero console/page errors.

Deferred to later phases (per spec): accounts/sharing, AI auto-layout, real door/window holes,
sloped ceilings, per-item real 3D models, export/share, mobile polish.

Not yet committed — repo is git-init'd with no commits; commit when Olof asks.
