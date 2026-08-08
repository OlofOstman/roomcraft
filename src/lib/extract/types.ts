// Types for the add-by-link pipeline: scraping a furniture product page into
// something we can place in the plan. All lengths are centimeters, matching
// FurnitureDef in $lib/utils/furnitureCatalog.

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

/** What /api/extract returns for user confirmation. */
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
