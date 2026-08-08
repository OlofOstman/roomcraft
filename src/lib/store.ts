import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CatalogItem, Design, PlacedItem, Pt, Room } from './types';
import { newId } from './types';

export type Selection =
  | { kind: 'none' }
  | { kind: 'room'; id: string }
  | { kind: 'item'; id: string };

export type ViewMode = '2d' | '3d';

const ROOM_COLORS = ['#e8ddca', '#dde5e0', '#e5dde3', '#dee1ea', '#eae4d8'];

export function makeRoom(name: string, widthCm: number, depthCm: number, index: number): Room {
  return {
    id: newId('room'),
    name,
    polygon: [
      { x: 0, y: 0 },
      { x: widthCm, y: 0 },
      { x: widthCm, y: depthCm },
      { x: 0, y: depthCm },
    ],
    origin: { x: 60 + index * 40, y: 60 + index * 40 },
    wallHeight: 240,
    wallThickness: 10,
    floorColor: '#c8a97c',
    wallColor: ROOM_COLORS[index % ROOM_COLORS.length],
    openings: [],
  };
}

export function makeDesign(name: string): Design {
  return {
    id: newId('design'),
    name,
    units: 'cm',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    rooms: [makeRoom('Room 1', 400, 300, 0)],
    items: [],
    linkedCatalog: [],
  };
}

interface PlannerState {
  designs: Design[];
  activeDesignId: string | null;
  selection: Selection;
  viewMode: ViewMode;

  activeDesign: () => Design | null;
  newDesign: (name: string) => void;
  openDesign: (id: string) => void;
  deleteDesign: (id: string) => void;
  renameDesign: (name: string) => void;

  addRoom: (widthCm: number, depthCm: number) => void;
  updateRoom: (id: string, patch: Partial<Room>) => void;
  moveRoom: (id: string, origin: Pt) => void;
  deleteRoom: (id: string) => void;

  addLinkedCatalogItem: (item: CatalogItem) => void;
  placeItem: (catalogItemId: string, roomId: string, position: Pt) => void;
  updateItem: (id: string, patch: Partial<PlacedItem>) => void;
  deleteItem: (id: string) => void;

  setSelection: (sel: Selection) => void;
  setViewMode: (mode: ViewMode) => void;
}

function mutateActive(state: PlannerState, fn: (d: Design) => Design): Partial<PlannerState> {
  return {
    designs: state.designs.map((d) =>
      d.id === state.activeDesignId ? { ...fn(d), updatedAt: Date.now() } : d,
    ),
  };
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set, get) => ({
      designs: [],
      activeDesignId: null,
      selection: { kind: 'none' },
      viewMode: '2d',

      activeDesign: () => {
        const { designs, activeDesignId } = get();
        return designs.find((d) => d.id === activeDesignId) ?? null;
      },

      newDesign: (name) =>
        set((s) => {
          const d = makeDesign(name);
          return {
            designs: [...s.designs, d],
            activeDesignId: d.id,
            selection: { kind: 'none' },
            viewMode: '2d',
          };
        }),

      openDesign: (id) => set({ activeDesignId: id, selection: { kind: 'none' } }),

      deleteDesign: (id) =>
        set((s) => ({
          designs: s.designs.filter((d) => d.id !== id),
          activeDesignId: s.activeDesignId === id ? null : s.activeDesignId,
        })),

      renameDesign: (name) => set((s) => mutateActive(s, (d) => ({ ...d, name }))),

      addRoom: (widthCm, depthCm) =>
        set((s) =>
          mutateActive(s, (d) => ({
            ...d,
            rooms: [...d.rooms, makeRoom(`Room ${d.rooms.length + 1}`, widthCm, depthCm, d.rooms.length)],
          })),
        ),

      updateRoom: (id, patch) =>
        set((s) =>
          mutateActive(s, (d) => ({
            ...d,
            rooms: d.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
          })),
        ),

      moveRoom: (id, origin) => get().updateRoom(id, { origin }),

      deleteRoom: (id) =>
        set((s) =>
          mutateActive(s, (d) => ({
            ...d,
            rooms: d.rooms.filter((r) => r.id !== id),
            items: d.items.filter((i) => i.roomId !== id),
          })),
        ),

      addLinkedCatalogItem: (item) =>
        set((s) => mutateActive(s, (d) => ({ ...d, linkedCatalog: [...d.linkedCatalog, item] }))),

      placeItem: (catalogItemId, roomId, position) =>
        set((s) =>
          mutateActive(s, (d) => ({
            ...d,
            items: [
              ...d.items,
              { id: newId('item'), catalogItemId, roomId, position, rotationDeg: 0 },
            ],
          })),
        ),

      updateItem: (id, patch) =>
        set((s) =>
          mutateActive(s, (d) => ({
            ...d,
            items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
          })),
        ),

      deleteItem: (id) =>
        set((s) =>
          mutateActive(s, (d) => ({ ...d, items: d.items.filter((i) => i.id !== id) })),
        ),

      setSelection: (selection) => set({ selection }),
      setViewMode: (viewMode) => set({ viewMode }),
    }),
    {
      name: 'roomcraft-designs',
      partialize: (s) => ({ designs: s.designs, activeDesignId: s.activeDesignId }),
    },
  ),
);
