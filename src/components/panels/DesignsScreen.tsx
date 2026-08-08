'use client';

import { useState } from 'react';
import { usePlannerStore } from '@/lib/store';

export default function DesignsScreen() {
  const designs = usePlannerStore((s) => s.designs);
  const newDesign = usePlannerStore((s) => s.newDesign);
  const openDesign = usePlannerStore((s) => s.openDesign);
  const deleteDesign = usePlannerStore((s) => s.deleteDesign);
  const [name, setName] = useState('');

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100">
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Roomcraft</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Plan your rooms with real measurements and furniture from anywhere on the web.
        </p>

        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            newDesign(name.trim() || 'My apartment');
            setName('');
          }}
        >
          <input
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            placeholder="Name your design (e.g. Our apartment)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            New design
          </button>
        </form>

        {designs.length > 0 && (
          <ul className="mt-6 divide-y divide-neutral-100">
            {designs.map((d) => (
              <li key={d.id} className="flex items-center gap-2 py-2">
                <button
                  className="flex-1 rounded px-2 py-1 text-left hover:bg-neutral-50"
                  onClick={() => openDesign(d.id)}
                >
                  <span className="font-medium">{d.name}</span>
                  <span className="ml-2 text-xs text-neutral-400">
                    {d.rooms.length} room{d.rooms.length === 1 ? '' : 's'} · {d.items.length} item
                    {d.items.length === 1 ? '' : 's'} · {new Date(d.updatedAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-600"
                  onClick={() => {
                    if (confirm(`Delete "${d.name}"?`)) deleteDesign(d.id);
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
