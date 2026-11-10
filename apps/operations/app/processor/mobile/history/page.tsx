'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ProcessorMobileLayout } from '@/components/processor/mobile/ProcessorMobileLayout';
import { ProcessorMobileHistoryScreen } from '@/components/processor/mobile/ProcessorMobileHistoryScreen';

export default function MobileHistoryPage() {
  const router = useRouter();

  const handleTabChange = (tab: 'scan' | 'orders' | 'history') => {
    if (tab === 'history') return;
    router.push(`/processor/mobile/${tab}`);
  };

  return (
    <ProcessorMobileLayout
      activeTab="history"
      onTabChange={handleTabChange}
      title="Completed Jobs"
      badgeCount={1}
    >
      <ProcessorMobileHistoryScreen />
    </ProcessorMobileLayout>
  );
}

