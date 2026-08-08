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

## Layout

```
src/lib/extract/        add-by-link parser + types (unit tested)
src/routes/api/extract/ the extraction endpoint
src/lib/utils/          furnitureCatalog, furnitureIcons (2D plan symbols),
                        furnitureModelLoader (GLB), roomDetection, cadExport
src/lib/components/     editor (2D canvas), viewer3d (Three.js), sidebar, toolbar
static/models/          204 GLB furniture models — Kenney Furniture Kit (CC0)
```

## Licence and attribution

Roomcraft is MIT. It inherits openPlan3D's MIT licence — see `LICENSE`, which retains the original
copyright notice. Bundled 3D assets and their licences are listed in `MODEL_SOURCES.md`; the models
currently shipped are CC0 and need no attribution, but check that file before adding more.
