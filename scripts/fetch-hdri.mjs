/**
 * Fetch a handful of CC0 sky HDRIs from Poly Haven into static/hdri/.
 * Run once with `node scripts/fetch-hdri.mjs`; the .hdr files are committed so
 * the app has no runtime dependency on polyhaven.com.
 */
import { writeFile, mkdir } from 'node:fs/promises';

const WANTED = [
  'kloofendal_misty_morning_puresky',
  'kloppenheim_02_puresky',
  'venice_sunset',
  'dikhololo_night',
];
const RES = '1k';
const OUT = 'static/hdri';

await mkdir(OUT, { recursive: true });

for (const slug of WANTED) {
  const meta = await (await fetch(`https://api.polyhaven.com/files/${slug}`)).json();
  const entry = meta?.hdri?.[RES]?.hdr;
  if (!entry?.url) {
    console.log(`${slug}: no ${RES} hdr`);
    continue;
  }
  const buf = Buffer.from(await (await fetch(entry.url)).arrayBuffer());
  await writeFile(`${OUT}/${slug}_${RES}.hdr`, buf);
  console.log(`${slug}_${RES}.hdr  ${Math.round(buf.length / 1024)}KB`);
}
