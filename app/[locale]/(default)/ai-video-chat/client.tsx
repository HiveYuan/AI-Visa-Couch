'use client';

import React, { lazy, Suspense, useEffect, useState } from 'react';

// 创建一个包装组件来动态导入AkoolVideoChat
export default function ClientComponent({ apiToken }: { apiToken: string }) {
  const [Component, setComponent] = useState<React.ComponentType<{apiToken: string}> | null>(null);
  
  useEffect(() => {
    // 只在客户端（浏览器环境）中动态导入AkoolVideoChat组件
    import('@/components/AkoolVideoChat').then(module => {
      setComponent(() => module.default);
    });
  }, []);
  
  // 加载状态显示
  if (!Component) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  // 渲染实际组件
  return <Component apiToken={apiToken} />;
} 