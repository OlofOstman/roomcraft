'use client';

import { useState } from 'react';
import { STARTER_CATALOG } from '@/lib/catalog';
import { polygonCentroid, worldPolygon } from '@/lib/roomGeometry';
import { usePlannerStore } from '@/lib/store';
import type { CatalogItem } from '@/lib/types';
import AddByLink from './AddByLink';

export default function LibraryPanel() {
  const design = usePlannerStore((s) => s.designs.find((d) => d.id === s.activeDesignId) ?? null);
  const placeItem = usePlannerStore((s) => s.placeItem);
  const addRoom = usePlannerStore((s) => s.addRoom);
  const selection = usePlannerStore((s) => s.selection);
  const setSelection = usePlannerStore((s) => s.setSelection);

  const [roomW, setRoomW] = useState('400');
  const [roomD, setRoomD] = useState('300');

  if (!design) return null;

  const place = (item: CatalogItem) => {
    const targetRoom =
      (selection.kind === 'room' && design.rooms.find((r) => r.id === selection.id)) ||
      design.rooms[0];
    if (!targetRoom) return;
    const center = polygonCentroid(worldPolygon(targetRoom));
    placeItem(item.id, targetRoom.id, center);
    setSelection({ kind: 'none' });
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Rooms</h2>
        <form
          className="mt-2 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const w = parseFloat(roomW);
            const d = parseFloat(roomD);
            if (w > 0 && d > 0) addRoom(w, d);
          }}
        >
          <label className="flex-1 text-xs text-neutral-500">
            Width (cm)
            <input
              className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              value={roomW}
              onChange={(e) => setRoomW(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="flex-1 text-xs text-neutral-500">
            Depth (cm)
            <input
              className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              value={roomD}
              onChange={(e) => setRoomD(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700"
          >
            Add
          </button>
        </form>
        <p className="mt-1.5 text-[11px] leading-4 text-neutral-400">
          Rooms start rectangular — drag corners to reshape, double-click a wall to add a corner,
          drag rooms together to snap walls.
        </p>
      </section>

      <AddByLink />

      {design.linkedCatalog.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            From the web
          </h2>
          <ul className="mt-2 space-y-1">
            {design.linkedCatalog.map((item) => (
              <LibraryRow key={item.id} item={item} onPlace={place} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Starter furniture
        </h2>
        <ul className="mt-2 space-y-1">
          {STARTER_CATALOG.map((item) => (
            <LibraryRow key={item.id} item={item} onPlace={place} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function LibraryRow({ item, onPlace }: { item: CatalogItem; onPlace: (i: CatalogItem) => void }) {
  return (
    <li>
      <button
        className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 px-2 py-1.5 text-left hover:border-neutral-400 hover:bg-neutral-50"
        onClick={() => onPlace(item)}
        title="Add to room"
      >
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt="" className="h-8 w-8 rounded object-cover" />
        ) : (
          <span
            className="inline-block h-8 w-8 shrink-0 rounded"
            style={{ backgroundColor: item.color ?? '#d4d4d4' }}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{item.name}</span>
          <span className="block text-[11px] text-neutral-400">
            {item.dims.w}×{item.dims.d}×{item.dims.h} cm
            {item.price ? ` · ${item.price}` : ''}
          </span>
        </span>
        <span className="text-neutral-300">+</span>
      </button>
    </li>
  );
}
