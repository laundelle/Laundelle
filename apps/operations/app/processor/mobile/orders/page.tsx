'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ProcessorMobileLayout } from '@/components/processor/mobile/ProcessorMobileLayout';
import { ProcessorMobileOrdersScreen } from '@/components/processor/mobile/ProcessorMobileOrdersScreen';

export default function MobileOrdersPage() {
  const router = useRouter();

  const handleTabChange = (tab: 'scan' | 'orders' | 'history') => {
    if (tab === 'orders') return;
    router.push(`/processor/mobile/${tab}`);
  };

  return (
    <ProcessorMobileLayout
      activeTab="orders"
      onTabChange={handleTabChange}
      title="Active Orders"
      badgeCount={1}
    >
      <ProcessorMobileOrdersScreen />
    </ProcessorMobileLayout>
  );
}

