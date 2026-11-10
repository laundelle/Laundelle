'use client';

import React, { useState } from 'react';
import { MobileProcessorTab } from '@/components/processor/mobile/types';
import { ProcessorMobileLayout } from '@/components/processor/mobile/ProcessorMobileLayout';
import { ProcessorMobileScanScreen } from '@/components/processor/mobile/ProcessorMobileScanScreen';
import { ProcessorMobileOrdersScreen } from '@/components/processor/mobile/ProcessorMobileOrdersScreen';
import { ProcessorMobileHistoryScreen } from '@/components/processor/mobile/ProcessorMobileHistoryScreen';

export default function MobileProcessorPortalPage() {
  const [activeTab, setActiveTab] = useState<MobileProcessorTab>('orders');

  const getTitle = () => {
    switch (activeTab) {
      case 'scan':
        return 'Scan Intake';
      case 'orders':
        return 'Active Orders';
      case 'history':
        return 'Completed Jobs';
    }
  };

  return (
    <ProcessorMobileLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      title={getTitle()}
      badgeCount={1}
    >
      {activeTab === 'scan' && (
        <ProcessorMobileScanScreen
          onNavigateToOrders={() => setActiveTab('orders')}
        />
      )}
      {activeTab === 'orders' && <ProcessorMobileOrdersScreen />}
      {activeTab === 'history' && <ProcessorMobileHistoryScreen />}
    </ProcessorMobileLayout>
  );
}

