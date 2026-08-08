'use client';

import { useState } from 'react';
import { usePlannerStore } from '@/lib/store';
import type { ExtractResult, FurnitureCategory } from '@/lib/types';
import { newId } from '@/lib/types';

const CATEGORIES: FurnitureCategory[] = [
  'bed', 'sofa', 'armchair', 'chair', 'table', 'desk', 'wardrobe',
  'bookshelf', 'dresser', 'tv-bench', 'rug', 'lamp', 'plant', 'other',
];

/**
 * Paste a product URL → /api/extract pulls name/image/price/dims →
 * the user confirms or corrects the dimensions before the item is added.
 */
export default function AddByLink() {
  const addLinkedCatalogItem = usePlannerStore((s) => s.addLinkedCatalogItem);

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExtractResult | null>(null);
  const [form, setForm] = useState({ name: '', w: '', d: '', h: '', category: 'other' as FurnitureCategory });

  const extract = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data: ExtractResult = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Extraction failed');
      setDraft(data);
      setForm({
        name: data.name ?? '',
        w: data.dims?.w != null ? String(data.dims.w) : '',
        d: data.dims?.d != null ? String(data.dims.d) : '',
        h: data.dims?.h != null ? String(data.dims.h) : '',
        category: data.category ?? 'other',
      });
      if (data.error) setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const confirm = () => {
    const w = parseFloat(form.w);
    const d = parseFloat(form.d);
    const h = parseFloat(form.h);
    if (!(w > 0) || !(d > 0) || !(h > 0)) {
      setError('Please fill in all three dimensions (cm).');
      return;
    }
    addLinkedCatalogItem({
      id: newId('cat'),
      name: form.name.trim() || 'Unnamed item',
      category: form.category,
      dims: { w, d, h },
      image: draft?.image,
      price: draft?.price,
      sourceUrl: draft?.sourceUrl,
      source: 'link',
      color: '#a8b8c8',
    });
    setDraft(null);
    setUrl('');
    setError(null);
  };

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Add from a website
      </h2>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) extract();
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Paste a product URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? '…' : 'Fetch'}
        </button>
      </form>

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      {draft && (
        <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
          <div className="flex items-center gap-2">
            {draft.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.image} alt="" className="h-12 w-12 rounded object-cover" />
            )}
            <input
              className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">
            {draft.dimsSource === 'none'
              ? 'No dimensions found on the page — enter them from the product specs:'
              : `Check the dimensions (found via ${draft.dimsSource === 'llm' ? 'AI reading the page' : 'the page data'}):`}
          </p>
          <div className="mt-1 flex gap-2">
            {(['w', 'd', 'h'] as const).map((k) => (
              <label key={k} className="flex-1 text-[11px] text-neutral-500">
                {k === 'w' ? 'Width' : k === 'd' ? 'Depth' : 'Height'}
                <input
                  className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-sm"
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  inputMode="decimal"
                  placeholder="cm"
                />
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select
              className="flex-1 rounded border border-neutral-300 px-1.5 py-1 text-sm"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as FurnitureCategory })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500"
              onClick={confirm}
            >
              Add to library
            </button>
            <button
              className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100"
              onClick={() => setDraft(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
