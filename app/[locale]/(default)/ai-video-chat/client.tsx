'use client';

import React, { lazy, Suspense } from 'react';

export default function ClientComponent({ apiToken }: { apiToken: string }) {
  const AkoolVideoChat = lazy(() => import('@/components/AkoolVideoChat'));
  
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>}>
      <AkoolVideoChat apiToken={apiToken} />
    </Suspense>
  );
} 