'use client';

import dynamic from 'next/dynamic';

const CatastropheDesk = dynamic(() => import('@/components/CatastropheDesk'), { ssr: false });

export default function CatastropheClient() {
  return <CatastropheDesk />;
}
