'use client';

import React from 'react';
import Image from 'next/image';
import { useAuth0 } from '@auth0/auth0-react';
import {
  X,
  Mail,
  ShieldCheck,
  Building2
} from 'lucide-react';
import { LAUNDELLE_IMAGES, getOptimizedImageUrl } from '@laundelle/config';

interface CustomerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: (email: string, name: string, userId?: string) => void;
  onNavigateRoleLogin?: (role: any) => void;
}

export const CustomerAuthModal: React.FC<CustomerAuthModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { loginWithRedirect, isLoading: isAuth0Loading } = useAuth0();

  if (!isOpen) return null;

  // Auth0 Universal Login
  const handleAuth0Login = (connection?: string) => {
    try {
      if (typeof window !== 'undefined') {
        const cartWasOpen = document.querySelector('[data-cart-drawer="open"]');
        if (cartWasOpen) localStorage.setItem('laundelle_open_cart', 'true');
      }
    } catch { }

    const authParams: any = {
      prompt: 'login',
    };
    if (connection) {
      authParams.connection = connection;
    }

    loginWithRedirect({
      appState: {
        returnTo:
          typeof window !== 'undefined' && window.location.pathname !== '/'
            ? window.location.pathname
            : '/home',
      },
      authorizationParams: authParams,
    }).catch(() => {
      // Fallback to default Universal Login if specific connection is not enabled in tenant
      loginWithRedirect({
        appState: {
          returnTo:
            typeof window !== 'undefined' && window.location.pathname !== '/'
              ? window.location.pathname
              : '/home',
        },
        authorizationParams: {
          prompt: 'login',
        },
      });
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-4xl rounded-3xl p-6 sm:p-10 shadow-2xl relative my-auto border border-slate-200 overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 z-20 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full cursor-pointer transition-colors"
          title="Close"
          type="button"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Two-Column Layout */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Left Column: Avatar & Brand Hero */}
          <div className="flex flex-col items-center justify-center text-center">
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 flex items-center justify-center">
              {/* Lifestyle Customer Photo */}
              <Image
                src={getOptimizedImageUrl(LAUNDELLE_IMAGES.customerAuthHero, { width: 640, quality: 'auto', format: 'auto' })}
                alt="Laundelle Laundry Service"
                fill
                sizes="(max-width: 768px) 288px, 320px"
                className="relative z-10 object-contain drop-shadow-md rounded-full"
              />
            </div>
            <div className="mt-4 flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">
              <Building2 className="w-3.5 h-3.5 text-[#01BEFE]" />
              <span>Laundelle Operations Network</span>
            </div>
          </div>

          {/* Right Column: Log in or create an account */}
          <div className="flex flex-col justify-center space-y-4">
            <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-heading font-black text-[#002953] tracking-tight">
                Log in or create an account
              </h2>
              <p className="text-xs text-slate-500">
                Choose your preferred method to continue to Laundelle.
              </p>
            </div>

            {/* Stacked Options */}
            <div className="space-y-3 pt-2">
              {/* 1. Continue with Google */}
              <button
                type="button"
                onClick={() => handleAuth0Login('google-oauth2')}
                disabled={isAuth0Loading}
                className="w-full h-12 sm:h-13 bg-white hover:bg-slate-50 border border-slate-300 hover:border-[#01BEFE] rounded-xl px-5 flex items-center justify-start gap-3.5 text-sm font-semibold text-slate-800 shadow-2xs transition-all cursor-pointer active:scale-99 disabled:opacity-60"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              {/* 2. Continue with Apple */}
              <button
                type="button"
                onClick={() => handleAuth0Login('apple')}
                disabled={isAuth0Loading}
                className="w-full h-12 sm:h-13 bg-white hover:bg-slate-50 border border-slate-300 hover:border-[#01BEFE] rounded-xl px-5 flex items-center justify-start gap-3.5 text-sm font-semibold text-slate-800 shadow-2xs transition-all cursor-pointer active:scale-99 disabled:opacity-60"
              >
                <svg className="w-5 h-5 shrink-0 fill-current text-black" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-2 .6-2.65 1.35-.58.67-1.09 1.74-.95 2.77.99.08 2.05-.51 2.68-1.27z" />
                </svg>
                <span>Continue with Apple</span>
              </button>

              {/* 3. Continue with Facebook */}
              <button
                type="button"
                onClick={() => handleAuth0Login('facebook')}
                disabled={isAuth0Loading}
                className="w-full h-12 sm:h-13 bg-white hover:bg-slate-50 border border-slate-300 hover:border-[#01BEFE] rounded-xl px-5 flex items-center justify-start gap-3.5 text-sm font-semibold text-slate-800 shadow-2xs transition-all cursor-pointer active:scale-99 disabled:opacity-60"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#1877F2"
                    d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
                  />
                </svg>
                <span>Continue with Facebook</span>
              </button>

              {/* 4. Continue with Email (Auth0 Universal Login) */}
              <button
                type="button"
                onClick={() => handleAuth0Login()}
                disabled={isAuth0Loading}
                className="w-full h-12 sm:h-13 bg-white hover:bg-slate-50 border border-slate-300 hover:border-[#01BEFE] rounded-xl px-5 flex items-center justify-start gap-3.5 text-sm font-semibold text-slate-800 shadow-2xs transition-all cursor-pointer active:scale-99 disabled:opacity-60"
              >
                <Mail className="w-5 h-5 text-slate-500 shrink-0" />
                <span>Continue with Email</span>
              </button>
            </div>

            {/* Auth0 Security Footnote */}
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium pt-3 border-t border-slate-100">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Secured by Auth0 Enterprise Identity & Laundelle Cloud</span>
            </div>
          </div>
        </div>

        {/* Decorative Wave structure inside the box */}
        <svg
          className="absolute bottom-0 left-0 w-full h-24 sm:h-32 pointer-events-none z-0"
          viewBox="0 0 1440 200"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            fill="#01BEFE"
            opacity="0.15"
            d="M0,70 C180,170 360,10 540,70
               S900,170 1080,70
               S1260,10 1440,70
               L1440,200 L0,200 Z"
          />
        </svg>
      </div>
    </div>
  );
};

export default CustomerAuthModal;
