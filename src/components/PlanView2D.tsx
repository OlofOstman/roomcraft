'use client';

import Konva from 'konva';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import { findCatalogItem } from '@/lib/catalog';
import {
  add,
  convexPolygonsOverlap,
  findSnapDelta,
  footprintCorners,
  footprintInsidePolygon,
  midpoint,
  pointInPolygon,
  polygonCentroid,
  formatCm,
  worldPolygon,
  wallSegments,
} from '@/lib/roomGeometry';
import { usePlannerStore } from '@/lib/store';
import type { PlacedItem, Pt, Room } from '@/lib/types';

const GRID = 50; // cm

export default function PlanView2D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  const design = usePlannerStore((s) => s.designs.find((d) => d.id === s.activeDesignId) ?? null);
  const selection = usePlannerStore((s) => s.selection);
  const setSelection = usePlannerStore((s) => s.setSelection);
  const deleteItem = usePlannerStore((s) => s.deleteItem);

  const [view, setView] = useState({ x: 40, y: 40, scale: 0.9 });

  // Delete key removes the selected furniture item.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (selection.kind === 'item') {
        deleteItem(selection.id);
        setSelection({ kind: 'none' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, deleteItem, setSelection]);

  if (!design) return null;

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const oldScale = view.scale;
    const factor = e.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
    const scale = Math.min(4, Math.max(0.15, oldScale * factor));
    setView({
      scale,
      x: pointer.x - ((pointer.x - view.x) / oldScale) * scale,
      y: pointer.y - ((pointer.y - view.y) / oldScale) * scale,
    });
  };

  return (
    <div ref={containerRef} className="absolute inset-0 bg-neutral-200">
      <Stage
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable
        onWheel={handleWheel}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }
        }}
        onMouseDown={(e) => {
          if (e.target === e.target.getStage()) setSelection({ kind: 'none' });
        }}
      >
        <Layer listening={false}>
          <GridLayer size={size} view={view} />
        </Layer>
        <Layer>
          {design.rooms.map((room) => (
            <RoomShape key={room.id} room={room} />
          ))}
          {design.items.map((item) => (
            <FurnitureShape key={item.id} item={item} />
          ))}
        </Layer>
      </Stage>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-xs text-neutral-500">
        Scroll to zoom · drag background to pan · grid {GRID} cm
      </div>
    </div>
  );
}

function GridLayer({ size, view }: { size: { width: number; height: number }; view: { x: number; y: number; scale: number } }) {
  const lines = [];
  const x0 = -view.x / view.scale;
  const y0 = -view.y / view.scale;
  const x1 = x0 + size.width / view.scale;
  const y1 = y0 + size.height / view.scale;
  for (let x = Math.floor(x0 / GRID) * GRID; x <= x1; x += GRID) {
    lines.push(<Line key={`v${x}`} points={[x, y0, x, y1]} stroke="#d4d4d4" strokeWidth={1 / view.scale} />);
  }
  for (let y = Math.floor(y0 / GRID) * GRID; y <= y1; y += GRID) {
    lines.push(<Line key={`h${y}`} points={[x0, y, x1, y]} stroke="#d4d4d4" strokeWidth={1 / view.scale} />);
  }
  return <>{lines}</>;
}

function RoomShape({ room }: { room: Room }) {
  const design = usePlannerStore((s) => s.designs.find((d) => d.id === s.activeDesignId) ?? null);
  const selection = usePlannerStore((s) => s.selection);
  const setSelection = usePlannerStore((s) => s.setSelection);
  const moveRoom = usePlannerStore((s) => s.moveRoom);
  const updateRoom = usePlannerStore((s) => s.updateRoom);

  const selected = selection.kind === 'room' && selection.id === room.id;
  const flatPoints = room.polygon.flatMap((p) => [p.x, p.y]);
  const segs = wallSegments(room.polygon);
  const centroid = polygonCentroid(room.polygon);

  const otherWorldPolys = useMemo(
    () => (design ? design.rooms.filter((r) => r.id !== room.id).map(worldPolygon) : []),
    [design, room.id],
  );

  const applySnap = (node: Konva.Node) => {
    const origin = { x: node.x(), y: node.y() };
    const poly = room.polygon.map((p) => add(p, origin));
    const { delta } = findSnapDelta(poly, otherWorldPolys, 12);
    node.position({ x: origin.x + delta.x, y: origin.y + delta.y });
  };

  /** Double-click a wall to insert a corner there (for L-shapes / angled walls). */
  const insertVertex = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    const pointer = stage?.getRelativePointerPosition();
    if (!pointer) return;
    const local = { x: pointer.x - room.origin.x, y: pointer.y - room.origin.y };
    let best = { index: 0, dist: Infinity, pt: local };
    for (const s of segs) {
      const proj = projectOnSegment(local, s.a, s.b);
      const d = Math.hypot(proj.x - local.x, proj.y - local.y);
      if (d < best.dist) best = { index: s.index, dist: d, pt: proj };
    }
    if (best.dist > 30) return;
    const polygon = [...room.polygon];
    polygon.splice(best.index + 1, 0, { x: Math.round(best.pt.x), y: Math.round(best.pt.y) });
    updateRoom(room.id, { polygon });
  };

  return (
    <Group
      x={room.origin.x}
      y={room.origin.y}
      draggable
      onDragMove={(e) => applySnap(e.target)}
      onDragEnd={(e) => moveRoom(room.id, { x: e.target.x(), y: e.target.y() })}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        setSelection({ kind: 'room', id: room.id });
      }}
      onDblClick={insertVertex}
    >
      <Line
        points={flatPoints}
        closed
        fill={room.floorColor}
        stroke={selected ? '#2563eb' : '#404040'}
        strokeWidth={selected ? room.wallThickness + 2 : room.wallThickness}
      />
      <Text
        text={room.name}
        x={centroid.x - 60}
        y={centroid.y - 8}
        width={120}
        align="center"
        fontSize={14}
        fill="#00000055"
        listening={false}
      />
      {segs.map((s) => {
        const mid = midpoint(s.a, s.b);
        // Nudge the label off the wall, toward the room interior.
        const toCenter = { x: centroid.x - mid.x, y: centroid.y - mid.y };
        const norm = Math.hypot(toCenter.x, toCenter.y) || 1;
        const offset = 16 + room.wallThickness;
        const lx = mid.x + (toCenter.x / norm) * offset;
        const ly = mid.y + (toCenter.y / norm) * offset;
        return (
          <Text
            key={s.index}
            text={formatCm(s.length)}
            x={lx - 30}
            y={ly - 7}
            width={60}
            align="center"
            fontSize={11}
            fill="#1e3a8a"
            listening={false}
          />
        );
      })}
      {selected &&
        room.polygon.map((p, i) => (
          <Circle
            key={i}
            x={p.x}
            y={p.y}
            radius={6}
            fill="#2563eb"
            stroke="#fff"
            strokeWidth={1.5}
            draggable
            onDragMove={(e) => {
              const polygon = room.polygon.map((pt, j) =>
                j === i ? { x: Math.round(e.target.x()), y: Math.round(e.target.y()) } : pt,
              );
              updateRoom(room.id, { polygon });
            }}
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
          />
        ))}
    </Group>
  );
}

function projectOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return { x: a.x + t * abx, y: a.y + t * aby };
}

function FurnitureShape({ item }: { item: PlacedItem }) {
  const design = usePlannerStore((s) => s.designs.find((d) => d.id === s.activeDesignId) ?? null);
  const selection = usePlannerStore((s) => s.selection);
  const setSelection = usePlannerStore((s) => s.setSelection);
  const updateItem = usePlannerStore((s) => s.updateItem);

  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const selected = selection.kind === 'item' && selection.id === item.id;

  useEffect(() => {
    if (selected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
    }
  }, [selected]);

  const catalogItem = findCatalogItem(design, item.catalogItemId);
  const invalid = useMemo(() => {
    if (!design || !catalogItem) return false;
    if (catalogItem.category === 'rug') return false;
    const corners = footprintCorners(item.position, catalogItem.dims, item.rotationDeg);
    const room = design.rooms.find((r) => r.id === item.roomId);
    if (room && !footprintInsidePolygon(corners, worldPolygon(room))) return true;
    return design.items.some((other) => {
      if (other.id === item.id) return false;
      const otherCat = findCatalogItem(design, other.catalogItemId);
      if (!otherCat || otherCat.category === 'rug') return false;
      return convexPolygonsOverlap(
        corners,
        footprintCorners(other.position, otherCat.dims, other.rotationDeg),
      );
    });
  }, [design, catalogItem, item]);

  if (!catalogItem || !design) return null;
  const { w, d } = catalogItem.dims;

  const commit = (node: Konva.Node) => {
    const position = { x: node.x(), y: node.y() };
    const containing = design.rooms.find((r) => pointInPolygon(position, worldPolygon(r)));
    updateItem(item.id, {
      position,
      rotationDeg: node.rotation(),
      ...(containing ? { roomId: containing.id } : {}),
    });
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={item.position.x}
        y={item.position.y}
        rotation={item.rotationDeg}
        draggable
        onMouseDown={(e) => {
          e.cancelBubble = true;
          setSelection({ kind: 'item', id: item.id });
        }}
        onDragEnd={(e) => commit(e.target)}
        onTransformEnd={(e) => commit(e.target)}
      >
        <Rect
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={d}
          fill={catalogItem.color ?? '#cbd5e1'}
          opacity={0.9}
          stroke={invalid ? '#dc2626' : selected ? '#2563eb' : '#525252'}
          strokeWidth={invalid ? 3 : selected ? 2 : 1}
          cornerRadius={3}
        />
        <Text
          text={catalogItem.name}
          x={-w / 2 + 2}
          y={-7}
          width={w - 4}
          align="center"
          fontSize={Math.max(9, Math.min(13, w / 10))}
          fill="#1f2937"
          listening={false}
        />
      </Group>
      {selected && (
        <Transformer
          ref={trRef}
          resizeEnabled={false}
          rotateEnabled
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          rotationSnapTolerance={7}
          borderStroke="#2563eb"
          anchorStroke="#2563eb"
        />
      )}
    </>
  );
}
