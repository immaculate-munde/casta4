'use client';

import { useState } from 'react';
import CatastropheDesk from '@/components/CatastropheDesk';

export default function MapDeskClient() {
  const [deskKey, setDeskKey] = useState(0);

  return (
    <CatastropheDesk
      key={deskKey}
      shellMode
      onPortfolioChange={() => setDeskKey((k) => k + 1)}
    />
  );
}
