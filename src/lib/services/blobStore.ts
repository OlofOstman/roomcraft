/**
 * Binary asset store backed by IndexedDB.
 *
 * Project JSON lives in localStorage, which caps out around 5–10 MB. Item
 * photos are small once downscaled, but generated GLB models run 1–5 MB each,
 * so a furnished apartment would blow the quota — and the localStorage handler
 * deals with that by deleting the user's *other* projects. Blobs therefore go
 * here instead, and the project stores only an `idb:<key>` reference.
 */

const DB_NAME = 'roomcraft_assets';
const DB_VERSION = 1;
const STORE = 'blobs';

/** Marks a value as a key into this store rather than a usable URL. */
export const IDB_PREFIX = 'idb:';

export function isBlobRef(url: string | undefined): boolean {
  return !!url && url.startsWith(IDB_PREFIX);
}

export function blobRef(key: string): string {
  return `${IDB_PREFIX}${key}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
      }),
  );
}

/** Store a blob and return the `idb:` reference to put on the project. */
export async function putBlob(key: string, blob: Blob): Promise<string> {
  await tx('readwrite', (s) => s.put(blob, key));
  return blobRef(key);
}

/** Store a data URL as a blob, avoiding a second copy of the base64 string. */
export async function putDataUrl(key: string, dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  return putBlob(key, blob);
}

export async function deleteBlob(ref: string): Promise<void> {
  const key = isBlobRef(ref) ? ref.slice(IDB_PREFIX.length) : ref;
  await tx('readwrite', (s) => s.delete(key)).catch(() => {});
  const cached = urlCache.get(key);
  if (cached) {
    URL.revokeObjectURL(cached);
    urlCache.delete(key);
  }
}

// Object URLs are cached so repeated renders don't leak a new URL per frame.
const urlCache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/**
 * Resolve a stored value to something the DOM or GLTFLoader can use.
 * Plain URLs and data URLs pass through untouched, so callers can hand us
 * whatever the project happens to hold.
 */
export function resolveAssetUrl(url: string | undefined): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  if (!isBlobRef(url)) return Promise.resolve(url);

  const key = url.slice(IDB_PREFIX.length);
  const cached = urlCache.get(key);
  if (cached) return Promise.resolve(cached);

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const p = tx<Blob | undefined>('readonly', (s) => s.get(key))
    .then((blob) => {
      pending.delete(key);
      if (!blob) return null;
      const objectUrl = URL.createObjectURL(blob);
      urlCache.set(key, objectUrl);
      return objectUrl;
    })
    .catch(() => {
      pending.delete(key);
      return null;
    });

  pending.set(key, p);
  return p;
}
