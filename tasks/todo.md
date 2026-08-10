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

## Direction change 2 (2026-08-08): photo + measurements, not scraping

Dropped add-by-link. Live retail pages 403 a server-side fetch (confirmed against IKEA), and
scraped images are often lifestyle shots with several objects in frame — bad input for
image-to-3D. The user uploads a clean product photo and types the real measurements instead,
so dimensions are authoritative rather than a regex guess.

The extraction pipeline (`src/lib/extract/`, `/api/extract`, `cheerio`, `@anthropic-ai/sdk`)
is now unused. Left in place for now; delete once the photo flow is settled.

- [x] 5. Rebrand: page title, welcome screen, PDF footer
- [x] 6. `FurnitureDef` + `imageUrl` / `modelUrl` / `source`; `customFurniture` on `Project`;
      `getCatalogItem` resolves custom defs from a registry synced by `stores/project.ts`
- [x] 7. "Add your own item" panel — photo (downscaled to 640px, JPEG q0.82), name, category,
      W/D/H in cm. Lands in a "My items" category and is armed for placing immediately.
- [x] 8. `furnitureModelLoader` prefers a def's `modelUrl` over the `MODEL_MAP` lookup

- [x] 9. IndexedDB blob store (`src/lib/services/blobStore.ts`). Photos and generated models
      live there; the project JSON keeps only `idb:<key>` refs, resolved to object URLs at
      render time. Deleting an item reclaims its blobs.
- [x] 10. First realism pass: PMREM environment map off the existing sky gradient →
      `scene.environment`, so MeshStandardMaterial finally has something to reflect. Flat
      ambient/hemi dialled back (0.35→0.12, 0.4→0.25) since IBL now carries the ambient term;
      2048 shadow map over a tighter frustum, plus normalBias/radius for softer contact
      shadows. Explicit sRGB output.

- [x] 11. Tripo image-to-3D wired end-to-end: `/api/generate-model` proxies upload/task/
      status/GLB-download (key stays server-side); "✨ Make 3D" on custom items polls and
      swaps the box for the GLB via `setCustomFurnitureModel`. **NOT verified against the
      live API** — this container's egress blocks api.tripo3d.ai (confirmed: proxy 403s the
      CONNECT). Error paths verified; needs one real generation run on a dev machine.
- [x] 12a. GTAO ambient occlusion (EffectComposer + GTAOPass + OutputPass), tuned for the
      cm-scale scene (radius 120). Verified via the AO debug buffer: correct contact
      darkening at floor/wall junctions and corners. Composer falls back to plain
      rendering if postprocessing fails.
- [x] 12b. Ceiling regression fixed — the first realism pass dimmed ambient so far that
      the (already existing) ceilings rendered near-black. Hemisphere ground colour now
      carries downward-facing surfaces.
- [x] 14. Walkthrough spawn: golden-angle spiral from the room centroid to the first
      point clear of furniture footprints (circle approximation + 35cm clearance).

## Photoreal walkthrough (2026-08-10)

The goal was a photorealistic walkthrough a user can actually use. Per-frame AI
cannot do it — seconds per image, and a fresh hallucination each call, so a
moving camera strobes. The cost moves off the frame loop and onto *viewpoints*:
one AI-repainted 360 per room, navigable like a Matterport tour.

- [x] 17. `panorama.ts` — equirectangular 360 capture from the scene
      (CubeCamera → cube map → reprojection shader), plus seam cross-fade.
      **Found and fixed:** three only tone-maps when drawing to the canvas; a
      render-target pass is forced to NoToneMapping internally. The first
      captures were therefore raw linear values crushed into 8 bits — every lit
      white wall clipped flat and `toneMappingExposure` did nothing. The cube
      target is half-float now and the reprojection shader applies three's own
      ACES fit. Measured over a captured panorama: clipping fell 14.7% → 0.8%.
- [x] 18. `viewpoints.ts` — extracted the walkthrough's spawn logic, added wall
      clearance and an opening-facing heading, and unit-tested it (9 tests).
      The old spawn could stand 90cm from a wall *facing it*, which is why the
      walkthrough opened on a blank white rectangle.
- [x] 19. Interior lighting. Sunlight shone straight through the ceilings and
      scorched whichever wall it landed on while everything else sat near
      black. Ceilings cast shadows now, every room has its own soft fixture,
      and exposure came down 1.2 → 0.85.
- [x] 20. Real CC0 sky HDRIs (Poly Haven, `static/hdri/`), one per time-of-day
      preset, replacing the environment prefiltered from the sky gradient.
- [x] 21. `/api/photoreal` + `photorealTour.ts` — Gemini 3 Pro Image edit with
      a geometry-preserving prompt, the previous room passed as a style
      reference, IndexedDB caching, and a free no-AI tour without a key.
      Gemini has no native 2:1 output, so the panorama round-trips through
      21:9 (the documented workaround) at 4K.
- [ ] 22. **Unverified against the live API** — no Gemini key was available on
      this machine. Everything up to the network call is exercised; the request
      shape, the 21:9 round trip and the response parsing need one real run.

## Next

- [ ] 13. Realism round two:
      - real PBR textures on walls/floors — Poly Haven / ambientCG are both CC0, but
        BLOCKED from this container (egress); download a handful on a dev machine and
        commit them to static/textures/
      - optional "render this view" via three-gpu-pathtracer (MIT) — converges to a
        still, so a render button, not the live walkthrough
- [ ] 15. Verify one real Tripo generation on a dev machine (egress blocks it here);
      check the GLB lands, scales to the item dims, and survives reload from IndexedDB.
- [ ] 16. ROTATE the Tripo API key that was pasted into the chat session, then put the
      new one only in .env (gitignored).

## Open questions

- Tripo costs ~$0.40–0.50/item direct (40–50 credits at $0.01). Decide whether the free tier
  gets generation at all.
- `MODEL_SOURCES.md` lists poly.pizza as mostly CC-BY. Currently shipped models are Kenney CC0,
  so no attribution is due — re-check before pulling in more.

## Known upstream issues inherited

- `BuildPanel.svelte` has "Dimension" and "Measure" tool buttons that no canvas code handles —
  clicking them does nothing. Added `'annotate' | 'measure'` to the `Tool` union so
  `npm run check` passes; the buttons still need wiring or removing.
- 25 a11y warnings from `svelte-check`, all upstream (click handlers on non-interactive divs).
