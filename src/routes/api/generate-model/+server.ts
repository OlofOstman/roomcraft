import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

/**
 * Image → 3D model via the Tripo API (https://platform.tripo3d.ai).
 *
 * POST { image: "<data URL>" }         → { taskId }
 * GET  ?taskId=...                     → { status, progress, modelUrl? }
 *
 * The server proxies both calls so TRIPO_API_KEY never reaches the browser.
 * Generation runs 30s–3min; the client polls and keeps the sized-box
 * placeholder until the GLB is ready. Without a key the endpoint reports
 * 'unconfigured' and the UI simply doesn't offer generation.
 */

const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';

export const POST: RequestHandler = async ({ request }) => {
  const key = env.TRIPO_API_KEY;
  if (!key) return json({ error: 'unconfigured' }, { status: 503 });

  let image: string;
  try {
    ({ image } = await request.json());
    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(image)) throw new Error('bad image');
  } catch {
    return json({ error: 'Send { image: "<data URL>" }.' }, { status: 400 });
  }

  try {
    return await startGeneration(key, image);
  } catch (err) {
    console.error('Tripo generation failed:', err);
    return json(
      { error: `Could not reach the 3D generation service (${err instanceof Error ? err.message : 'unknown'}).` },
      { status: 502 },
    );
  }
};

async function startGeneration(key: string, image: string): Promise<Response> {
  // 1. Upload the image, receiving a file token.
  const [meta, b64] = image.split(',', 2);
  const mime = meta.slice(5, meta.indexOf(';'));
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), `item.${mime.split('/')[1]}`);

  const uploadRes = await fetch(`${TRIPO_BASE}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  if (!uploadRes.ok) {
    return json({ error: `Upload failed (HTTP ${uploadRes.status}).` }, { status: 502 });
  }
  const upload = await uploadRes.json();
  const fileToken = upload?.data?.image_token;
  if (!fileToken) return json({ error: 'Upload gave no image token.' }, { status: 502 });

  // 2. Start the image-to-model task.
  const taskRes = await fetch(`${TRIPO_BASE}/task`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'image_to_model',
      file: { type: mime.split('/')[1], file_token: fileToken },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!taskRes.ok) {
    return json({ error: `Task start failed (HTTP ${taskRes.status}).` }, { status: 502 });
  }
  const task = await taskRes.json();
  const taskId = task?.data?.task_id;
  if (!taskId) return json({ error: 'Task start gave no task id.' }, { status: 502 });

  return json({ taskId });
}

export const GET: RequestHandler = async ({ url }) => {
  const key = env.TRIPO_API_KEY;
  if (!key) return json({ error: 'unconfigured' }, { status: 503 });

  const taskId = url.searchParams.get('taskId');
  if (!taskId || !/^[\w-]+$/.test(taskId)) {
    return json({ error: 'Pass ?taskId=...' }, { status: 400 });
  }

  try {
    return await checkTask(key, taskId, url.searchParams.get('download') === '1');
  } catch (err) {
    console.error('Tripo status check failed:', err);
    return json(
      { error: `Could not reach the 3D generation service (${err instanceof Error ? err.message : 'unknown'}).` },
      { status: 502 },
    );
  }
};

async function checkTask(key: string, taskId: string, download: boolean): Promise<Response> {
  const res = await fetch(`${TRIPO_BASE}/task/${taskId}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return json({ error: `Status check failed (HTTP ${res.status}).` }, { status: 502 });

  const data = (await res.json())?.data;
  const status: string = data?.status ?? 'unknown';
  const progress: number = data?.progress ?? 0;
  // Different Tripo versions have exposed the GLB under different keys.
  const modelUrl: string | undefined =
    data?.result?.pbr_model?.url ?? data?.result?.model?.url ?? data?.output?.pbr_model ?? data?.output?.model;

  // ?download=1 streams the finished GLB through us: the model lives on
  // Tripo's CDN, which the browser can't necessarily fetch cross-origin.
  if (download) {
    if (status !== 'success' || !modelUrl) {
      return json({ error: 'Model not ready.' }, { status: 409 });
    }
    const glb = await fetch(modelUrl, { signal: AbortSignal.timeout(120000) });
    if (!glb.ok || !glb.body) {
      return json({ error: `Model download failed (HTTP ${glb.status}).` }, { status: 502 });
    }
    return new Response(glb.body, {
      headers: { 'Content-Type': 'model/gltf-binary' },
    });
  }

  return json({ status, progress, ...(status === 'success' && modelUrl ? { modelUrl } : {}) });
}
