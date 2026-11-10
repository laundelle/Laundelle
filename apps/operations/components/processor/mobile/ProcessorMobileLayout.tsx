'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { QrCode, Layers, History, User } from 'lucide-react';
import { MobileProcessorTab } from './types';

interface ProcessorMobileLayoutProps {
  activeTab: MobileProcessorTab;
  onTabChange: (tab: MobileProcessorTab) => void;
  title: string;
  badgeCount?: number;
  children: React.ReactNode;
  userRole?: string;
  hubLocation?: string;
  isStationActive?: boolean;
  onToggleStationActive?: () => void;
}

export const ProcessorMobileLayout: React.FC<ProcessorMobileLayoutProps> = ({
  activeTab,
  onTabChange,
  title,
  badgeCount = 0,
  children,
  userRole = 'Processor',
  hubLocation = 'Preston Central Hub',
  isStationActive: externalActive,
  onToggleStationActive,
}) => {
  const [internalActive, setInternalActive] = useState<boolean>(true);
  const isActive = externalActive !== undefined ? externalActive : internalActive;

  const handleToggle = () => {
    if (onToggleStationActive) {
      onToggleStationActive();
    } else {
      setInternalActive((prev) => !prev);
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-[#111827] flex justify-center items-start antialiased selection:bg-[#00B4D8]/20 font-sans">
      {/* 390x844px Mobile Viewport Container */}
      <div className="w-full max-w-[390px] min-h-screen bg-[#F7F9FC] flex flex-col relative shadow-[0_20px_50px_rgba(3,4,94,0.12)] border-x border-[#E2E8F0]">
        {/* Compact Top Header: Left Page Name, Center Logo, Right Status & Toggle */}
        <header className="sticky top-0 z-40 h-14 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] px-3 sm:px-4 flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          {/* Left: Page Name */}
          <div className="flex-1 text-left min-w-0 pr-1">
            <h1 className="text-xs sm:text-sm font-bold text-[#111827] tracking-tight truncate leading-tight">
              {title}
            </h1>
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

          {/* Right: Active / Inactive Status and Toggle */}
          <div className="flex-1 flex justify-end items-center pl-1">
            <button
              type="button"
              onClick={handleToggle}
              title={`Station Status: ${isActive ? 'Active' : 'Inactive'}. Tap to toggle.`}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all cursor-pointer shadow-2xs active:scale-95 ${
                isActive
                  ? 'bg-emerald-50 hover:bg-emerald-100/70 border-emerald-200 text-emerald-800'
                  : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-600'
              }`}
            >
              <span className="relative flex h-2 w-2">
                {isActive && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isActive ? 'bg-emerald-500' : 'bg-slate-400'
                  }`}
                ></span>
              </span>
              <span className="text-[10px] font-bold tracking-tight">
                {isActive ? 'Active' : 'Inactive'}
              </span>
              <div
                className={`w-6 h-3.5 rounded-full p-0.5 transition-colors duration-200 ease-in-out flex items-center ${
                  isActive ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'
                }`}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-white shadow-2xs" />
              </div>
            </button>
          </div>
        </header>

        {/* Scrollable Main Workspace */}
        <main className="flex-1 px-4 py-4 pb-24 overflow-y-auto">
          {children}
        </main>

        {/* Fixed Shared Bottom Navigation Bar */}
        <nav
          aria-label="Processor Portal Navigation"
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] h-16 bg-white border-t border-[#E2E8F0] px-3 z-40 flex items-center justify-around shadow-[0_-4px_16px_rgba(3,4,94,0.04)]"
        >
          {/* 1. Scan */}
          <button
            type="button"
            onClick={() => onTabChange('scan')}
            className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors cursor-pointer active:scale-95 ${
              activeTab === 'scan' ? 'text-[#03045E]' : 'text-[#64748B] hover:text-[#111827]'
            }`}
          >
            <div
              className={`w-9 h-7 rounded-xl flex items-center justify-center transition-all ${
                activeTab === 'scan' ? 'bg-[#00B4D8]/15 text-[#023E8A]' : 'text-[#64748B]'
              }`}
            >
              <QrCode className="w-5 h-5 stroke-[2]" />
            </div>
            <span className={`text-[10px] font-semibold mt-0.5 ${activeTab === 'scan' ? 'font-bold text-[#03045E]' : ''}`}>
              Scan
            </span>
          </button>

          {/* 2. Orders */}
          <button
            type="button"
            onClick={() => onTabChange('orders')}
            className={`flex-1 flex flex-col items-center justify-center py-1 relative transition-colors cursor-pointer active:scale-95 ${
              activeTab === 'orders' ? 'text-[#03045E]' : 'text-[#64748B] hover:text-[#111827]'
            }`}
          >
            <div
              className={`w-9 h-7 rounded-xl flex items-center justify-center transition-all ${
                activeTab === 'orders' ? 'bg-[#00B4D8]/15 text-[#023E8A]' : 'text-[#64748B]'
              }`}
            >
              <Layers className="w-5 h-5 stroke-[2]" />
            </div>
            <span className={`text-[10px] font-semibold mt-0.5 ${activeTab === 'orders' ? 'font-bold text-[#03045E]' : ''}`}>
              Orders
            </span>
            {badgeCount > 0 && (
              <span className="absolute top-1 right-6 w-4 h-4 rounded-full bg-[#023E8A] text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
                {badgeCount}
              </span>
            )}
          </button>

          {/* 3. History */}
          <button
            type="button"
            onClick={() => onTabChange('history')}
            className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors cursor-pointer active:scale-95 ${
              activeTab === 'history' ? 'text-[#03045E]' : 'text-[#64748B] hover:text-[#111827]'
            }`}
          >
            <div
              className={`w-9 h-7 rounded-xl flex items-center justify-center transition-all ${
                activeTab === 'history' ? 'bg-[#00B4D8]/15 text-[#023E8A]' : 'text-[#64748B]'
              }`}
            >
              <History className="w-5 h-5 stroke-[2]" />
            </div>
            <span className={`text-[10px] font-semibold mt-0.5 ${activeTab === 'history' ? 'font-bold text-[#03045E]' : ''}`}>
              History
            </span>
          </button>
        </nav>
      </div>
    </div>
  );
};

