import React from 'react';
import { createTranslator } from 'next-intl';
import ClientComponent from './client';

interface Props {
  params: { locale: string };
}

export default async function AIVideoChatPage({ params: { locale } }: Props) {
  const messages = (await import(`@/i18n/messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: 'AIVideoChat' });
  
  return (
    <div className="container max-w-6xl mx-auto py-8 px-4 min-h-[80vh]">
      <h1 className="text-3xl font-semibold mb-6 text-center">
        {t('title', { fallback: 'AI 视频对话' })}
      </h1>
      <p className="text-lg text-center mb-8">
        {t('description', { fallback: '与虚拟人进行实时视频对话' })}
      </p>
      
      <div className="h-[600px]">
        <ClientComponent 
          apiToken={process.env.AKOOL_API_TOKEN || ''}
        />
      </div>
    </div>
  );
} 