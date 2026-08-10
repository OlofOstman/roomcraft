# Roomcraft

Plan an apartment in 2D, walk through it in 3D, and furnish it by **pasting a product link**.

Roomcraft is a fork of [openPlan3D](https://github.com/laanlabs/openPlan3D) (MIT, © theLodgeStudio),
which supplies the floor-plan editor, the top-down architectural symbols, and the 3D walkthrough.
What Roomcraft adds on top is add-by-link: paste a furniture product URL and get a to-scale item
that appears both as a plan symbol and as something you can walk past.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173. No account, no server, no config — projects are stored in `localStorage`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build (adapter-node) |
| `npm run preview` | Serve the production build |
| `npm test` | Vitest — extraction parser unit tests |
| `npm run check` | `svelte-check` typecheck |

## Add-by-link

`POST /api/extract` with `{ "url": "..." }` returns name, image, price, dimensions (cm) and a
furniture category. It tries schema.org JSON-LD, then Open Graph + spec tables, then dimension
regexes over the page text — handling mm/m units, comma decimals, and Swedish labels
(`Bredd`/`Djup`/`Höjd`).

Only when those fail *and* `ANTHROPIC_API_KEY` is set does it fall back to Claude with a
JSON-schema-constrained call. Without a key the flow still works — the user types the dimensions in
the confirm step. Copy `.env.example` to `.env` to enable the fallback.

## Photoreal tour

The globe button in the 3D view builds a walkthrough you can actually show
someone. It renders a 4096×2048 equirectangular 360 of every detected room from
the three.js scene, sends each one to Gemini's image model as an *edit* —
"same geometry, same furniture, same viewpoint; make it a photograph" — and
drops the results onto a sphere you stand inside. Mouse-look is free, floor
markers and ← → walk you between rooms, and each room after the first is given
the previous panorama as a reference so the whole flat looks like one home.

Per-frame AI is not an option: an image model needs seconds per image and
invents different details each call, so a moving camera would strobe. Paying
once per *viewpoint* is what makes it navigable.

Panoramas are cached in IndexedDB, so a tour is generated once. **Preview tour
(no AI)** builds the same navigable tour from the raw 3D captures — free,
instant, and what you get without a key.

Gemini cannot emit a native 2:1 frame, so the panorama is squashed to 21:9 on
the way out and stretched back on return, and the wrap-around seam is
cross-faded. Set `GEMINI_API_KEY` in `.env`, or paste a key into Settings → AI.

## Layout

```
src/lib/extract/        add-by-link parser + types (unit tested)
src/routes/api/extract/ the extraction endpoint
src/lib/utils/          furnitureCatalog, furnitureIcons (2D plan symbols),
                        furnitureModelLoader (GLB), roomDetection, cadExport,
                        panorama (equirect capture), viewpoints (where to
                        stand), photorealTour (prompt + generation)
src/routes/api/photoreal/  panorama → Gemini image edit
src/lib/components/     editor (2D canvas), viewer3d (Three.js), sidebar, toolbar
static/models/          204 GLB furniture models — Kenney Furniture Kit (CC0)
static/hdri/            4 CC0 sky HDRIs, one per time-of-day preset
```

## Licence and attribution

Roomcraft is MIT. It inherits openPlan3D's MIT licence — see `LICENSE`, which retains the original
copyright notice. Bundled 3D assets and their licences are listed in `MODEL_SOURCES.md`; the models
currently shipped are CC0 and need no attribution, but check that file before adding more.
