'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ProcessorMobileLayout } from '@/components/processor/mobile/ProcessorMobileLayout';
import { ProcessorMobileScanScreen } from '@/components/processor/mobile/ProcessorMobileScanScreen';

export default function MobileScanPage() {
  const router = useRouter();

  const handleTabChange = (tab: 'scan' | 'orders' | 'history') => {
    if (tab === 'scan') return;
    router.push(`/processor/mobile/${tab}`);
  };

  return (
    <ProcessorMobileLayout
      activeTab="scan"
      onTabChange={handleTabChange}
      title="Scan Intake"
      badgeCount={1}
    >
      <ProcessorMobileScanScreen
        onNavigateToOrders={() => router.push('/processor/mobile/orders')}
      />
    </ProcessorMobileLayout>
  );
}

