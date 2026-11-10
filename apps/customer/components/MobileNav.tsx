import React from 'react';
import { Home, Shirt, PackageCheck, User, Sparkles } from 'lucide-react';
import { ActiveTab } from '@laundelle/types';

interface MobileNavProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  cartCount: number;
  isLoggedIn?: boolean;
}

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onNavigate, isLoggedIn: _isLoggedIn }) => {
  const tabs: { tab: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { tab: 'home', label: 'Home', icon: <Home className="w-5 h-5" /> },
    { tab: 'services', label: 'Services', icon: <Shirt className="w-5 h-5" /> },
    { tab: 'assistant', label: 'AI Care', icon: <Sparkles className="w-5 h-5" /> },
    { tab: 'orders', label: 'Orders', icon: <PackageCheck className="w-5 h-5" /> },
    { tab: 'account', label: 'Account', icon: <User className="w-5 h-5" /> },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 px-1 py-1 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-between gap-0.5">
        {tabs.map((t) => {
          const isActive = activeTab === t.tab;
          return (
            <button
              key={t.tab}
              id={t.tab === 'assistant' ? 'mobile-nav-ai-btn' : undefined}
              onClick={() => onNavigate(t.tab)}
              className="flex-1 flex flex-col items-center justify-center py-1 px-0.5 transition-all cursor-pointer group"
            >
              {/* Glass container behind the icon */}
              <div
                className={`p-1.5 sm:p-2 rounded-2xl transition-all duration-200 flex items-center justify-center ${isActive
                  ? 'bg-[#01BEFE]/15 backdrop-blur-md border border-[#01BEFE]/30 shadow-xs scale-105'
                  : 'bg-transparent group-hover:bg-gray-100/50'
                  }`}
              >
                {React.cloneElement(t.icon as React.ReactElement<{ className?: string }>, {
                  className: `w-5 h-5 transition-all duration-200 ${isActive
                    ? 'fill-current text-[#01BEFE]'
                    : 'fill-none text-gray-500 group-hover:text-[#002953]'
                    }`,
                })}
              </div>

              {/* Label */}
              <span
                className={`text-[10px] mt-1 tracking-tight leading-none truncate w-full text-center transition-colors font-sans ${isActive ? 'text-[#002953] font-semibold' : 'text-gray-500 font-medium'
                  }`}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
