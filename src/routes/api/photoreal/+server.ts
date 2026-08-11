import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

/**
 * Panorama → photoreal panorama, via an image-editing model.
 *
 * POST { image, prompt, provider?, model?, reference?, apiKey?, size? }
 *   → { image: "<data URL>", provider }
 *
 * Two providers, because they fail in different places and neither is clearly
 * ahead for this job:
 *
 * - Gemini 3 Pro Image ("Nano Banana Pro") edits at true 4K and is built around
 *   preserving the image it was handed, which is exactly what we need — but its
 *   aspect ratios come from a fixed list with no 2:1 in it, so an equirectangular
 *   panorama has to round-trip through 21:9 and back, resampling every pixel.
 * - OpenAI gpt-image-2 takes arbitrary sizes (multiples of 16, up to 3840 on the
 *   long edge, ratio within 3:1), so 3840x1920 is a *native* 2:1 and the round
 *   trip disappears — at the cost of a lower ceiling and a looser hand with the
 *   input geometry.
 *
 * Whichever the user can get billed wins; neither has a free tier.
 *
 * Keys come from the server env, or from `apiKey` when the user has pasted one
 * into Settings → AI (openPlan3D's existing localStorage flow). Server-side is
 * preferred: it keeps the key off the client.
 */

export type Provider = 'gemini' | 'openai';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// The GA name. `gemini-3-pro-image-preview` still resolves, but the viewer's
// older AI-render panel is the only thing that still asks for it by name.
const GEMINI_MODEL = 'gemini-3-pro-image';

const OPENAI_EDITS = 'https://api.openai.com/v1/images/edits';
const OPENAI_MODEL = 'gpt-image-2';

const DATA_URL = /^data:image\/(png|jpe?g|webp);base64,/;

interface PhotorealRequest {
  image?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  /** A previously generated panorama, passed so rooms share one look. */
  reference?: string;
  apiKey?: string;
  /** Gemini only — one of its fixed aspect buckets. */
  aspectRatio?: string;
  /** Gemini only — '1K' | '2K' | '4K'. */
  imageSize?: string;
  /** OpenAI only — an explicit "WIDTHxHEIGHT". */
  size?: string;
}

function keyFor(provider: Provider): string | undefined {
  return provider === 'openai' ? env.OPENAI_API_KEY : env.GEMINI_API_KEY;
}

export const GET: RequestHandler = async () => {
  // Lets the UI grey out a provider, and say "add a key in Settings" instead of
  // failing at click time.
  const providers = { gemini: !!env.GEMINI_API_KEY, openai: !!env.OPENAI_API_KEY };
  return json({
    configured: providers.gemini || providers.openai,
    providers,
    default: providers.gemini ? 'gemini' : providers.openai ? 'openai' : null,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  let body: PhotorealRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const provider: Provider = body.provider === 'openai' ? 'openai' : 'gemini';
  const key = body.apiKey?.trim() || keyFor(provider);
  if (!key) return json({ error: 'unconfigured', provider }, { status: 503 });

  const { image, prompt, reference } = body;
  if (!image || !DATA_URL.test(image)) {
    return json({ error: 'Send { image: "<data URL>" }.' }, { status: 400 });
  }
  if (!prompt?.trim()) {
    return json({ error: 'Send a prompt.' }, { status: 400 });
  }

  const hasReference = !!reference && DATA_URL.test(reference);
  try {
    const result =
      provider === 'openai'
        ? await editWithOpenAI(key, body, image, prompt, hasReference ? reference! : undefined)
        : await editWithGemini(key, body, image, prompt, hasReference ? reference! : undefined);
    return result;
  } catch (err) {
    console.error(`${provider} request failed:`, err);
    const reason = err instanceof Error ? err.message : 'unknown';
    return json({ error: `Could not reach the image service (${reason}).` }, { status: 502 });
  }
};

/* ---------------------------------------------------------------- Gemini -- */

async function editWithGemini(
  key: string,
  body: PhotorealRequest,
  image: string,
  prompt: string,
  reference?: string,
): Promise<Response> {
  const model = body.model?.trim() || GEMINI_MODEL;
  const parts: unknown[] = [];

  // Reference first: the model treats leading images as context for the
  // instruction that follows, and the panorama to edit should be last.
  if (reference) {
    parts.push({ inlineData: { mimeType: mimeOf(reference), data: payloadOf(reference) } });
  }
  parts.push({ inlineData: { mimeType: mimeOf(image), data: payloadOf(image) } });
  parts.push({ text: prompt });

  const response = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        // Editing, not inventing — low temperature keeps the model from drifting
        // off the geometry it was handed.
        temperature: 0.2,
        imageConfig: {
          aspectRatio: body.aspectRatio || '21:9',
          imageSize: body.imageSize || '4K',
        },
      },
    }),
    // 4K generation with thinking runs well past the default fetch timeout.
    signal: AbortSignal.timeout(300000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // A key on a project without billing reports `limit: 0` on the free-tier
    // image quota — indistinguishable from ordinary rate limiting unless you
    // read the metric, and no amount of retrying or shrinking the image helps.
    if (response.status === 429 && /limit:\s*0\b/.test(detail)) {
      return json(
        {
          error:
            'This Gemini key has no image-generation quota (free tier is limit 0). ' +
            'Enable billing on its Google Cloud project, use a key from a billed ' +
            'project, or switch the tour to OpenAI.',
        },
        { status: 402 },
      );
    }
    return json(
      { error: `Gemini returned HTTP ${response.status}. ${truncate(detail)}` },
      { status: response.status === 429 ? 429 : 502 },
    );
  }

  const data = await response.json().catch(() => null);
  const candidateParts = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = candidateParts.find((p: { inlineData?: { mimeType?: string } }) =>
    p.inlineData?.mimeType?.startsWith('image/'),
  );

  if (!imagePart) {
    // A refusal or safety block comes back as text — surface it verbatim so the
    // user can adjust the prompt rather than guessing.
    const text = candidateParts.find((p: { text?: string; thought?: boolean }) => p.text && !p.thought)?.text;
    const blocked = data?.promptFeedback?.blockReason;
    return json(
      { error: text || (blocked ? `Blocked: ${blocked}` : 'The model returned no image.') },
      { status: 502 },
    );
  }

  return json({
    provider: 'gemini',
    image: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
  });
}

/* ---------------------------------------------------------------- OpenAI -- */

async function editWithOpenAI(
  key: string,
  body: PhotorealRequest,
  image: string,
  prompt: string,
  reference?: string,
): Promise<Response> {
  const model = body.model?.trim() || OPENAI_MODEL;
  const form = new FormData();
  form.set('model', model);
  form.set('prompt', prompt);
  // gpt-image-2 takes any WIDTHxHEIGHT with both edges a multiple of 16, the
  // long edge <= 3840 and the ratio within 3:1 — so a panorama goes at its
  // native 2:1 and never gets squashed.
  form.set('size', body.size || '3840x1920');
  form.set('quality', 'high');
  form.set('output_format', 'jpeg');
  form.set('n', '1');

  // The panorama to edit goes first — it is the subject. The reference is
  // supporting context, and the prompt identifies the two by content rather
  // than by position so ordering is never load-bearing.
  form.append('image[]', blobOf(image), 'panorama.jpg');
  if (reference) form.append('image[]', blobOf(reference), 'reference.jpg');

  const response = await fetch(OPENAI_EDITS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(300000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // Frontier image models sit behind Persona ID verification, on top of a
    // linked card. The 403 says "must be verified" and no retry clears it.
    if (response.status === 403 && /verif/i.test(detail)) {
      return json(
        {
          error:
            'This OpenAI organisation is not verified for gpt-image-2. Complete ' +
            'organisation verification in the OpenAI console (Settings → General → ' +
            'Verify Organization); it can take up to 24 hours to take effect.',
        },
        { status: 402 },
      );
    }
    if (response.status === 400 && /billing|quota|insufficient/i.test(detail)) {
      return json(
        { error: 'This OpenAI key has no image credit. Add billing to the account.' },
        { status: 402 },
      );
    }
    return json(
      { error: `OpenAI returned HTTP ${response.status}. ${truncate(detail)}` },
      { status: response.status === 429 ? 429 : 502 },
    );
  }

  const data = await response.json().catch(() => null);
  const first = data?.data?.[0];
  if (!first?.b64_json) {
    return json({ error: 'The model returned no image.' }, { status: 502 });
  }

  return json({ provider: 'openai', image: `data:image/jpeg;base64,${first.b64_json}` });
}

/* ----------------------------------------------------------------- utils -- */

function mimeOf(dataUrl: string): string {
  return dataUrl.slice(5, dataUrl.indexOf(';'));
}

function payloadOf(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/**
 * Data URL → Blob, for the multipart upload OpenAI's edit endpoint wants.
 * `atob` rather than `Buffer` so this stays free of Node type definitions and
 * runs on the edge adapters too.
 */
function blobOf(dataUrl: string): Blob {
  const binary = atob(payloadOf(dataUrl));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeOf(dataUrl) });
}

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
