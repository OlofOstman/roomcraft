'use client';

import { usePlannerStore } from '@/lib/store';
import PlanView2D from './PlanView2D';
import DollhouseView3D from './DollhouseView3D';
import DesignsScreen from './panels/DesignsScreen';
import LibraryPanel from './panels/LibraryPanel';
import PropertiesPanel from './panels/PropertiesPanel';

export default function PlannerApp() {
  const design = usePlannerStore((s) => s.designs.find((d) => d.id === s.activeDesignId) ?? null);
  const viewMode = usePlannerStore((s) => s.viewMode);
  const setViewMode = usePlannerStore((s) => s.setViewMode);
  const openDesign = usePlannerStore((s) => s.openDesign);
  const renameDesign = usePlannerStore((s) => s.renameDesign);

  if (!design) return <DesignsScreen />;

  return (
    <div className="flex h-screen flex-col bg-neutral-100 text-neutral-900">
      <header className="flex items-center gap-3 border-b border-neutral-300 bg-white px-4 py-2">
        <button
          className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100"
          onClick={() => openDesign('')}
          title="Back to my designs"
        >
          ← Designs
        </button>
        <input
          className="w-56 rounded border border-transparent px-2 py-1 text-sm font-semibold hover:border-neutral-300 focus:border-neutral-400 focus:outline-none"
          value={design.name}
          onChange={(e) => renameDesign(e.target.value)}
        />
        <div className="ml-auto flex rounded-lg border border-neutral-300 p-0.5">
          <button
            className={`rounded-md px-4 py-1 text-sm font-medium ${viewMode === '2d' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
            onClick={() => setViewMode('2d')}
          >
            2D plan
          </button>
          <button
            className={`rounded-md px-4 py-1 text-sm font-medium ${viewMode === '3d' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
            onClick={() => setViewMode('3d')}
          >
            Dollhouse
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-neutral-300 bg-white">
          <LibraryPanel />
        </aside>

        <main className="relative min-w-0 flex-1">
          {viewMode === '2d' ? <PlanView2D /> : <DollhouseView3D />}
        </main>

        <PropertiesPanel />
      </div>
    </div>
  );
}
