# Lessons

- Room polygons are stored in cm, room-local coordinates; a room's `origin` places it in the
  apartment. All geometry helpers take world-space polygons (local + origin) — don't mix frames.
- Don't use cheerio `.text()` for text that feeds regexes: adjacent elements concatenate without
  whitespace ("Bredd:218 cmHöjd:88"), which silently breaks word-boundary matching. Use
  `htmlToText()` (tags → spaces) instead.
- Never `npm run build` while `next start` is serving the same `.next` — the live server serves a
  half-swapped build and the page goes blank. Kill the server, build, then start.
- Konva renders multiple stacked <canvas> elements; Playwright locator clicks get intercepted.
  Drive the canvas with `page.mouse.click(x, y)` at absolute coordinates.
- Unit tests passing ≠ deployed behavior: the extraction bug above only showed up when exercising
  the real API route against served HTML. Always drive the running app once.
