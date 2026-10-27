import React from 'react';
import Image from 'next/image';
import { ShoppingBag, Sparkles, Bell } from 'lucide-react';
import { ActiveTab } from '@laundelle/types';

interface NavbarProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  cartCount: number;
  unreadNotificationsCount: number;
  onOpenCart: () => void;
  onOpenPostcodeModal?: () => void;
  onOpenCustomerAuth: () => void;
  onNavigateRoleLogin?: (role: 'admin' | 'manager' | 'driver' | 'processor') => void;
  customerUser?: { name: string; email: string } | null;
  onOpenSchedulePickup?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onNavigate,
  cartCount,
  unreadNotificationsCount,
  onOpenCart,
  onOpenPostcodeModal: _onOpenPostcodeModal,
  onOpenCustomerAuth,
  onNavigateRoleLogin: _onNavigateRoleLogin,
  customerUser,
  onOpenSchedulePickup: _onOpenSchedulePickup,
}) => {
  const navItems: { tab: ActiveTab; label: string; icon?: React.ReactNode; isAi?: boolean }[] = [
    { tab: 'home', label: 'Home' },
    { tab: 'services', label: 'Services' },
    { tab: 'orders', label: 'Orders' },
    {
      tab: 'assistant',
      label: 'AI Care',
      icon: <Sparkles className="w-3.5 h-3.5 text-[#2f73df]" />,
      isAi: true
    },
    { tab: 'support', label: 'Support' },
    { tab: 'account', label: 'Account' },
  ];

  const navRef = React.useRef<HTMLElement>(null);
  const tabRefs = React.useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const [indicatorStyle, setIndicatorStyle] = React.useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });

  React.useEffect(() => {
    let rafId: number;

    const updateIndicator = () => {
      rafId = requestAnimationFrame(() => {
        const activeEl = tabRefs.current[activeTab];
        const navEl = navRef.current;
        if (activeEl && navEl) {
          const navRect = navEl.getBoundingClientRect();
          const activeRect = activeEl.getBoundingClientRect();

          const left = activeRect.left - navRect.left + 6;
          const width = Math.max(activeRect.width - 12, 16);

          setIndicatorStyle({
            left,
            width,
            opacity: 1,
          });
        } else {
          setIndicatorStyle((prev) => ({ ...prev, opacity: 0 }));
        }
      });
    };

    updateIndicator();
    window.addEventListener('resize', updateIndicator, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateIndicator);
    };
  }, [activeTab]);

  return (
    <header className="sticky top-0 z-50 flex h-16 sm:h-[72px] lg:h-20 min-h-[64px] sm:min-h-[72px] lg:min-h-[80px] items-center justify-between bg-white/95 backdrop-blur-md px-6 sm:px-10 lg:px-[60px] border-b border-gray-100 shadow-xs py-2 sm:py-2.5">
      {/* Brand Logo */}
      <button
        onClick={() => onNavigate('home')}
        className="shrink-0 text-left cursor-pointer group pr-4 lg:pr-8 flex items-center"
        aria-label="Laundelle Home"
      >
        <Image
          src="/Laundelle-Logo-top.svg"
          alt="LAUNDELLE"
          width={220}
          height={32}
          priority
          className="h-7 sm:h-8 lg:h-9 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.02]"
        />
      </button>

      {/* Desktop Navigation Links (Centered - hidden when bottom nav is active) */}
      <nav ref={navRef} className="relative hidden lg:flex flex-1 items-center justify-center gap-2 lg:gap-4 xl:gap-6 text-[15px] lg:text-[16px] text-[#101d38]">
        {navItems.map((item) => {
          const isActive = activeTab === item.tab;
          return (
            <button
              key={item.tab}
              ref={(el) => { tabRefs.current[item.tab] = el; }}
              id={item.tab === 'assistant' ? 'nav-ai-assistant-btn' : undefined}
              onClick={() => onNavigate(item.tab)}
              className={`relative py-2 px-2.5 transition-colors duration-200 flex items-center gap-1.5 cursor-pointer ${isActive
                ? 'text-[#082b78] font-bold'
                : 'text-[#101d38]/80 font-medium hover:text-[#082b78]'
                }`}
            >
              {item.icon && (
                <span className={`transition-colors ${isActive ? 'text-[#082b78]' : ''}`}>
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* Sliding underline indicator */}
        <span
          className="absolute bottom-0 h-[2.5px] bg-[#082b78] rounded-full pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
          style={{
            transform: `translateX(${indicatorStyle.left}px)`,
            width: `${indicatorStyle.width}px`,
            opacity: indicatorStyle.opacity,
            left: 0,
          }}
        />
      </nav>

      {/* Right Action Icons: Only Notification and Cart */}
      <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
        {/* Notifications Icon Button */}
        <button
          onClick={() => (customerUser ? onNavigate('notifications') : onOpenCustomerAuth())}
          className={`relative p-2 sm:p-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'notifications'
            ? 'bg-[#082b78] text-white shadow-sm shadow-[#082b78]/20 ring-2 ring-[#082b78]/20'
            : 'text-[#082b78] hover:bg-gray-100'
            }`}
          title="Notification Center"
          aria-label="Notification Center"
        >
          <Bell className="w-5 h-5" />
          {unreadNotificationsCount > 0 && (
            <span className={`absolute top-1 right-1 w-4 h-4 rounded-full text-white text-[9px] font-extrabold flex items-center justify-center border-2 ${activeTab === 'notifications' ? 'bg-[#2f73df] border-[#082b78]' : 'bg-[#082b78] border-white'
              }`}>
              {unreadNotificationsCount}
            </span>
          )}
        </button>

        {/* Cart Icon */}
        <button
          id="cart-icon"
          onClick={onOpenCart}
          className="relative p-2 sm:p-2.5 rounded-xl text-[#082b78] hover:bg-gray-100 transition-colors cursor-pointer"
          title="Shopping Cart"
          aria-label="Shopping Cart"
        >
          <ShoppingBag className="w-5 h-5" />
          {cartCount > 0 && (
            <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#2f73df] text-white text-[10px] font-extrabold flex items-center justify-center border-2 border-white">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
