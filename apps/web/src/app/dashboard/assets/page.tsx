'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AssetLibrary from '@/components/assets/AssetLibrary';

/** `useSearchParams` 要求 Suspense 边界，否则整页会被拖成客户端渲染。 */
function ScopedLibrary() {
  return <AssetLibrary scopedResumeId={useSearchParams()?.get('resumeId') ?? null} />;
}

export default function AssetsPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <ScopedLibrary />
    </Suspense>
  );
}
