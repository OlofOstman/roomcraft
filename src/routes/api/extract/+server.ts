import Anthropic from '@anthropic-ai/sdk';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { hasAllDims, htmlToText, parseProductPage } from '$lib/extract/parse';
import type { Dims, ExtractResult, FurnitureCategory } from '$lib/extract/types';

const FETCH_HEADERS = {
  // Some furniture shops block requests without a browser-ish UA.
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en,sv;q=0.9',
};

export const POST: RequestHandler = async ({ request }) => {
  let url: string;
  try {
    ({ url } = await request.json());
    new URL(url); // validate
  } catch {
    return json({ error: 'Provide a valid product URL.' }, { status: 400 });
  }

  let html: string;
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    const result: ExtractResult = {
      sourceUrl: url,
      error: `Could not fetch the page (${err instanceof Error ? err.message : 'unknown error'}). You can still add the item manually.`,
    };
    return json(result);
  }

  const result = parseProductPage(html, url);

  // LLM fallback: only when the cheap parsers didn't get all three dimensions
  // and an API key is configured. Without a key we return what we have — the
  // user confirms/corrects dimensions in the UI anyway.
  if (!hasAllDims(result.dims) && env.ANTHROPIC_API_KEY) {
    try {
      const llm = await extractWithClaude(html, result);
      if (llm) {
        result.dims = { ...result.dims, ...llm.dims };
        result.name ??= llm.name;
        if (llm.category && (!result.category || result.category === 'other')) {
          result.category = llm.category;
        }
        if (hasAllDims(result.dims)) result.dimsSource = 'llm';
      }
    } catch (err) {
      console.error('Claude fallback failed:', err);
    }
  }

  return json(result);
};

interface LlmExtraction {
  name?: string;
  category?: FurnitureCategory;
  dims?: Partial<Dims>;
}

const EXTRACTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    name: { type: 'string', description: 'Product name' },
    category: {
      type: 'string',
      enum: [
        'bed', 'sofa', 'armchair', 'chair', 'table', 'desk', 'wardrobe',
        'bookshelf', 'dresser', 'tv-bench', 'rug', 'lamp', 'plant', 'other',
      ],
    },
    width_cm: { type: ['number', 'null'], description: 'Width in cm, null if not stated' },
    depth_cm: { type: ['number', 'null'], description: 'Depth/length in cm, null if not stated' },
    height_cm: { type: ['number', 'null'], description: 'Height in cm, null if not stated' },
  },
  required: ['name', 'category', 'width_cm', 'depth_cm', 'height_cm'],
  additionalProperties: false,
};

async function extractWithClaude(
  html: string,
  parsed: ExtractResult,
): Promise<LlmExtraction | null> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  // Strip tags server-side so we send text, not markup; cap the size.
  const text = htmlToText(html).slice(0, 30000);

  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
    messages: [
      {
        role: 'user',
        content:
          `This is the text of a furniture product page${parsed.name ? ` for "${parsed.name}"` : ''}. ` +
          `Extract the product name, its furniture category, and its overall dimensions in centimeters ` +
          `(width, depth, height). Convert units to cm. Use null for any dimension the page does not state.\n\n${text}`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') return null;
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return null;

  const data = JSON.parse(block.text);
  const dims: Partial<Dims> = {};
  if (typeof data.width_cm === 'number') dims.w = data.width_cm;
  if (typeof data.depth_cm === 'number') dims.d = data.depth_cm;
  if (typeof data.height_cm === 'number') dims.h = data.height_cm;
  return { name: data.name, category: data.category, dims };
}
