'use client';

import dynamic from 'next/dynamic';

// Konva and three.js touch window/canvas at import time — client-only.
const PlannerApp = dynamic(() => import('@/components/PlannerApp'), { ssr: false });

export default function Home() {
  return <PlannerApp />;
}
