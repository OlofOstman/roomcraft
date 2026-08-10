# HDRI environment maps

Image-based lighting for the 3D view. One per time-of-day preset in
`ThreeViewer.svelte`; the sky gradient is used as an immediate fallback while
these load, and if a load fails.

All four are **CC0** (public domain) from [Poly Haven](https://polyhaven.com/hdris),
downloaded at 1k by `scripts/fetch-hdri.mjs`. CC0 requires no attribution — this
file is a record of provenance, not a licence obligation.

| File | Source | Used for |
| --- | --- | --- |
| `kloofendal_misty_morning_puresky_1k.hdr` | [Kloofendal Misty Morning (Pure Sky)](https://polyhaven.com/a/kloofendal_misty_morning_puresky) | Morning |
| `kloppenheim_02_puresky_1k.hdr` | [Kloppenheim 02 (Pure Sky)](https://polyhaven.com/a/kloppenheim_02_puresky) | Noon |
| `venice_sunset_1k.hdr` | [Venice Sunset](https://polyhaven.com/a/venice_sunset) | Evening |
| `dikhololo_night_1k.hdr` | [Dikhololo Night](https://polyhaven.com/a/dikhololo_night) | Night |

To refresh or add resolutions, edit the `WANTED` / `RES` constants in
`scripts/fetch-hdri.mjs` and re-run it.
