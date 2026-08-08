# Roomcraft — Build Plan

## Direction change (2026-08-08)

v1 was a from-scratch Next.js planner. It worked, but we were rebuilding commodity
functionality (walls, doors, room detection, 3D view) that mature MIT-licensed projects already
have. Researched the field and forked [openPlan3D](https://github.com/laanlabs/openPlan3D)
instead, so effort goes into the one thing nobody else has: **paste a product link, get a
to-scale item** that shows as an IKEA-style plan symbol in 2D and as a real object in the
walkthrough.

What the fork gives us for free: click-to-place walls with snapping, six door/window styles,
stairs, auto room detection, 140+ catalog items, 204 CC0 GLB models, first-person walkthrough,
material/lighting editor, undo/redo, and SVG/DXF/PDF/PNG/JSON export.

What we dropped from v1: `roomGeometry.ts` and its 17 tests (openPlan3D's room detection,
snapping and hit-testing supersede it), the Konva 2D canvas, the react-three-fiber dollhouse,
and the zustand store.

## Done

- [x] 1. Fork openPlan3D into the repo; keep MIT `LICENSE` with theLodgeStudio's copyright
- [x] 2. Remove Firebase — deleted `src/lib/firebase.ts` (their analytics keys), the
      `firebase` dep, and the iOS RoomPlan handoff that fetched from *their* storage bucket.
      `datastore.ts` was already localStorage-only, so persistence needed no work.
- [x] 3. Port the extraction pipeline: `src/lib/extract/{parse,types}.ts` + 13 tests, and
      `src/app/api/extract/route.ts` → `src/routes/api/extract/+server.ts`
- [x] 4. Verify: 13/13 tests, clean `npm run build`, 0 errors from `npm run check`,
      routes serve 200, and a served fixture extracted name/image/price/dims/category
      end-to-end through the real endpoint

## Next

- [ ] 5. Extend `FurnitureDef` (`src/lib/utils/furnitureCatalog.ts`) with `modelUrl`,
      `imageUrl`, `price`, `sourceUrl`, `source: 'catalog' | 'link'`
- [ ] 6. Add-by-link UI: paste URL → confirm/correct dims → item lands in the catalog
- [ ] 7. Teach `furnitureModelLoader.ts` to prefer `modelUrl` over the `MODEL_MAP` lookup;
      `GLTFLoader` already loads from any URL
- [ ] 8. Tripo image-to-3D job: scraped photo → GLB. **Needs a placeholder** — generation takes
      30s–3min, so the item must appear immediately as a correctly-sized box and get swapped
      when the job returns, or the walkthrough has holes in it.
- [ ] 9. Generic top-down symbol for link items, keyed off the scraped category, so they read
      correctly in plan view from the moment they're added

## Open questions

- Tripo costs ~$0.40–0.50/item direct (40–50 credits at $0.01). Fine for paid users; decide
  whether the free tier gets AI generation at all, or only library-match + textured box.
- `MODEL_SOURCES.md` lists poly.pizza as mostly CC-BY. Currently shipped models are Kenney CC0,
  so no attribution is due — re-check before pulling in more.

## Known upstream issues inherited

- `BuildPanel.svelte` has "Dimension" and "Measure" tool buttons that no canvas code handles —
  clicking them does nothing. Added `'annotate' | 'measure'` to the `Tool` union so
  `npm run check` passes; the buttons still need wiring or removing.
- 25 a11y warnings from `svelte-check`, all upstream (click handlers on non-interactive divs).
