import { describe, expect, it } from 'vitest';
import { guessCategory, parseDimensionsFromText, parseProductPage } from './parse';

const JSONLD_PAGE = `<!doctype html><html><head>
<title>Fancy Sofa | Shop</title>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "EKTORP 3-seat sofa",
  "image": ["https://img.example.com/ektorp.jpg"],
  "offers": {"@type": "Offer", "price": "4995", "priceCurrency": "SEK"},
  "width": {"@type": "QuantitativeValue", "value": "218", "unitText": "cm"},
  "depth": {"@type": "QuantitativeValue", "value": "88", "unitText": "cm"},
  "height": {"@type": "QuantitativeValue", "value": "88", "unitText": "cm"}
}
</script></head><body>A sofa page</body></html>`;

const TABLE_PAGE = `<!doctype html><html><head>
<meta property="og:title" content="PAX Wardrobe frame">
<meta property="og:image" content="https://img.example.com/pax.jpg">
<meta property="product:price:amount" content="1295">
<meta property="product:price:currency" content="SEK">
</head><body>
<table><tr><td>Width:</td><td>100 cm</td></tr>
<tr><td>Depth:</td><td>58 cm</td></tr>
<tr><td>Height:</td><td>201.2 cm</td></tr></table>
</body></html>`;

const TEXT_TRIPLE_PAGE = `<!doctype html><html><head><title>Bänk</title></head>
<body>Snygg tv-bänk i ek. Mått: 160 x 42 x 50 cm. Fri frakt.</body></html>`;

const NO_DIMS_PAGE = `<!doctype html><html><head>
<meta property="og:title" content="Mystery Lamp"></head>
<body>A lamp with no measurements listed anywhere.</body></html>`;

describe('parseProductPage', () => {
  it('extracts everything from JSON-LD', () => {
    const r = parseProductPage(JSONLD_PAGE, 'https://shop.example.com/ektorp');
    expect(r.name).toBe('EKTORP 3-seat sofa');
    expect(r.image).toBe('https://img.example.com/ektorp.jpg');
    expect(r.price).toBe('4995 SEK');
    expect(r.dims).toEqual({ w: 218, d: 88, h: 88 });
    expect(r.dimsSource).toBe('structured');
    expect(r.category).toBe('sofa');
  });

  it('falls back to OG tags + labeled spec table', () => {
    const r = parseProductPage(TABLE_PAGE, 'https://shop.example.com/pax');
    expect(r.name).toBe('PAX Wardrobe frame');
    expect(r.price).toBe('1295 SEK');
    expect(r.dims).toEqual({ w: 100, d: 58, h: 201.2 });
    expect(r.dimsSource).toBe('text');
    expect(r.category).toBe('wardrobe');
  });

  it('parses Swedish W x D x H triples from body text', () => {
    const r = parseProductPage(TEXT_TRIPLE_PAGE, 'https://shop.example.com/tv');
    expect(r.dims).toEqual({ w: 160, d: 42, h: 50 });
    expect(r.category).toBe('tv-bench');
  });

  it('handles table cells that concatenate without whitespace', () => {
    // Minified pages render as "Bredd:218 cmHöjd:88" via naive text extraction
    const html =
      '<!doctype html><html><head><title>Soffa</title></head><body>' +
      '<h1>EKTORP</h1><table><tr><td>Bredd:</td><td>218 cm</td></tr>' +
      '<tr><td>Djup:</td><td>88 cm</td></tr><tr><td>Höjd:</td><td>88 cm</td></tr>' +
      '</table></body></html>';
    const r = parseProductPage(html, 'https://shop.example.com/soffa');
    expect(r.dims).toEqual({ w: 218, d: 88, h: 88 });
  });

  it('returns no dims (dimsSource none) when nothing is found', () => {
    const r = parseProductPage(NO_DIMS_PAGE, 'https://shop.example.com/lamp');
    expect(r.name).toBe('Mystery Lamp');
    expect(r.dims).toBeUndefined();
    expect(r.dimsSource).toBe('none');
    expect(r.category).toBe('lamp');
  });
});

describe('parseDimensionsFromText', () => {
  it('handles mm and m units', () => {
    expect(parseDimensionsFromText('Width: 2180 mm Depth: 0.88 m Height: 88 cm')).toEqual({
      w: 218,
      d: 88,
      h: 88,
    });
  });

  it('handles Swedish labels', () => {
    expect(parseDimensionsFromText('Bredd: 80 cm, Djup: 28 cm, Höjd: 202 cm')).toEqual({
      w: 80,
      d: 28,
      h: 202,
    });
  });

  it('handles comma decimals', () => {
    expect(parseDimensionsFromText('Höjd: 201,2 cm')).toEqual({ h: 201.2 });
  });

  it('returns null for text without dimensions', () => {
    expect(parseDimensionsFromText('A very nice piece of furniture')).toBeNull();
  });
});

describe('guessCategory', () => {
  it.each([
    ['MALM säng 160', 'bed'],
    ['BILLY bokhylla', 'bookshelf'],
    ['Office desk 120', 'desk'],
    ['Something unknowable', 'other'],
  ])('categorizes %s as %s', (name, expected) => {
    expect(guessCategory(name)).toBe(expected);
  });
});
