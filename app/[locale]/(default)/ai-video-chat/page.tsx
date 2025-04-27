import React from 'react';
import { createTranslator } from 'next-intl';
// @ts-ignore
import ClientComponent from './client';

interface Props {
  params: { locale: string };
}

export default async function AIVideoChatPage(props: Props) {
  // 确保在使用前正确解构和等待params
  const { params } = props;
  const { locale } = params;
  
  const messages = (await import(`@/i18n/messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: 'AIVideoChat' });
  
  // 获取环境变量
  const apiToken = process.env.AKOOL_API_TOKEN || '';
  
  return (
    <div className="container max-w-6xl mx-auto py-8 px-4 min-h-[80vh]">
      <h1 className="text-3xl font-semibold mb-6 text-center">
        {t('title')}
      </h1>
      <p className="text-lg text-center mb-8">
        {t('description')}
      </p>
      
      <div className="h-[600px]">
        <ClientComponent 
          apiToken={apiToken}
        />
      </div>
    </div>
  );
} 