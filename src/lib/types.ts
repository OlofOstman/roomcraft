// All lengths are centimeters. Angles are degrees, clockwise, 0 = pointing "north" (-y in 2D).

export interface Pt {
  x: number;
  y: number;
}

export type FurnitureCategory =
  | 'bed'
  | 'sofa'
  | 'armchair'
  | 'chair'
  | 'table'
  | 'desk'
  | 'wardrobe'
  | 'bookshelf'
  | 'dresser'
  | 'tv-bench'
  | 'rug'
  | 'lamp'
  | 'plant'
  | 'other';

export interface Dims {
  w: number; // width (along the item's own x)
  d: number; // depth (along the item's own y)
  h: number; // height
}

export interface CatalogItem {
  id: string;
  name: string;
  category: FurnitureCategory;
  dims: Dims;
  image?: string; // URL of product photo (link-sourced items)
  price?: string; // display string incl. currency, e.g. "4 995 kr"
  sourceUrl?: string;
  source: 'starter' | 'link';
  color?: string; // hex used for 2D fill + 3D tint
}

export interface Opening {
  id: string;
  wallIndex: number; // index i = wall from polygon[i] to polygon[(i+1) % n]
  offset: number; // cm from polygon[i] along the wall to the opening's start
  width: number;
  height: number;
  type: 'door' | 'window';
}

export interface Room {
  id: string;
  name: string;
  polygon: Pt[]; // corner points, room-local cm; any simple polygon
  origin: Pt; // where the room sits in the apartment (world cm)
  wallHeight: number;
  wallThickness: number;
  floorColor: string;
  wallColor: string;
  openings: Opening[];
}

export interface PlacedItem {
  id: string;
  catalogItemId: string;
  roomId: string;
  position: Pt; // world cm, center of the item's footprint
  rotationDeg: number;
}

export interface Design {
  id: string;
  name: string;
  units: 'cm';
  createdAt: number;
  updatedAt: number;
  rooms: Room[];
  items: PlacedItem[];
  /** link-sourced catalog items live with the design; starter items are global */
  linkedCatalog: CatalogItem[];
}

/** What the /api/extract route returns for user confirmation. */
export interface ExtractResult {
  name?: string;
  image?: string;
  price?: string;
  dims?: Partial<Dims>;
  category?: FurnitureCategory;
  sourceUrl: string;
  /** which strategy produced the dims, for debugging/trust UI */
  dimsSource?: 'structured' | 'text' | 'llm' | 'none';
  error?: string;
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
