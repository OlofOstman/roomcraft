'use client';

import type { CatalogItem } from '@/lib/types';

/**
 * Generic category models built from primitives, in a unit space of
 * 1 (w) × 1 (d) × 1 (h) centered at origin, floor at y=0. The parent group
 * scales this to the item's real dimensions, so every model automatically
 * matches the product's true footprint and height.
 */
export default function FurnitureModel3D({ item }: { item: CatalogItem }) {
  const color = item.color ?? '#b9b3a8';
  switch (item.category) {
    case 'bed':
      return (
        <group>
          <Box c={color} p={[0, 0.15, 0]} s={[1, 0.3, 1]} />
          <Box c="#ffffff" p={[0, 0.38, 0.03]} s={[0.94, 0.16, 0.88]} />
          <Box c="#f3f4f6" p={[-0.22, 0.5, -0.38]} s={[0.4, 0.12, 0.18]} />
          <Box c="#f3f4f6" p={[0.22, 0.5, -0.38]} s={[0.4, 0.12, 0.18]} />
          <Box c={color} p={[0, 0.5, -0.49]} s={[1, 1, 0.02]} />
        </group>
      );
    case 'sofa':
      return (
        <group>
          <Box c={color} p={[0, 0.25, 0.1]} s={[1, 0.5, 0.8]} />
          <Box c={color} p={[0, 0.5, -0.4]} s={[1, 1, 0.2]} />
          <Box c={color} p={[-0.46, 0.35, 0.1]} s={[0.08, 0.7, 0.8]} />
          <Box c={color} p={[0.46, 0.35, 0.1]} s={[0.08, 0.7, 0.8]} />
        </group>
      );
    case 'armchair':
      return (
        <group>
          <Box c={color} p={[0, 0.25, 0.1]} s={[0.9, 0.5, 0.7]} />
          <Box c={color} p={[0, 0.5, -0.38]} s={[0.9, 1, 0.24]} />
          <Box c={color} p={[-0.44, 0.35, 0.05]} s={[0.12, 0.7, 0.8]} />
          <Box c={color} p={[0.44, 0.35, 0.05]} s={[0.12, 0.7, 0.8]} />
        </group>
      );
    case 'chair':
      return (
        <group>
          <Box c={color} p={[0, 0.45, 0]} s={[0.9, 0.06, 0.9]} />
          <Legs c={color} top={0.45} />
          <Box c={color} p={[0, 0.72, -0.42]} s={[0.9, 0.56, 0.08]} />
        </group>
      );
    case 'table':
    case 'desk':
      return (
        <group>
          <Box c={color} p={[0, 0.96, 0]} s={[1, 0.08, 1]} />
          <Legs c={color} top={0.92} />
        </group>
      );
    case 'rug':
      return <Box c={color} p={[0, 0.5, 0]} s={[1, 1, 1]} />;
    case 'lamp':
      return (
        <group>
          <Box c={color} p={[0, 0.02, 0]} s={[0.8, 0.04, 0.8]} />
          <Box c="#6b7280" p={[0, 0.45, 0]} s={[0.08, 0.86, 0.08]} />
          <Cone c="#fef3c7" p={[0, 0.85, 0]} s={[0.9, 0.3, 0.9]} />
        </group>
      );
    case 'plant':
      return (
        <group>
          <Cylinder c="#a16207" p={[0, 0.125, 0]} s={[0.5, 0.25, 0.5]} />
          <Sphere c="#4d7c0f" p={[0, 0.65, 0]} s={[1, 0.7, 1]} />
        </group>
      );
    // wardrobe, bookshelf, dresser, tv-bench, other: a clean box reads honestly
    default:
      return (
        <group>
          <Box c={color} p={[0, 0.5, 0]} s={[1, 1, 1]} />
          <Box c="#00000022" p={[0, 0.5, 0.5]} s={[0.02, 0.92, 0.01]} />
        </group>
      );
  }
}

type Vec3 = [number, number, number];

function Box({ c, p, s }: { c: string; p: Vec3; s: Vec3 }) {
  return (
    <mesh position={p} scale={s} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial color={c} transparent={c.length === 9} opacity={c.length === 9 ? 0.2 : 1} />
    </mesh>
  );
}

function Cone({ c, p, s }: { c: string; p: Vec3; s: Vec3 }) {
  return (
    <mesh position={p} scale={s}>
      <coneGeometry args={[0.5, 1, 24, 1, true]} />
      <meshStandardMaterial color={c} />
    </mesh>
  );
}

function Cylinder({ c, p, s }: { c: string; p: Vec3; s: Vec3 }) {
  return (
    <mesh position={p} scale={s}>
      <cylinderGeometry args={[0.4, 0.5, 1, 20]} />
      <meshStandardMaterial color={c} />
    </mesh>
  );
}

function Sphere({ c, p, s }: { c: string; p: Vec3; s: Vec3 }) {
  return (
    <mesh position={p} scale={s}>
      <sphereGeometry args={[0.5, 20, 16]} />
      <meshStandardMaterial color={c} />
    </mesh>
  );
}

function Legs({ c, top }: { c: string; top: number }) {
  const positions: Vec3[] = [
    [-0.44, top / 2, -0.44],
    [0.44, top / 2, -0.44],
    [-0.44, top / 2, 0.44],
    [0.44, top / 2, 0.44],
  ];
  return (
    <group>
      {positions.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.06, top, 0.06]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
    </group>
  );
}
