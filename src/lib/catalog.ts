import type { CatalogItem, Design } from './types';

/**
 * Starter library: common furniture with real-world dimensions (cm) so a new user
 * isn't staring at an empty room. Colors are used for the 2D fill and the 3D tint.
 */
export const STARTER_CATALOG: CatalogItem[] = [
  { id: 'st_bed_160', name: 'Double bed 160', category: 'bed', dims: { w: 160, d: 200, h: 55 }, source: 'starter', color: '#f0ede6' },
  { id: 'st_bed_90', name: 'Single bed 90', category: 'bed', dims: { w: 90, d: 200, h: 55 }, source: 'starter', color: '#f0ede6' },
  { id: 'st_sofa_3', name: '3-seat sofa', category: 'sofa', dims: { w: 218, d: 88, h: 83 }, source: 'starter', color: '#9aa5b1' },
  { id: 'st_sofa_2', name: '2-seat sofa', category: 'sofa', dims: { w: 165, d: 88, h: 83 }, source: 'starter', color: '#9aa5b1' },
  { id: 'st_armchair', name: 'Armchair', category: 'armchair', dims: { w: 82, d: 90, h: 95 }, source: 'starter', color: '#b0a08e' },
  { id: 'st_wardrobe', name: 'Wardrobe 100', category: 'wardrobe', dims: { w: 100, d: 60, h: 201 }, source: 'starter', color: '#efe9dd' },
  { id: 'st_bookshelf', name: 'Bookshelf 80', category: 'bookshelf', dims: { w: 80, d: 28, h: 202 }, source: 'starter', color: '#e6dccb' },
  { id: 'st_desk', name: 'Desk 120', category: 'desk', dims: { w: 120, d: 60, h: 74 }, source: 'starter', color: '#d9c9a3' },
  { id: 'st_dining', name: 'Dining table', category: 'table', dims: { w: 140, d: 84, h: 74 }, source: 'starter', color: '#c9a06c' },
  { id: 'st_coffee', name: 'Coffee table', category: 'table', dims: { w: 90, d: 55, h: 45 }, source: 'starter', color: '#c9a06c' },
  { id: 'st_chair', name: 'Chair', category: 'chair', dims: { w: 45, d: 52, h: 85 }, source: 'starter', color: '#8f857a' },
  { id: 'st_tv', name: 'TV bench 160', category: 'tv-bench', dims: { w: 160, d: 42, h: 50 }, source: 'starter', color: '#6b6459' },
  { id: 'st_dresser', name: 'Chest of drawers', category: 'dresser', dims: { w: 80, d: 48, h: 100 }, source: 'starter', color: '#e8e2d4' },
  { id: 'st_rug', name: 'Rug 200×300', category: 'rug', dims: { w: 200, d: 300, h: 1 }, source: 'starter', color: '#c4b6a0' },
  { id: 'st_lamp', name: 'Floor lamp', category: 'lamp', dims: { w: 35, d: 35, h: 150 }, source: 'starter', color: '#d8d3c8' },
  { id: 'st_plant', name: 'Large plant', category: 'plant', dims: { w: 40, d: 40, h: 140 }, source: 'starter', color: '#7d9b76' },
];

/** Look up a catalog item by id across the starter library and the design's linked items. */
export function findCatalogItem(design: Design | null, id: string): CatalogItem | undefined {
  return (
    STARTER_CATALOG.find((c) => c.id === id) ??
    design?.linkedCatalog.find((c) => c.id === id)
  );
}
