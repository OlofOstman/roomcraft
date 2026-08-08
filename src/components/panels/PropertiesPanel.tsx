'use client';

import { findCatalogItem } from '@/lib/catalog';
import { polygonArea } from '@/lib/roomGeometry';
import { usePlannerStore } from '@/lib/store';

export default function PropertiesPanel() {
  const design = usePlannerStore((s) => s.designs.find((d) => d.id === s.activeDesignId) ?? null);
  const selection = usePlannerStore((s) => s.selection);
  const setSelection = usePlannerStore((s) => s.setSelection);
  const updateRoom = usePlannerStore((s) => s.updateRoom);
  const deleteRoom = usePlannerStore((s) => s.deleteRoom);
  const updateItem = usePlannerStore((s) => s.updateItem);
  const deleteItem = usePlannerStore((s) => s.deleteItem);

  if (!design || selection.kind === 'none') return null;

  if (selection.kind === 'room') {
    const room = design.rooms.find((r) => r.id === selection.id);
    if (!room) return null;
    const isRectangle = room.polygon.length === 4;
    const width = isRectangle ? Math.abs(room.polygon[1].x - room.polygon[0].x) : null;
    const depth = isRectangle ? Math.abs(room.polygon[2].y - room.polygon[1].y) : null;

    return (
      <aside className="w-64 shrink-0 overflow-y-auto border-l border-neutral-300 bg-white p-4">
        <h2 className="text-sm font-semibold">Room</h2>
        <label className="mt-3 block text-xs text-neutral-500">
          Name
          <input
            className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            value={room.name}
            onChange={(e) => updateRoom(room.id, { name: e.target.value })}
          />
        </label>

        {isRectangle && width !== null && depth !== null && (
          <div className="mt-3 flex gap-2">
            <label className="flex-1 text-xs text-neutral-500">
              Width (cm)
              <input
                className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                value={width}
                inputMode="numeric"
                onChange={(e) => {
                  const w = parseFloat(e.target.value);
                  if (!(w > 0)) return;
                  updateRoom(room.id, {
                    polygon: [
                      { x: 0, y: 0 },
                      { x: w, y: 0 },
                      { x: w, y: depth },
                      { x: 0, y: depth },
                    ],
                  });
                }}
              />
            </label>
            <label className="flex-1 text-xs text-neutral-500">
              Depth (cm)
              <input
                className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                value={depth}
                inputMode="numeric"
                onChange={(e) => {
                  const d = parseFloat(e.target.value);
                  if (!(d > 0)) return;
                  updateRoom(room.id, {
                    polygon: [
                      { x: 0, y: 0 },
                      { x: width, y: 0 },
                      { x: width, y: d },
                      { x: 0, y: d },
                    ],
                  });
                }}
              />
            </label>
          </div>
        )}

        <label className="mt-3 block text-xs text-neutral-500">
          Wall height (cm)
          <input
            className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            value={room.wallHeight}
            inputMode="numeric"
            onChange={(e) => {
              const h = parseFloat(e.target.value);
              if (h > 0) updateRoom(room.id, { wallHeight: h });
            }}
          />
        </label>

        <div className="mt-3 flex gap-2">
          <label className="flex-1 text-xs text-neutral-500">
            Floor
            <input
              type="color"
              className="mt-0.5 h-8 w-full cursor-pointer rounded border border-neutral-300"
              value={room.floorColor}
              onChange={(e) => updateRoom(room.id, { floorColor: e.target.value })}
            />
          </label>
          <label className="flex-1 text-xs text-neutral-500">
            Walls
            <input
              type="color"
              className="mt-0.5 h-8 w-full cursor-pointer rounded border border-neutral-300"
              value={room.wallColor}
              onChange={(e) => updateRoom(room.id, { wallColor: e.target.value })}
            />
          </label>
        </div>

        <p className="mt-3 text-xs text-neutral-400">
          {room.polygon.length} corners · {(polygonArea(room.polygon) / 10000).toFixed(1)} m²
        </p>

        <button
          className="mt-4 w-full rounded border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          onClick={() => {
            if (confirm(`Delete ${room.name} and its furniture?`)) {
              deleteRoom(room.id);
              setSelection({ kind: 'none' });
            }
          }}
        >
          Delete room
        </button>
      </aside>
    );
  }

  const item = design.items.find((i) => i.id === selection.id);
  if (!item) return null;
  const cat = findCatalogItem(design, item.catalogItemId);
  if (!cat) return null;

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-l border-neutral-300 bg-white p-4">
      <h2 className="text-sm font-semibold">{cat.name}</h2>
      {cat.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cat.image} alt="" className="mt-2 w-full rounded-lg object-cover" />
      )}
      <p className="mt-2 text-xs text-neutral-500">
        {cat.dims.w} × {cat.dims.d} × {cat.dims.h} cm
        {cat.price ? ` · ${cat.price}` : ''}
      </p>
      {cat.sourceUrl && (
        <a
          className="mt-1 block truncate text-xs text-blue-600 hover:underline"
          href={cat.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          View product page ↗
        </a>
      )}

      <label className="mt-3 block text-xs text-neutral-500">
        Rotation (°)
        <input
          className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          value={Math.round(item.rotationDeg)}
          inputMode="numeric"
          onChange={(e) => {
            const r = parseFloat(e.target.value);
            if (!Number.isNaN(r)) updateItem(item.id, { rotationDeg: r });
          }}
        />
      </label>

      <button
        className="mt-4 w-full rounded border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        onClick={() => {
          deleteItem(item.id);
          setSelection({ kind: 'none' });
        }}
      >
        Remove from room
      </button>
    </aside>
  );
}
