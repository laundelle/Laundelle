'use client';
import { apiFetch } from '@laundelle/api-client';
import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  LogOut,
  QrCode,
  ShoppingBag,
  ClipboardCheck,
  History,
  User,
  Clock,
  ChevronRight,
  Building2,
  RefreshCw,
  Menu,
  X
} from 'lucide-react';
import { ProcessorQRScanView } from './ProcessorQRScanView';
import { ProcessorOrdersView } from './ProcessorOrdersView';
import { ProcessorQCView } from './ProcessorQCView';
import { ProcessorHistoryView } from './ProcessorHistoryView';
import { ProcessorProfileView } from './ProcessorProfileView';

export type ProcessorViewTab = 'qr_scan' | 'orders' | 'qc' | 'history' | 'profile';

interface ProcessorLayoutProps {
  userName?: string;
  onSignOut: () => void;
  onSwitchRole?: () => void;
}

export const ProcessorLayout: React.FC<ProcessorLayoutProps> = ({ userName, onSignOut, onSwitchRole }) => {
  const [activeTab, setActiveTab] = useState<ProcessorViewTab>('orders');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [activeCount, setActiveCount] = useState<number>(0);
  const [qcCount, setQcCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [processorActive, setProcessorActive] = useState<boolean>(true);
  const [processorAvailability, setProcessorAvailability] = useState<'available' | 'busy' | 'offline'>('available');
  const [togglingActive, setTogglingActive] = useState<boolean>(false);

  // Digital plant clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync count badges from backend
  const fetchCounts = async () => {
    try {
      const rawSession = localStorage.getItem('l2u_auth_session');
      const token = rawSession ? JSON.parse(rawSession).token : null;
      const res = await apiFetch('/api/v1/processor/jobs', {
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.assigned) {
          const active = data.assigned.filter((o: any) => o.status !== 'ready_for_delivery' && o.status !== 'delivered').length;
          const qc = data.assigned.filter((o: any) => o.status === 'qc_ready' || o.status === 'ready_for_qc' || o.status === 'quality_check').length;
          setActiveCount(active);
          setQcCount(qc);
        }
        if (data.processor) {
          const isAct = data.processor.status !== 'suspended' && (data.processor.availability === 'available' || data.processor.availability !== 'offline');
          setProcessorActive(isAct);
          setProcessorAvailability(data.processor.availability || (isAct ? 'available' : 'offline'));
        }
      }
    } catch { }
  };

  const handleToggleProcessorActive = async () => {
    if (togglingActive) return;
    const nextActive = !processorActive;
    const nextStatus: 'available' | 'offline' = nextActive ? 'available' : 'offline';
    setTogglingActive(true);
    setProcessorActive(nextActive);
    setProcessorAvailability(nextStatus);

    try {
      const rawSession = localStorage.getItem('l2u_auth_session');
      const token = rawSession ? JSON.parse(rawSession).token : null;
      const res = await apiFetch('/api/v1/processor/availability', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ availability: nextStatus })
      });
      if (res.ok) {
        window.dispatchEvent(new CustomEvent('l2u_processor_orders_changed'));
      } else {
        setProcessorActive(!nextActive);
        setProcessorAvailability(!nextActive ? 'available' : 'offline');
      }
    } catch {
      setProcessorActive(!nextActive);
      setProcessorAvailability(!nextActive ? 'available' : 'offline');
    } finally {
      setTogglingActive(false);
    }
  };

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 12000);
    window.addEventListener('l2u_processor_orders_changed', fetchCounts);
    return () => {
      clearInterval(interval);
      window.removeEventListener('l2u_processor_orders_changed', fetchCounts);
    };
  }, []);

  const navItems = [
    {
      id: 'qr_scan' as ProcessorViewTab,
      label: 'Scan Intake',
      shortLabel: 'Intake',
      icon: QrCode,
    },
    {
      id: 'orders' as ProcessorViewTab,
      label: 'Orders Board',
      shortLabel: 'Orders',
      icon: ShoppingBag,
      count: activeCount,
    },
    {
      id: 'qc' as ProcessorViewTab,
      label: 'Quality Check',
      shortLabel: 'Quality',
      icon: ClipboardCheck,
      count: qcCount,
    },
    {
      id: 'history' as ProcessorViewTab,
      label: 'Completed Jobs',
      shortLabel: 'History',
      icon: History,
    },
    {
      id: 'profile' as ProcessorViewTab,
      label: 'Station Profile',
      shortLabel: 'Profile',
      icon: User,
    },
  ];

  const currentNav = navItems.find(n => n.id === activeTab) || navItems[1];

  return (
    <div className="w-full min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col md:flex-row antialiased">
      {/* ─── Desktop Left Sidebar (PC View) ─────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 bg-white text-slate-800 shrink-0 border-r border-slate-100 select-none z-30 sticky top-0 h-screen justify-between">
        <div className="flex flex-col h-full overflow-hidden">
          {/* Brand Header */}
          <div className="h-16 px-5 flex items-center justify-between border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100/60 shadow-2xs">
                <QrCode className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-bold text-base tracking-tight text-slate-900">
                  Laundelle
                </span>
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50/80 px-1.5 py-0.5 rounded-md border border-blue-100/50">
                  Processor
                </span>
              </div>
            </div>
          </div>

          {/* Plant Unit Pill Card with Duty Status Toggle */}
          <div className="px-3.5 pt-4 pb-2 shrink-0">
            <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="text-xs font-semibold text-slate-900 truncate">Preston Plant 1</span>
              </div>
              <button
                type="button"
                onClick={handleToggleProcessorActive}
                disabled={togglingActive}
                title="Click to toggle Station Status"
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border transition-all cursor-pointer flex items-center gap-1 ${processorActive
                  ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200/60'
                  : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'
                  }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${processorActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span>{processorActive ? 'Online' : 'Offline'}</span>
              </button>
            </div>
          </div>

          {/* Navigation Section */}
          <nav className="p-3 space-y-1 overflow-y-auto flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer group relative ${isActive
                    ? 'bg-blue-50/80 text-blue-600 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {/* Count Badge */}
                  {item.count !== undefined && item.count > 0 ? (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700'
                      }`}>
                      {item.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          {/* Bottom Station Operator Footer */}
          <div className="p-3 border-t border-slate-100 shrink-0">
            <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-blue-100/70 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                  {(userName || 'P').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{userName || 'Plant Operator'}</p>
                  <p className="text-[10px] text-slate-500 truncate">Station Operator</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {onSwitchRole && (
                  <button
                    onClick={onSwitchRole}
                    title="Switch Portal"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={onSignOut}
                  title="Sign Out"
                  className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Main Content Column ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Topbar Header */}
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-100 px-3 sm:px-4 lg:px-8 py-3 flex items-center justify-between">
          {/* Mobile Screen Header (md:hidden): Left Page Name, Center Logo, Right Status & Toggle */}
          <div className="md:hidden flex items-center justify-between w-full">
            {/* Left: Page Name */}
            <div className="flex-1 text-left min-w-0 pr-1">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight truncate leading-tight">
                {currentNav.label}
              </h2>
            </div>

            {/* Center: Laundelle Logo */}
            <div className="flex items-center justify-center shrink-0 px-2">
              <Image
                src="/Laundelle-Logo-top.svg"
                alt="Laundelle"
                width={95}
                height={22}
                priority
                className="h-5 sm:h-5.5 w-auto object-contain"
              />
            </div>

            {/* Right: Active and Inactive Status & Toggle */}
            <div className="flex-1 flex justify-end items-center pl-1">
              <button
                type="button"
                onClick={handleToggleProcessorActive}
                disabled={togglingActive}
                title={`Station Status: ${processorActive ? 'Active' : 'Inactive'}. Tap to toggle.`}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all cursor-pointer shadow-2xs active:scale-95 ${processorActive
                  ? 'bg-emerald-50 hover:bg-emerald-100/70 border-emerald-200 text-emerald-800'
                  : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-600'
                  }`}
              >
                <span className="relative flex h-2 w-2">
                  {processorActive && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      processorActive ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  ></span>
                </span>
                <span className="text-[10px] font-bold tracking-tight">
                  {processorActive ? 'Active' : 'Inactive'}
                </span>
                <div
                  className={`w-6 h-3.5 rounded-full p-0.5 transition-colors duration-200 ease-in-out flex items-center ${
                    processorActive ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-white shadow-2xs" />
                </div>
              </button>
            </div>
          </div>

          {/* Desktop Topbar Content (hidden md:flex) */}
          <div className="hidden md:flex items-center justify-between w-full">
            {/* Breadcrumbs & Title */}
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <h2 className="text-base lg:text-lg font-bold text-slate-900 tracking-tight truncate">
                  {currentNav.label}
                </h2>
              </div>
            </div>

            {/* Plant Clock & Active Duty Toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleProcessorActive}
                disabled={togglingActive}
                title={`Station Status: ${processorActive ? 'Active (Online)' : 'Offline'}. Click to toggle.`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer shadow-2xs active:scale-95 ${processorActive
                  ? 'bg-emerald-50 hover:bg-emerald-100/70 border-emerald-200 text-emerald-800'
                  : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700'
                  }`}
              >
                <span className="relative flex h-2.5 w-2.5">
                  {processorActive && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${processorActive ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                </span>
                <span className="text-xs font-bold tracking-tight">
                  {togglingActive ? 'Updating...' : (processorActive ? 'Active' : 'Offline')}
                </span>
                <div className={`w-7 h-4 rounded-full p-0.5 transition-colors duration-200 ease-in-out flex items-center ${processorActive ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'
                  }`}>
                  <div className="w-3 h-3 rounded-full bg-white shadow-2xs transform transition-transform" />
                </div>
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Dropdown Menu if open */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white text-slate-800 p-3 space-y-1 border-b border-slate-200 shadow-lg animate-in slide-in-from-top-2 duration-150">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-semibold ${activeTab === item.id ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.count ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-600 text-white">
                    {item.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}

        {/* Workspace Canvas Container */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 lg:p-8">
          {activeTab === 'qr_scan' && <ProcessorQRScanView onNavigateTab={setActiveTab} />}
          {activeTab === 'orders' && <ProcessorOrdersView onNavigateTab={setActiveTab} />}
          {activeTab === 'qc' && <ProcessorQCView onNavigateTab={setActiveTab} />}
          {activeTab === 'history' && <ProcessorHistoryView />}
          {activeTab === 'profile' && <ProcessorProfileView onExitAdmin={onSignOut} userName={userName} />}
        </main>
      </div>

      {/* ─── Mobile Bottom Navigation (Only visible on small phones < md) ─── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 px-2 py-1.5 flex justify-between shadow-lg">
        {navItems.map(({ id, shortLabel, icon: Icon, count }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex-1 flex flex-col items-center justify-center py-1 cursor-pointer transition-all relative"
            >
              <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'
                }`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={`text-[10px] mt-0.5 font-semibold ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                {shortLabel}
              </span>
              {count && count > 0 ? (
                <span className="absolute top-1 right-3 w-4 h-4 bg-blue-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};
