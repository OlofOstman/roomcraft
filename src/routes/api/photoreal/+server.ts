import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

/**
 * Panorama → photoreal panorama, via Gemini's image model.
 *
 * POST { image, prompt, model?, reference?, apiKey? } → { image: "<data URL>" }
 *
 * The key comes from GEMINI_API_KEY on the server, or from `apiKey` when the
 * user has pasted one into Settings → AI (openPlan3D's existing localStorage
 * flow). Server-side is preferred: it keeps the key off the client and lets a
 * deployment offer the feature to users who have no key of their own.
 *
 * Gemini cannot emit a native 2:1 frame, so the client squashes the panorama to
 * 21:9 before sending and stretches the result back — the ratio requested here
 * has to match what the client did.
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3-pro-image-preview';
const DATA_URL = /^data:image\/(png|jpe?g|webp);base64,/;

interface PhotorealRequest {
  image?: string;
  prompt?: string;
  model?: string;
  /** A previously generated panorama, passed so rooms share one look. */
  reference?: string;
  apiKey?: string;
  aspectRatio?: string;
  imageSize?: string;
}

export const GET: RequestHandler = async () => {
  // Lets the UI say "add a key in Settings" instead of failing at click time.
  return json({ configured: !!env.GEMINI_API_KEY });
};

export const POST: RequestHandler = async ({ request }) => {
  let body: PhotorealRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const key = body.apiKey?.trim() || env.GEMINI_API_KEY;
  if (!key) return json({ error: 'unconfigured' }, { status: 503 });

  const { image, prompt, reference } = body;
  if (!image || !DATA_URL.test(image)) {
    return json({ error: 'Send { image: "<data URL>" }.' }, { status: 400 });
  }
  if (!prompt?.trim()) {
    return json({ error: 'Send a prompt.' }, { status: 400 });
  }

  const model = body.model?.trim() || DEFAULT_MODEL;
  const parts: unknown[] = [];

  // Reference first: the model treats leading images as context for the
  // instruction that follows, and the panorama to edit should be last.
  if (reference && DATA_URL.test(reference)) {
    parts.push({ inlineData: { mimeType: mimeOf(reference), data: payloadOf(reference) } });
  }
  parts.push({ inlineData: { mimeType: mimeOf(image), data: payloadOf(image) } });
  parts.push({ text: prompt });

  const requestBody = {
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
  };

  let response: Response;
  try {
    response = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(requestBody),
      // 4K generation with thinking runs well past the default fetch timeout.
      signal: AbortSignal.timeout(300000),
    });
  } catch (err) {
    console.error('Gemini request failed:', err);
    const reason = err instanceof Error ? err.message : 'unknown';
    return json({ error: `Could not reach the image service (${reason}).` }, { status: 502 });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return json(
      { error: `Image service returned HTTP ${response.status}. ${truncate(detail)}` },
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
    image: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
  });
};

function mimeOf(dataUrl: string): string {
  return dataUrl.slice(5, dataUrl.indexOf(';'));
}

function payloadOf(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
