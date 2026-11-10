'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  ArrowRight,
  Home,
  RotateCcw,
  Headphones,
  Copy,
  Check,
  ShieldCheck,
  AlertCircle,
  Loader2
} from 'lucide-react';

export type PaymentStatusProps = {
  status: 'processing' | 'success' | 'failed';
  orderId?: string;
  amount?: number | string;
  currency?: string;
  onViewOrder?: () => void;
  onRetryPayment?: () => void;
  onBack?: () => void;
  onContactSupport?: () => void;
  errorMessage?: string;
};

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  size: number;
  width: number;
  height: number;
  color: string;
  shape: 'rect' | 'circle' | 'strip';
  speed: number;
  delay: number;
  rotation: number;
  drift: number;
  opacity: number;
}

const CONFETTI_COLORS = [
  '#01BEFE', // Blue
  '#01BEFE', // Sky Blue
  '#01BEFE', // Light Blue
  '#93C5FD', // Ice Blue
  '#22C55E', // Green
  '#FACC15', // Yellow
  '#F97316', // Orange
  '#EC4899', // Pink
  '#A855F7', // Purple
];

export const PaymentStatus: React.FC<PaymentStatusProps> = ({
  status,
  orderId,
  amount,
  currency = '£',
  onViewOrder,
  onRetryPayment,
  onBack,
  onContactSupport,
  errorMessage,
}) => {
  const [copied, setCopied] = useState(false);
  const [confettiPieces, setConfettiPieces] = useState<ConfettiPiece[]>([]);
  const isSuccess = status === 'success';
  const isProcessing = status === 'processing';

  // Format amount safely
  const formattedAmount = useMemo(() => {
    if (amount === undefined || amount === null || amount === '') return null;
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return null;
    return `${currency}${num.toFixed(2)}`;
  }, [amount, currency]);

  // Clean Order ID presentation
  const displayOrderId = useMemo(() => {
    if (!orderId) return null;
    return orderId.startsWith('#') ? orderId : `#${orderId}`;
  }, [orderId]);

  const handleCopyId = () => {
    if (!orderId) return;
    try {
      const cleanId = orderId.replace(/^#/, '');
      navigator.clipboard.writeText(cleanId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // Generate confetti on mount for success state (once, cleaned up on unmount)
  useEffect(() => {
    if (!isSuccess) return;

    // Check for prefers-reduced-motion
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mediaQuery.matches) {
        return; // Skip confetti completely if reduced motion is requested
      }
    }

    const pieces: ConfettiPiece[] = Array.from({ length: 90 }).map((_, index) => {
      const shapeType = index % 3 === 0 ? 'circle' : index % 3 === 1 ? 'strip' : 'rect';
      const sizeBase = 7 + Math.random() * 8;
      return {
        id: index,
        x: Math.random() * 100, // percentage 0 - 100
        y: -10 - Math.random() * 20, // initial percentage above screen
        size: sizeBase,
        width: shapeType === 'strip' ? sizeBase * 0.4 : sizeBase,
        height: shapeType === 'strip' ? sizeBase * 2.2 : sizeBase,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        shape: shapeType,
        speed: 2.8 + Math.random() * 2.8, // seconds to fall
        delay: Math.random() * 1.5, // seconds delay
        rotation: 360 + Math.random() * 720 * (Math.random() > 0.5 ? 1 : -1),
        drift: -60 + Math.random() * 120, // horizontal drift in px
        opacity: 0.85 + Math.random() * 0.15,
      };
    });

    setConfettiPieces(pieces);

    // Automatically clean up confetti pieces from DOM after 6.5 seconds
    const cleanupTimer = setTimeout(() => {
      setConfettiPieces([]);
    }, 6500);

    return () => clearTimeout(cleanupTimer);
  }, [isSuccess]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative min-h-[85vh] w-full flex items-center justify-center px-4 py-8 sm:py-14 antialiased overflow-hidden"
    >
      {/* =========================================================================
          EMBEDDED CSS KEYFRAMES (Safe, Self-contained, Supports prefers-reduced-motion)
      ========================================================================= */}
      <style>{`
        @keyframes scaleInCircle {
          0% {
            transform: scale(0.6);
            opacity: 0;
          }
          60% {
            transform: scale(1.08);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes drawStroke {
          0% {
            stroke-dashoffset: 300;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }

        @keyframes drawCheckPath {
          0% {
            stroke-dashoffset: 80;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }

        @keyframes drawXPath {
          0% {
            stroke-dashoffset: 60;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }

        @keyframes floatGentle {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }

        @keyframes confettiFall {
          0% {
            transform: translate3d(0, 0, 0) rotate(0deg);
            opacity: 1;
          }
          85% {
            opacity: 0.9;
          }
          100% {
            transform: translate3d(var(--tw-drift, 40px), 105vh, 0) rotate(var(--tw-rotate, 720deg));
            opacity: 0;
          }
        }

        .animate-icon-entrance {
          animation: scaleInCircle 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .animate-icon-float {
          animation: floatGentle 4s ease-in-out infinite;
        }

        .circle-svg-stroke {
          stroke-dasharray: 300;
          stroke-dashoffset: 300;
          animation: drawStroke 0.85s cubic-bezier(0.65, 0, 0.45, 1) 0.15s forwards;
        }

        .check-svg-stroke {
          stroke-dasharray: 80;
          stroke-dashoffset: 80;
          animation: drawCheckPath 0.55s cubic-bezier(0.65, 0, 0.45, 1) 0.6s forwards;
        }

        .x-svg-stroke-1 {
          stroke-dasharray: 60;
          stroke-dashoffset: 60;
          animation: drawXPath 0.45s cubic-bezier(0.65, 0, 0.45, 1) 0.5s forwards;
        }

        .x-svg-stroke-2 {
          stroke-dasharray: 60;
          stroke-dashoffset: 60;
          animation: drawXPath 0.45s cubic-bezier(0.65, 0, 0.45, 1) 0.65s forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-icon-entrance,
          .animate-icon-float {
            animation: none !important;
            transform: none !important;
          }
          .circle-svg-stroke,
          .check-svg-stroke,
          .x-svg-stroke-1,
          .x-svg-stroke-2 {
            stroke-dashoffset: 0 !important;
            animation: none !important;
          }
        }
      `}</style>

      {/* =========================================================================
          CONFETTI LAYER (Only active for success state, pointer-events-none)
      ========================================================================= */}
      {isSuccess && confettiPieces.length > 0 && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none z-40 overflow-hidden"
        >
          {confettiPieces.map((piece) => (
            <div
              key={piece.id}
              style={{
                position: 'absolute',
                left: `${piece.x}%`,
                top: `${piece.y}px`,
                width: `${piece.width}px`,
                height: `${piece.height}px`,
                backgroundColor: piece.color,
                borderRadius: piece.shape === 'circle' ? '50%' : piece.shape === 'rect' ? '2px' : '1px',
                opacity: piece.opacity,
                animation: `confettiFall ${piece.speed}s linear ${piece.delay}s forwards`,
                transform: `rotate(${piece.rotation}deg)`,
                willChange: 'transform, opacity',
                // Custom CSS variables for drift and rotation
                ['--tw-drift' as any]: `${piece.drift}px`,
                ['--tw-rotate' as any]: `${piece.rotation}deg`,
              }}
            />
          ))}
        </div>
      )}

      {/* =========================================================================
          MAIN PAYMENT RESULT CARD
      ========================================================================= */}
      <div className="relative z-10 w-full max-w-md sm:max-w-lg bg-white rounded-3xl sm:rounded-[36px] border border-slate-100/90 shadow-2xl shadow-blue-950/5 p-6 sm:p-10 text-center transition-all duration-300">
        
        {/* Subtle Ambient Background Glow */}
        <div
          aria-hidden="true"
          className={`absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-40 ${
            isSuccess ? 'bg-[#01BEFE]/30' : isProcessing ? 'bg-sky-400/25' : 'bg-red-400/25'
          }`}
        />

        {/* ─── ANIMATED ICON ────────────────────────────────────────────── */}
        <div className="flex justify-center mb-6 relative">
          <div className="animate-icon-float">
            <div
              className={`animate-icon-entrance relative w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center shadow-lg transition-transform ${
                isSuccess
                  ? 'bg-gradient-to-b from-[#e6f8ff] to-[#dbeafe] text-[#01BEFE] shadow-blue-500/20'
                  : isProcessing
                  ? 'bg-gradient-to-b from-[#f0f9ff] to-[#e0f2fe] text-[#01BEFE] shadow-sky-500/20'
                  : 'bg-gradient-to-b from-[#fef2f2] to-[#fee2e2] text-[#DC2626] shadow-red-500/20'
              }`}
              style={{
                boxShadow: isSuccess
                  ? '0 0 35px rgba(37, 99, 235, 0.22), 0 10px 20px -5px rgba(37, 99, 235, 0.15)'
                  : isProcessing
                  ? '0 0 35px rgba(2, 132, 199, 0.22), 0 10px 20px -5px rgba(2, 132, 199, 0.15)'
                  : '0 0 35px rgba(220, 38, 38, 0.22), 0 10px 20px -5px rgba(220, 38, 38, 0.15)',
              }}
            >
              {isSuccess ? (
                // SVG Animated Success Circle & Checkmark
                <svg
                  className="w-12 h-12 sm:w-14 sm:h-14"
                  viewBox="0 0 100 100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle
                    className="circle-svg-stroke text-[#01BEFE]"
                    cx="50"
                    cy="50"
                    r="44"
                    stroke="currentColor"
                  />
                  <path
                    className="check-svg-stroke text-[#01BEFE]"
                    d="M30 52 L44 66 L70 36"
                    stroke="currentColor"
                  />
                </svg>
              ) : isProcessing ? (
                <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 animate-spin text-[#01BEFE]" />
              ) : (
                // SVG Animated Red Circle & X Strokes
                <svg
                  className="w-12 h-12 sm:w-14 sm:h-14"
                  viewBox="0 0 100 100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle
                    className="circle-svg-stroke text-[#DC2626]"
                    cx="50"
                    cy="50"
                    r="44"
                    stroke="currentColor"
                  />
                  <path
                    className="x-svg-stroke-1 text-[#DC2626]"
                    d="M35 35 L65 65"
                    stroke="currentColor"
                  />
                  <path
                    className="x-svg-stroke-2 text-[#DC2626]"
                    d="M65 35 L35 65"
                    stroke="currentColor"
                  />
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* ─── STATUS BADGE & TITLES ───────────────────────────────────── */}
        <div className="space-y-2 mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold tracking-wider uppercase">
            {isSuccess ? (
              <span className="bg-[#e6f8ff] text-[#01BEFE] px-3 py-1 rounded-full border border-blue-200/60 shadow-xs">
                Payment Complete
              </span>
            ) : isProcessing ? (
              <span className="bg-[#f0f9ff] text-[#01BEFE] px-3 py-1 rounded-full border border-sky-200/60 shadow-xs flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
                Processing Payment
              </span>
            ) : (
              <span className="bg-[#fef2f2] text-[#b91c1c] px-3 py-1 rounded-full border border-red-200/60 shadow-xs">
                Payment Issue
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#002953] tracking-tight font-heading">
            {isSuccess
              ? 'Payment Successful'
              : isProcessing
              ? 'Confirming Your Order'
              : 'Payment Failed'}
          </h1>

          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
            {isSuccess
              ? 'Your payment has been received and your Laundelle booking is confirmed.'
              : isProcessing
              ? 'Stripe received your payment. Awaiting webhook verification to finalize booking...'
              : errorMessage ||
                "We couldn't complete your payment. Your order has not been confirmed."}
          </p>
        </div>

        {/* ─── SUMMARY DETAILS BOX ────────────────────────────────────── */}
        <div className="bg-slate-50/90 rounded-2xl border border-slate-200/70 p-4 sm:p-5 mb-7 text-left space-y-3">
          {displayOrderId && (
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-slate-500 font-medium">Order ID</span>
              <div className="flex items-center gap-1.5 font-mono font-bold text-[#002953]">
                <span>{displayOrderId}</span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="p-1 rounded hover:bg-slate-200/80 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Copy Order ID"
                  aria-label="Copy Order ID"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          )}

          {formattedAmount && (
            <div className="flex items-center justify-between text-xs sm:text-sm pt-2 border-t border-slate-200/60">
              <span className="text-slate-500 font-medium">
                {isSuccess ? 'Amount Paid' : 'Amount'}
              </span>
              <span className="font-extrabold text-slate-900 text-sm sm:text-base">
                {formattedAmount}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs sm:text-sm pt-2 border-t border-slate-200/60">
            <span className="text-slate-500 font-medium">Payment Status</span>
            <div className="flex items-center gap-1.5 font-bold">
              {isSuccess ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-700">Paid</span>
                </>
              ) : isProcessing ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
                  <span className="text-sky-700">Verifying Confirmation</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-red-700">Failed</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ─── ACTION BUTTONS ─────────────────────────────────────────── */}
        <div className="space-y-3">
          {isSuccess ? (
            <>
              {/* Success Primary: View My Order */}
              {onViewOrder && (
                <button
                  type="button"
                  onClick={onViewOrder}
                  className="w-full min-h-[48px] py-3.5 px-6 rounded-2xl bg-[#002953] hover:bg-[#002953] active:scale-[0.99] text-white text-xs sm:text-sm font-bold shadow-md shadow-[#002953]/15 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <span>View My Order</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {/* Success Secondary: Back to Home */}
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="w-full min-h-[46px] py-3 px-6 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Home className="w-4 h-4 text-slate-400" />
                  <span>Back to Home</span>
                </button>
              )}
            </>
          ) : isProcessing ? (
            <div className="w-full py-3.5 px-6 rounded-2xl bg-slate-100 text-slate-500 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-wait">
              <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
              <span>Verifying order confirmation... Please wait</span>
            </div>
          ) : (
            <>
              {/* Failed Primary: Try Payment Again (Laundelle Blue) */}
              {onRetryPayment && (
                <button
                  type="button"
                  onClick={onRetryPayment}
                  className="w-full min-h-[48px] py-3.5 px-6 rounded-2xl bg-[#002953] hover:bg-[#002953] active:scale-[0.99] text-white text-xs sm:text-sm font-bold shadow-md shadow-[#002953]/15 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Try Payment Again</span>
                </button>
              )}

              {/* Failed Secondary: Back to Order / Home */}
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="w-full min-h-[46px] py-3 px-6 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>Back to Order</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* ─── FOOTER CONCIERGE / SUPPORT LINK ────────────────────────── */}
        <div className="mt-7 pt-5 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <Headphones className="w-3.5 h-3.5 text-slate-400" />
          <span>Need assistance?</span>
          <button
            type="button"
            onClick={
              onContactSupport ||
              (() => {
                if (typeof window !== 'undefined') {
                  window.location.href = 'mailto:support@laundelle.co.uk';
                }
              })
            }
            className="text-[#002953] hover:underline font-semibold cursor-pointer"
          >
            Contact Laundelle Concierge
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentStatus;
