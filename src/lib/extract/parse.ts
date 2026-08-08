import * as cheerio from 'cheerio';
import type { Dims, ExtractResult, FurnitureCategory } from './types';

/**
 * Extract product data from a product-page HTML string.
 * Strategy: schema.org JSON-LD → Open Graph/meta tags → dimension regexes over
 * spec tables and text. The LLM fallback lives in the API route, not here.
 */
export function parseProductPage(html: string, sourceUrl: string): ExtractResult {
  const $ = cheerio.load(html);

  const result: ExtractResult = { sourceUrl, dimsSource: 'none' };

  // --- 1. schema.org JSON-LD ---
  $('script[type="application/ld+json"]').each((_, el) => {
    if (result.name && result.image && result.price) return;
    try {
      const data = JSON.parse($(el).text());
      const products = flattenJsonLd(data).filter(
        (n) => typeOf(n).includes('Product'),
      );
      for (const p of products) {
        result.name ??= str(p.name);
        result.image ??= firstImage(p.image);
        const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
        if (offers && !result.price) {
          const price = str(offers.price) ?? str(offers.lowPrice);
          const currency = str(offers.priceCurrency);
          if (price) result.price = currency ? `${price} ${currency}` : price;
        }
        // schema.org depth/width/height as QuantitativeValue or string
        const dims: Partial<Dims> = {
          w: qty(p.width),
          d: qty(p.depth),
          h: qty(p.height),
        };
        if (dims.w || dims.d || dims.h) {
          result.dims = { ...dims, ...result.dims };
          result.dimsSource = 'structured';
        }
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  });

  // --- 2. Open Graph / meta fallback ---
  result.name ??=
    $('meta[property="og:title"]').attr('content') ??
    ($('title').first().text().trim() || undefined);
  result.image ??= $('meta[property="og:image"]').attr('content') ?? undefined;
  if (!result.price) {
    const amount =
      $('meta[property="product:price:amount"]').attr('content') ??
      $('meta[property="og:price:amount"]').attr('content');
    const currency =
      $('meta[property="product:price:currency"]').attr('content') ??
      $('meta[property="og:price:currency"]').attr('content');
    if (amount) result.price = currency ? `${amount} ${currency}` : amount;
  }

  // --- 3. Dimensions from spec tables / free text ---
  // Tag boundaries become spaces — cheerio's .text() concatenates adjacent
  // cells ("Bredd:218 cmHöjd:88"), which breaks word-boundary matching.
  const text = htmlToText(html);
  if (!hasAllDims(result.dims)) {
    const fromText = parseDimensionsFromText(text);
    if (fromText) {
      result.dims = { ...fromText, ...result.dims };
      if (result.dimsSource === 'none') result.dimsSource = 'text';
    }
  }

  result.category = guessCategory(`${result.name ?? ''} ${sourceUrl} ${text.slice(0, 2000)}`);
  return result;
}

/** Visible-ish text of an HTML document with tag boundaries preserved as spaces. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- dimension text parsing ----------

const UNIT_TO_CM: Record<string, number> = { mm: 0.1, cm: 1, m: 100 };

function toCm(value: number, unit: string): number {
  return Math.round(value * (UNIT_TO_CM[unit.toLowerCase()] ?? 1) * 10) / 10;
}

const NUM = '(\\d+(?:[.,]\\d+)?)';
const UNIT = '(mm|cm|m)\\b';

/**
 * Pull W/D/H (cm) out of free text. Handles labeled dimensions in English and
 * Swedish ("Width: 218 cm", "Bredd: 218 cm") and "218 x 88 x 83 cm" triples.
 */
export function parseDimensionsFromText(text: string): Partial<Dims> | null {
  const dims: Partial<Dims> = {};

  const labelPatterns: Array<[keyof Dims, RegExp]> = [
    ['w', new RegExp(`\\b(?:width|bredd|breite|w|b)\\s*[:.]?\\s*${NUM}\\s*${UNIT}`, 'i')],
    ['d', new RegExp(`\\b(?:depth|djup|length|längd|l[äa]nge|d|l)\\s*[:.]?\\s*${NUM}\\s*${UNIT}`, 'i')],
    ['h', new RegExp(`\\b(?:height|höjd|h[öo]he|h)\\s*[:.]?\\s*${NUM}\\s*${UNIT}`, 'i')],
  ];
  for (const [key, re] of labelPatterns) {
    const m = text.match(re);
    if (m) dims[key] = toCm(parseFloat(m[1].replace(',', '.')), m[2]);
  }

  if (!hasAllDims(dims)) {
    // "218 x 88 x 83 cm" — unit applies to all three
    const triple = text.match(
      new RegExp(`${NUM}\\s*[x×]\\s*${NUM}\\s*[x×]\\s*${NUM}\\s*${UNIT}`, 'i'),
    );
    if (triple) {
      const [a, b, c] = [triple[1], triple[2], triple[3]].map((n) =>
        toCm(parseFloat(n.replace(',', '.')), triple[4]),
      );
      dims.w ??= a;
      dims.d ??= b;
      dims.h ??= c;
    }
  }

  return dims.w || dims.d || dims.h ? dims : null;
}

export function hasAllDims(dims?: Partial<Dims>): dims is Dims {
  return !!dims && dims.w != null && dims.d != null && dims.h != null;
}

// ---------- category guessing ----------

const CATEGORY_KEYWORDS: Array<[FurnitureCategory, RegExp]> = [
  ['bed', /\b(bed|säng|sang|mattress|madrass)\b/i],
  ['sofa', /\b(sofa|soffa|couch|bäddsoffa|loveseat)\b/i],
  ['armchair', /\b(armchair|fåtölj|fatolj|recliner)\b/i],
  ['wardrobe', /\b(wardrobe|garderob|closet|pax)\b/i],
  ['bookshelf', /\b(bookshelf|bookcase|bokhylla|shelf|shelving|hylla|billy)\b/i],
  ['desk', /\b(desk|skrivbord)\b/i],
  ['tv-bench', /\b(tv[- ]?(bench|stand|unit|bänk)|media\s?bench)\b/i],
  ['dresser', /\b(dresser|chest of drawers|byrå|byra|drawer)\b/i],
  ['chair', /\b(chair|stol|pall|stool)\b/i],
  ['table', /\b(table|bord)\b/i],
  ['rug', /\b(rug|carpet|matta)\b/i],
  ['lamp', /\b(lamp|lampa|light)\b/i],
  ['plant', /\b(plant|växt|vaxt)\b/i],
];

export function guessCategory(text: string): FurnitureCategory {
  for (const [category, re] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return category;
  }
  return 'other';
}

// ---------- JSON-LD helpers ----------

/* eslint-disable @typescript-eslint/no-explicit-any */

function flattenJsonLd(data: any): any[] {
  if (Array.isArray(data)) return data.flatMap(flattenJsonLd);
  if (data && typeof data === 'object') {
    const nested = data['@graph'] ? flattenJsonLd(data['@graph']) : [];
    return [data, ...nested];
  }
  return [];
}

function typeOf(node: any): string[] {
  const t = node?.['@type'];
  return Array.isArray(t) ? t : t ? [t] : [];
}

function str(v: any): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number') return String(v);
  return undefined;
}

function firstImage(v: any): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return firstImage(v[0]);
  if (v && typeof v === 'object') return str(v.url) ?? str(v.contentUrl);
  return undefined;
}

/** schema.org QuantitativeValue or bare "88 cm" string → cm */
function qty(v: any): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'object') {
    const value = parseFloat(v.value);
    if (Number.isNaN(value)) return undefined;
    const unit = str(v.unitCode) === 'MMT' ? 'mm' : str(v.unitText) ?? 'cm';
    return toCm(value, unit.toLowerCase());
  }
  const m = String(v).match(new RegExp(`${NUM}\\s*${UNIT}?`, 'i'));
  if (!m) return undefined;
  return toCm(parseFloat(m[1].replace(',', '.')), m[2] ?? 'cm');
}
