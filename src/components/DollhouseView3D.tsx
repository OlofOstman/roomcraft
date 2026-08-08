'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { findCatalogItem } from '@/lib/catalog';
import { polygonBounds, wallSegments, worldPolygon } from '@/lib/roomGeometry';
import { usePlannerStore } from '@/lib/store';
import type { Design, Room } from '@/lib/types';
import FurnitureModel3D from './FurnitureModel3D';

// World cm → scene meters
const S = 0.01;

export default function DollhouseView3D() {
  const design = usePlannerStore((s) => s.designs.find((d) => d.id === s.activeDesignId) ?? null);
  if (!design) return null;

  const allPoints = design.rooms.flatMap(worldPolygon);
  const bounds = allPoints.length
    ? polygonBounds(allPoints)
    : { min: { x: 0, y: 0 }, max: { x: 500, y: 400 } };
  const center = {
    x: ((bounds.min.x + bounds.max.x) / 2) * S,
    z: ((bounds.min.y + bounds.max.y) / 2) * S,
  };
  const spread = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y) * S;

  return (
    <div className="absolute inset-0 bg-gradient-to-b from-neutral-300 to-neutral-400">
      <Canvas
        shadows
        camera={{
          position: [center.x + spread * 0.9, spread * 1.1, center.z + spread * 1.1],
          fov: 45,
        }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[center.x + 6, 12, center.z + 4]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <ApartmentScene design={design} />
        <OrbitControls
          target={[center.x, 0, center.z]}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={spread * 0.3}
          maxDistance={spread * 4}
        />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-xs text-neutral-500">
        Drag to orbit · scroll to zoom · walls facing you lower automatically
      </div>
    </div>
  );
}

function ApartmentScene({ design }: { design: Design }) {
  return (
    <group>
      {design.rooms.map((room) => (
        <RoomMesh key={room.id} room={room} />
      ))}
      {design.items.map((item) => {
        const cat = findCatalogItem(design, item.catalogItemId);
        if (!cat) return null;
        return (
          <group
            key={item.id}
            position={[item.position.x * S, 0, item.position.y * S]}
            rotation={[0, (-item.rotationDeg * Math.PI) / 180, 0]}
          >
            <group scale={[cat.dims.w * S, cat.dims.h * S, cat.dims.d * S]}>
              <FurnitureModel3D item={cat} />
            </group>
          </group>
        );
      })}
    </group>
  );
}

function RoomMesh({ room }: { room: Room }) {
  const poly = worldPolygon(room);

  const floorGeometry = useMemo(() => {
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x * S, p.y * S)));
    return new THREE.ShapeGeometry(shape);
  }, [poly]);

  const centroid = useMemo(() => {
    const c = poly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: c.x / poly.length, y: c.y / poly.length };
  }, [poly]);

  return (
    <group>
      {/* ShapeGeometry lies in the XY plane; rotate so 2D y maps to world z. */}
      <mesh geometry={floorGeometry} rotation={[Math.PI / 2, 0, 0]} scale={[1, -1, 1]} receiveShadow>
        <meshStandardMaterial color={room.floorColor} side={THREE.DoubleSide} />
      </mesh>
      {wallSegments(poly).map((seg) => (
        <WallMesh
          key={seg.index}
          a={{ x: seg.a.x * S, y: seg.a.y * S }}
          b={{ x: seg.b.x * S, y: seg.b.y * S }}
          centroid={{ x: centroid.x * S, y: centroid.y * S }}
          height={room.wallHeight * S}
          thickness={room.wallThickness * S}
          color={room.wallColor}
        />
      ))}
    </group>
  );
}

const LOWERED = 0.06; // near-wall cutaway: walls facing the camera shrink to 6%

function WallMesh({
  a,
  b,
  centroid,
  height,
  thickness,
  color,
}: {
  a: { x: number; y: number };
  b: { x: number; y: number };
  centroid: { x: number; y: number };
  height: number;
  thickness: number;
  color: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const angle = Math.atan2(b.y - a.y, b.x - a.x);

  // Outward normal: perpendicular pointing away from the room centroid.
  const outward = useMemo(() => {
    let nx = -(b.y - a.y) / (length || 1);
    let ny = (b.x - a.x) / (length || 1);
    if (nx * (mid.x - centroid.x) + ny * (mid.y - centroid.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { x: nx, y: ny };
  }, [a, b, centroid, length, mid.x, mid.y]);

  useFrame(({ camera }) => {
    const g = groupRef.current;
    if (!g) return;
    const toCam = { x: camera.position.x - mid.x, y: camera.position.z - mid.y };
    const facing = outward.x * toCam.x + outward.y * toCam.y > 0;
    const target = facing ? LOWERED : 1;
    g.scale.y += (target - g.scale.y) * 0.25; // ease toward target
  });

  return (
    <group ref={groupRef} position={[mid.x, 0, mid.y]} rotation={[0, -angle, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[length + thickness, height, thickness]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}
