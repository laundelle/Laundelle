'use client';

import React, { useState, useEffect } from 'react';
import { AdminViewTab } from '@laundelle/types';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import { ManagerPortalView } from './ManagerPortalView';
import { AdminOrdersView } from './AdminOrdersView';
import { ManagerDriversView } from './ManagerDriversView';
import { ManagerProcessorsView } from './ManagerProcessorsView';
import { ManagerStaffView } from './ManagerStaffView';
import { ManagerIncidentsView } from './ManagerIncidentsView';
import { FleetManagementView } from './FleetManagementView';
import { InventoryManagementView } from './InventoryManagementView';
import { AdminAreasView } from './AdminAreasView';
import { AdminComplaintsView } from './AdminComplaintsView';
import { ManagerSettingsView } from './ManagerSettingsView';
import { LogoutConfirmModal } from './LogoutConfirmModal';
import { ManagerCustomersView } from './ManagerCustomersView';
import { ManagerStaffWarningBanner } from './ManagerStaffWarningBanner';
import { dbFetchManagerOrders, dbFetchManagerStaff } from '@laundelle/api-client';
import { UserGuideView } from '@laundelle/ui';

interface ManagerPortalContainerProps {
  userName?: string;
  onSignOut: () => void;
  initialTab?: AdminViewTab;
}

export const ManagerPortalContainer: React.FC<ManagerPortalContainerProps> = ({
  userName,
  onSignOut,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<AdminViewTab>(initialTab || 'dashboard');
  const [selectedLocation, setSelectedLocation] = useState('All Locations');
  const [dateFilter, setDateFilter] = useState('All Time');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [guideInitialTab, setGuideInitialTab] = useState<AdminViewTab | undefined>(initialTab);

  // Manager staff list for minimum staffing verification
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [autoOpenStaffRole, setAutoOpenStaffRole] = useState<'driver' | 'processor' | null>(null);

  const fetchStaff = async () => {
    try {
      const data = await dbFetchManagerStaff();
      setStaffList(data || []);
    } catch (err) {
      console.error('Failed to load manager staff for staffing check:', err);
    } finally {
      setLoadingStaff(false);
    }
  };

  const fetchOrders = async (df = dateFilter, sd = customStartDate, ed = customEndDate) => {
    const data = await dbFetchManagerOrders('all', df, sd, ed);
    setOrders(data || []);
  };

  useEffect(() => {
    fetchOrders(dateFilter, customStartDate, customEndDate);
  }, [activeTab, dateFilter, customStartDate, customEndDate]);

  useEffect(() => {
    fetchStaff();
  }, []);

  const activeDrivers = staffList.filter((s: any) => s.role === 'driver' && s.is_active !== false && s.availability !== 'offline' && s.availability !== 'off-duty');
  const activeProcessors = staffList.filter((s: any) => s.role === 'processor' && s.is_active !== false && s.availability !== 'offline');

  const handleOpenAddDriver = () => {
    setActiveTab('staff');
    setAutoOpenStaffRole('driver');
  };

  const handleOpenAddProcessor = () => {
    setActiveTab('staff');
    setAutoOpenStaffRole('processor');
  };

  return (
    <div className="w-full h-screen overflow-hidden bg-[#f8fafc] flex flex-row font-sans text-gray-900">
      <AdminSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        unresolvedAlertsCount={2}
        currentRole="manager"
        onRequestLogout={() => setShowLogoutModal(true)}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <AdminTopbar
          currentRole="manager"
          onChangeRole={() => {}}
          selectedLocation={selectedLocation}
          onChangeLocation={setSelectedLocation}
          dateFilter={dateFilter}
          onChangeDateFilter={(df) => {
            setDateFilter(df);
            fetchOrders(df, customStartDate, customEndDate);
          }}
          customStartDate={customStartDate}
          onChangeCustomStartDate={(sd) => {
            setCustomStartDate(sd);
            fetchOrders(dateFilter, sd, customEndDate);
          }}
          customEndDate={customEndDate}
          onChangeCustomEndDate={(ed) => {
            setCustomEndDate(ed);
            fetchOrders(dateFilter, customStartDate, ed);
          }}
          onOpenGlobalSearch={() => {}}
          onOpenUserGuide={() => {
            setGuideInitialTab(activeTab);
            setActiveTab('user_guide');
          }}
          onExitAdmin={() => setShowLogoutModal(true)}
          onRequestLogout={() => setShowLogoutModal(true)}
        />

        {/* Continuous Staffing Warning: continuously shown across views until at least 1 driver and 1 processor are created */}
        <ManagerStaffWarningBanner
          activeDriversCount={activeDrivers.length}
          activeProcessorsCount={activeProcessors.length}
          loading={loadingStaff}
          onOpenAddDriver={handleOpenAddDriver}
          onOpenAddProcessor={handleOpenAddProcessor}
        />

        <main className="flex-1 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <ManagerPortalView
              onNavigateTab={setActiveTab}
              dateFilter={dateFilter}
              customStartDate={customStartDate}
              customEndDate={customEndDate}
            />
          )}
          {activeTab === 'orders' && <AdminOrdersView orders={orders} onRefresh={() => fetchOrders(dateFilter, customStartDate, customEndDate)} />}
          {activeTab === 'customers' && <ManagerCustomersView />}
          {activeTab === 'drivers' && <ManagerDriversView />}
          {activeTab === 'processors' && <ManagerProcessorsView />}
          {activeTab === 'staff' && (
            <ManagerStaffView
              autoOpenAddRole={autoOpenStaffRole}
              onClearAutoOpen={() => setAutoOpenStaffRole(null)}
              onStaffChange={fetchStaff}
            />
          )}
          {activeTab === 'complaints' && <ManagerIncidentsView />}
          {activeTab === 'areas' && <AdminAreasView />}
          {activeTab === 'settings' && <ManagerSettingsView />}
          {activeTab === 'user_guide' && (
            <UserGuideView
              portalRole="manager"
              initialTab={guideInitialTab}
              onNavigateTab={setActiveTab}
            />
          )}
        </main>
      </div>

      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={() => {
          setShowLogoutModal(false);
          onSignOut();
        }}
        portalName="Manager Portal"
      />
    </div>
  );
};
