import React from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  UserCheck,
  Sparkles,
  Map,
  DollarSign,
  AlertOctagon,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Shirt,
  QrCode,
  ClipboardCheck,
  History,
  User,
  Truck,
  Package,
  ChevronsUpDown,
  LogOut,
  BookOpen,
} from 'lucide-react';
import { AdminViewTab } from '@laundelle/types';

interface AdminSidebarProps {
  activeTab: AdminViewTab;
  onTabChange: (tab: AdminViewTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  unresolvedAlertsCount: number;
  currentRole?: string;
  onRequestLogout?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapse,
  unresolvedAlertsCount,
  currentRole,
  onRequestLogout,
}) => {
  const rawNavItems: { id: AdminViewTab; label: string; icon: React.FC<{ className?: string }>; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'orders', label: 'Orders', icon: ShoppingBag },
    { id: 'drivers', label: 'Drivers', icon: Truck },
    { id: 'processors', label: 'Processors', icon: Package },
    { id: 'customers', label: 'Clients & CRM', icon: Users },
    { id: 'staff', label: 'Staff Team', icon: UserCheck },
    { id: 'services', label: 'Services', icon: Sparkles },
    { id: 'areas', label: 'Plant Slots & Areas', icon: Map },
    { id: 'finance', label: 'Finance', icon: DollarSign },
    { id: 'complaints', label: 'Incidents & Issues', icon: AlertOctagon },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'user_guide', label: 'User Guide', icon: BookOpen },
    // Processor specific tabs
    { id: 'qr_scan', label: 'Scan QR Bag', icon: QrCode },
    { id: 'qc', label: 'Quality Check', icon: ClipboardCheck },
    { id: 'history', label: 'Completed Jobs', icon: History },
    { id: 'profile', label: 'My Profile', icon: User },
  ];

  let navItems = rawNavItems;

  if (currentRole === 'manager') {
    navItems = rawNavItems
      .filter(item => ['dashboard', 'orders', 'customers', 'drivers', 'processors', 'staff', 'areas', 'settings', 'user_guide'].includes(item.id))
      .map(item => {
        if (item.id === 'customers') return { ...item, label: 'Customers', icon: Users };
        if (item.id === 'staff') return { ...item, label: 'Staff Team', icon: UserCheck };
        if (item.id === 'areas') return { ...item, label: 'Plant Slots & Areas', icon: Map };
        return item;
      });
  } else if (currentRole === 'processor') {
    navItems = rawNavItems.filter(item => ['qr_scan', 'orders', 'qc', 'history', 'profile'].includes(item.id));
  } else {
    navItems = rawNavItems.filter(item => !['qr_scan', 'qc', 'history', 'profile', 'drivers', 'processors'].includes(item.id));
  }

  return (
    <aside
      className={`hidden md:flex bg-white border-r border-slate-100 text-slate-800 flex-col justify-between transition-all duration-300 z-40 relative shrink-0 h-screen sticky top-0 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-100 shrink-0">
          {!collapsed ? (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100/60 shadow-2xs">
                <Shirt className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-bold text-base tracking-tight text-slate-900">
                  Laundelle
                </span>
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50/80 px-1.5 py-0.5 rounded-md border border-blue-100/50">
                  Manager
                </span>
              </div>
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100/60">
              <Shirt className="w-4 h-4 text-blue-600" />
            </div>
          )}

          <button
            onClick={onToggleCollapse}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition-colors hidden sm:block cursor-pointer"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Facility / Workspace Pill Card (like 'Nova Studio / Owner' in reference) */}
        {!collapsed && (
          <div className="px-3.5 pt-4 pb-2 shrink-0">
            <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center justify-between hover:bg-slate-100/60 transition-colors cursor-pointer group">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-blue-100/70 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                  P
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate leading-snug">
                    Preston Plant Hub
                  </p>
                  <span className="text-[10px] font-medium text-slate-500 bg-white px-1.5 py-0.2 rounded border border-slate-200/60 inline-block">
                    Operational
                  </span>
                </div>
              </div>
              <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 shrink-0 ml-1" />
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="p-3 space-y-1 overflow-y-auto flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer group relative ${
                  isActive
                    ? 'bg-blue-50/80 text-blue-600 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}

                {/* Badge if alerts */}
                {item.badge && item.badge > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold ml-auto shrink-0 bg-blue-100 text-blue-700">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Logout Button */}
        {onRequestLogout && (
          <div className="px-3 pt-2 pb-1 border-t border-slate-100 shrink-0">
            <button
              onClick={onRequestLogout}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer ${
                collapsed ? 'justify-center' : ''
              }`}
              title={collapsed ? 'Log Out' : undefined}
            >
              <LogOut className="w-4 h-4 shrink-0 text-rose-600" />
              {!collapsed && <span>Log Out</span>}
            </button>
          </div>
        )}

        {/* Footer info */}
        <div className="p-3.5 border-t border-slate-100 shrink-0">
          {!collapsed ? (
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-medium text-slate-500">Plant Operations</span>
              <span className="flex items-center gap-1.5 font-medium text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync
              </span>
            </div>
          ) : (
            <div className="flex justify-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Live Sync Active" />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
