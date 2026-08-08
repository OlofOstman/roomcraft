# Lessons

- Don't use cheerio `.text()` for text that feeds regexes: adjacent elements concatenate without
  whitespace ("Bredd:218 cmHöjd:88"), which silently breaks word-boundary matching. Use
  `htmlToText()` (tags → spaces) instead.
- Unit tests passing ≠ deployed behavior: the extraction bug above only showed up when exercising
  the real API route against served HTML. Always drive the running app once. (Live retail pages
  often 403 a server-side fetch — serve a local fixture over HTTP to test the real endpoint.)
- Vitest and the SvelteKit vite plugin don't mix well: the plugin wants a synced `.svelte-kit`
  dir and `$app/*` aliases the tests never touch. Keep a separate `vitest.config.ts` with no
  SvelteKit plugin.
- Before forking, check what the upstream project hardcodes to *its own* infrastructure.
  openPlan3D looked config-free because `datastore.ts` is pure localStorage, but the editor also
  fetched iOS captures from openplan3d's Firebase Storage bucket, and `+layout.svelte` loaded
  their analytics keys. Both had to go.
- `svelte-check` on a fresh fork surfaced 6 pre-existing type errors. Diff a file against the
  upstream clone before assuming your port broke it.

## Superseded (kept for context)

The v1 Next.js app is on `main` at commit 3d4d372: Konva 2D canvas, react-three-fiber dollhouse,
zustand store, and a `roomGeometry.ts` with 17 tests. Its lessons about room-local vs world
coordinate frames and Konva's stacked canvases no longer apply — openPlan3D has its own geometry
and renders to a single canvas.
