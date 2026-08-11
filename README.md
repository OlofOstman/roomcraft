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
the three.js scene, sends each one to an image model as an *edit* —
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

### Choosing the image model

Two are wired up, selectable in the tour panel. Neither is clearly ahead, and
**neither has a free tier** — the choice is mostly about which account you can
get billed.

| | Gemini 3 Pro Image | OpenAI gpt-image-2 |
|---|---|---|
| Panorama shape | no 2:1 — squashed to 21:9 and back | **native 2:1** at 3840×1920 |
| Resolution | true 4K | 3840 max, >2560×1440 "experimental" |
| Cost per room | ~$0.24 | ~$0.41 at high quality |
| Strength | built around preserving the input image | arbitrary output sizes |
| Gate | billing (free tier is `limit: 0`) | billing **+** Persona ID org verification |

The 21:9 round trip is the reason to prefer OpenAI here: it resamples every
pixel twice and hands the model a visibly distorted room to reason about. The
reason to prefer Gemini is that holding the geometry still is the whole job, and
that is what it is built for. Which matters more is an empirical question we
have not been able to settle — see `tasks/todo.md` item 22.

Whichever runs, the wrap-around seam is cross-faded on return. Set
`GEMINI_API_KEY` or `OPENAI_API_KEY` in `.env`, or paste a key into Settings → AI.

Neither editor *guarantees* the walls stay put. If both smear the geometry, the
technique that actually constrains it is depth-conditioned generation
(ControlNet) — and the scene can render an exact depth panorama for free. That
needs a Replicate/fal pipeline rather than one API key, so it is the fallback,
not the default.

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
