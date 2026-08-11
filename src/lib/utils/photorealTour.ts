/**
 * Photoreal tour generation.
 *
 * Turning a walkthrough photoreal frame-by-frame is not possible: an image
 * model takes seconds per image and hallucinates differently every call, so a
 * moving camera would strobe. Move the cost off the frame loop instead — pay it
 * once per *viewpoint*, and let the user look around inside the result. That is
 * how a Matterport tour works, and it is the shape that fits here.
 *
 * Per viewpoint: render an equirectangular 360 from the three.js scene, hand it
 * to an image-editing model, and cache the photoreal panorama.
 */
import { blendPanoramaSeam, loadImageToCanvas, resizeCanvas } from '$lib/utils/panorama';
import { putDataUrl, resolveAssetUrl } from '$lib/services/blobStore';

/** The 2:1 layout every 360 viewer expects. */
export const PANORAMA_WIDTH = 4096;
export const PANORAMA_HEIGHT = PANORAMA_WIDTH / 2;

export type PhotorealProvider = 'gemini' | 'openai';

/**
 * Gemini has no native 2:1 output, so the panorama is squashed into the closest
 * ratio it does support and stretched back on return — the 21:9 round trip from
 * Google's own writeup on editing equirectangular images. Every pixel gets
 * resampled twice and the model reasons about a distorted room.
 *
 * gpt-image-2 takes arbitrary sizes, and 3840x1920 satisfies all of its
 * constraints (both edges a multiple of 16, long edge <= 3840, ratio within
 * 3:1), so there the panorama stays 2:1 the whole way through and the only
 * resampling is a clean uniform scale.
 */
export const MODEL_TARGETS: Record<
  PhotorealProvider,
  { width: number; height: number; aspectRatio?: string; imageSize?: string; size?: string; native: boolean }
> = {
  gemini: { width: 4096, height: 1755, aspectRatio: '21:9', imageSize: '4K', native: false },
  openai: { width: 3840, height: 1920, size: '3840x1920', native: true },
};

export const PROVIDER_LABELS: Record<PhotorealProvider, string> = {
  gemini: 'Gemini 3 Pro Image (4K, squashed to 21:9)',
  openai: 'OpenAI gpt-image-2 (native 2:1, 3840×1920)',
};

export interface TourStyle {
  /** e.g. "scandinavian apartment" */
  interior: string;
  /** e.g. "soft natural daylight from the windows" */
  lighting: string;
  /** Free-text steer from the user. */
  extra?: string;
}

export const INTERIOR_STYLES = [
  'modern scandinavian apartment',
  'warm mid-century modern',
  'minimalist japandi',
  'industrial loft',
  'classic parisian apartment',
  'cosy rustic cottage',
  'luxury contemporary penthouse',
];

export const LIGHTING_STYLES = [
  'soft natural daylight from the windows',
  'warm late-afternoon sun',
  'golden hour with long shadows',
  'overcast diffuse daylight',
  'evening with warm lamplight',
];

/**
 * The prompt carries three jobs: state the projection (so the model does not
 * "fix" the panorama into a normal photo), pin the geometry (so the plan is
 * still the plan), and fix the look (so room two matches room one).
 */
export function buildPanoramaPrompt(
  style: TourStyle,
  roomName: string,
  hasReference: boolean,
  squashed = true,
): string {
  const lines = [
    squashed
      ? 'This image is a 360° equirectangular panorama of a room interior, vertically compressed to a 21:9 frame.'
      : 'This image is a 360° equirectangular panorama of a room interior, in its true 2:1 proportions.',
    'Redraw it as a photorealistic architectural interior photograph, keeping the equirectangular projection exactly intact.',
    '',
    'STRICT — do not change:',
    '- the room shape, wall positions, ceiling height, door and window openings',
    '- the position, size, orientation and type of every piece of furniture',
    '- the viewpoint: the camera stays exactly where it is, at standing eye height',
    '- the equirectangular layout: horizon along the middle row, the ceiling stretched across the top edge, the floor across the bottom edge',
    '- the left and right edges must remain continuous, because they are the same seam of the sphere',
    '',
    'CHANGE — make everything read as a real photograph:',
    `- ${style.interior} interior design, with real materials: wood grain, woven fabric, brushed metal, matte plaster, glass`,
    `- ${style.lighting}, with soft realistic shadows, bounced light and subtle reflections`,
    '- realistic camera qualities: natural colour, gentle depth, fine surface detail',
    '- replace the low-poly placeholder furniture with photorealistic furniture of the same type, footprint and placement',
    '',
    'Never add text, watermarks, logos, people or animals. Never add or remove rooms, walls, doors or windows.',
  ];

  if (hasReference) {
    // Identified by content, not by position: the two providers disagree about
    // which end of the list the subject goes on, and a prompt that says "the
    // first image" silently edits the wrong one when that order flips.
    lines.push(
      '',
      'You have been given a second image: an already-photorealistic panorama of another room in the SAME apartment. It is a finished reference, not something to edit. Match its materials, floor, wall colour, trim, lighting temperature and photographic style precisely, so the two rooms look like one home photographed on one day. Edit only the flat-shaded 3D panorama.',
    );
  }
  if (roomName) lines.push('', `This room is the ${roomName.toLowerCase()}. Furnish and dress it accordingly.`);
  if (style.extra?.trim()) lines.push('', `Additional direction: ${style.extra.trim()}`);

  return lines.join('\n');
}

export interface GenerateOptions {
  style: TourStyle;
  roomName: string;
  /** A previously generated panorama data URL, for cross-room consistency. */
  reference?: string;
  /** User-supplied key, when the server has none configured. */
  apiKey?: string;
  model?: string;
  provider?: PhotorealProvider;
  signal?: AbortSignal;
}

export interface ProviderStatus {
  configured: boolean;
  providers: Record<PhotorealProvider, boolean>;
  default: PhotorealProvider | null;
}

/** Which providers the server holds a key for, so the UI can say so up front. */
export async function getProviderStatus(): Promise<ProviderStatus> {
  try {
    const response = await fetch('/api/photoreal');
    if (!response.ok) throw new Error(String(response.status));
    return (await response.json()) as ProviderStatus;
  } catch {
    return { configured: false, providers: { gemini: false, openai: false }, default: null };
  }
}

/**
 * Send one equirectangular capture through the image model.
 * Returns a 2:1 data URL ready to map onto the tour sphere.
 */
export async function generatePhotorealPanorama(
  source: HTMLCanvasElement,
  options: GenerateOptions,
): Promise<string> {
  const provider: PhotorealProvider = options.provider ?? 'gemini';
  const target = MODEL_TARGETS[provider];
  const sent = resizeCanvas(source, target.width, target.height);
  const prompt = buildPanoramaPrompt(options.style, options.roomName, !!options.reference, !target.native);

  const response = await fetch('/api/photoreal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      image: sent.toDataURL('image/jpeg', 0.92),
      reference: options.reference,
      prompt,
      provider,
      model: options.model,
      aspectRatio: target.aspectRatio,
      imageSize: target.imageSize,
      size: target.size,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data?.error === 'unconfigured') {
      const envVar = provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
      throw new Error(`No ${provider} API key. Add one in Settings → AI, or set ${envVar} on the server.`);
    }
    throw new Error(data?.error || `Generation failed (HTTP ${response.status}).`);
  }
  if (!data?.image) throw new Error('The model returned no image.');

  const returned = await loadImageToCanvas(data.image);
  const restored = resizeCanvas(returned, PANORAMA_WIDTH, PANORAMA_HEIGHT);
  blendPanoramaSeam(restored);
  return restored.toDataURL('image/jpeg', 0.9);
}

/**
 * Panoramas are ~1MB each and a tour has one per room, so they go to IndexedDB
 * alongside the generated GLBs rather than into the localStorage project JSON.
 */
export async function cachePanorama(projectId: string, viewpointId: string, dataUrl: string): Promise<string> {
  return putDataUrl(`pano:${projectId}:${viewpointId}`, dataUrl);
}

export async function loadCachedPanorama(ref: string): Promise<string | null> {
  return resolveAssetUrl(ref);
}
