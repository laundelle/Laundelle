'use client';

import React, { useState } from 'react';
import {
  MapPin,
  QrCode,
  ScanLine,
  Hash,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface ProcessorMobileScanScreenProps {
  onIntakeSuccess?: (orderId: string) => void;
  onNavigateToOrders?: () => void;
}

type ScanState = 'idle' | 'scanning' | 'detected' | 'verifying' | 'success' | 'error';

export const ProcessorMobileScanScreen: React.FC<ProcessorMobileScanScreenProps> = ({
  onIntakeSuccess,
  onNavigateToOrders,
}) => {
  const [manualCode, setManualCode] = useState('');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [lastIntakedId, setLastIntakedId] = useState<string | null>(null);

  // Simulate scanning or intake verification
  const handleVerifyCode = (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!clean) return;

    setScanState('verifying');
    setErrorMessage('');

    setTimeout(() => {
      // Simulate validation rule
      if (clean.includes('INVALID') || clean === 'ERROR') {
        setScanState('error');
        setErrorMessage('Invalid barcode tag or order not assigned to Preston Central Hub.');
      } else {
        const orderId = clean.startsWith('ORD-') ? clean : `ORD-${clean}`;
        setLastIntakedId(orderId);
        setScanState('success');
        if (onIntakeSuccess) {
          onIntakeSuccess(orderId);
        }
      }
    }, 700);
  };

  const handleSimulateScan = () => {
    setScanState('scanning');
    setTimeout(() => {
      setScanState('detected');
      setTimeout(() => {
        handleVerifyCode('ORD-YTYBJT6Q3ABAG-FJ26A2EY');
      }, 500);
    }, 600);
  };

  const handleReset = () => {
    setScanState('idle');
    setManualCode('');
    setErrorMessage('');
  };

  return (
    <div className="space-y-4">
      {/* 1. Hub Information Card */}
      <div className="rounded-[16px] bg-white border border-[#E2E8F0] p-3.5 flex items-center justify-between shadow-[0_2px_8px_rgba(3,4,94,0.03)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[12px] bg-[#023E8A]/10 text-[#023E8A] flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#111827] leading-tight">
              Preston Central Hub
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Processor workspace • Intake Station #1
            </p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-[#00B4D8]/10 text-[#023E8A] text-[11px] font-semibold tracking-wide border border-[#00B4D8]/20">
          UK-PR1
        </span>
      </div>

      {/* 2. QR Scanning Area (Primary Visual Focus) */}
      <div className="rounded-[18px] bg-white border border-[#E2E8F0] p-5 shadow-[0_2px_12px_rgba(3,4,94,0.04)] text-center relative overflow-hidden">
        {/* State: Success Feedback Banner */}
        {scanState === 'success' ? (
          <div className="py-6 px-2 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-[#16A34A]/10 text-[#16A34A] mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#16A34A] bg-[#16A34A]/10 px-2.5 py-0.5 rounded-full">
                Intake Successful
              </span>
              <h3 className="text-base font-bold text-[#111827] pt-1">
                Order Registered to Facility
              </h3>
              <p className="font-mono text-xs font-semibold text-[#023E8A] bg-[#00B4D8]/10 py-1 px-3 rounded-lg inline-block border border-[#00B4D8]/20">
                {lastIntakedId}
              </p>
            </div>

            <p className="text-xs text-[#64748B] max-w-[280px] mx-auto">
              Bag QR verified. Garments assigned to Sorting &amp; Grading at Preston Central Hub.
            </p>

            <div className="pt-2 space-y-2">
              {onNavigateToOrders && (
                <button
                  type="button"
                  onClick={onNavigateToOrders}
                  className="w-full h-12 rounded-[14px] bg-[#03045E] hover:bg-[#023E8A] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                >
                  <span>View in Active Orders</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handleReset}
                className="w-full h-11 rounded-[14px] border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#64748B] font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Scan Another Bag</span>
              </button>
            </div>
          </div>
        ) : scanState === 'error' ? (
          /* State: Error Feedback Banner */
          <div className="py-6 px-2 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
              <AlertCircle className="w-9 h-9 stroke-[2.2]" />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 bg-rose-100 px-2.5 py-0.5 rounded-full">
                Intake Blocked
              </span>
              <h3 className="text-base font-bold text-[#111827] pt-1">
                Unable to Verify Order
              </h3>
              <p className="text-xs text-rose-700 bg-rose-50 py-1.5 px-3 rounded-lg border border-rose-200">
                {errorMessage || 'Invalid or already-intaken order.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="w-full h-12 rounded-[14px] bg-[#03045E] hover:bg-[#023E8A] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Try Scanning Again</span>
            </button>
          </div>
        ) : (
          /* Main Interactive QR Frame */
          <div className="space-y-4">
            {/* Viewport Frame with Corner Brackets */}
            <div
              onClick={handleSimulateScan}
              title="Click or tap to simulate bag QR intake"
              className="relative w-full h-56 rounded-[16px] bg-[#00B4D8]/5 border-2 border-[#023E8A]/30 flex flex-col items-center justify-center cursor-pointer transition-all hover:border-[#023E8A] hover:bg-[#00B4D8]/10 group"
            >
              {/* Corner Brackets */}
              <div className="absolute top-3 left-3 w-6 h-6 border-t-[3px] border-l-[3px] border-[#023E8A] rounded-tl-[4px]" />
              <div className="absolute top-3 right-3 w-6 h-6 border-t-[3px] border-r-[3px] border-[#023E8A] rounded-tr-[4px]" />
              <div className="absolute bottom-3 left-3 w-6 h-6 border-b-[3px] border-l-[3px] border-[#023E8A] rounded-bl-[4px]" />
              <div className="absolute bottom-3 right-3 w-6 h-6 border-b-[3px] border-r-[3px] border-[#023E8A] rounded-br-[4px]" />

              {/* Dynamic Scanning Laser Beam */}
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-transparent via-[#00B4D8] to-transparent shadow-[0_0_12px_#00B4D8] animate-pulse" />

              {/* Center Icons & Text */}
              <div className="relative z-10 flex flex-col items-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-white text-[#023E8A] shadow-md flex items-center justify-center border border-[#E2E8F0] group-hover:scale-105 transition-transform">
                  {scanState === 'verifying' ? (
                    <Loader2 className="w-6 h-6 animate-spin text-[#023E8A]" />
                  ) : scanState === 'detected' ? (
                    <Sparkles className="w-6 h-6 text-[#16A34A]" />
                  ) : (
                    <ScanLine className="w-6 h-6 stroke-[2.2]" />
                  )}
                </div>

                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-[#111827]">
                    {scanState === 'verifying'
                      ? 'Verifying Order In Hub...'
                      : scanState === 'detected'
                      ? 'QR Detected!'
                      : 'Position bag QR inside frame'}
                  </p>
                  <p className="text-[11px] text-[#64748B]">
                    Scanning starts automatically
                  </p>
                </div>
              </div>

              {/* Quick Tap Prompt */}
              <div className="absolute bottom-2.5 inset-x-0 text-center">
                <span className="text-[10px] font-semibold text-[#023E8A] bg-white/90 px-2.5 py-0.5 rounded-full border border-[#E2E8F0] shadow-2xs">
                  Tap to scan bag tag
                </span>
              </div>
            </div>

            {/* Quick Test Pill */}
            <div className="flex items-center justify-between text-[11px] text-[#64748B] px-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                Auto-detection camera active
              </span>
              <button
                type="button"
                onClick={handleSimulateScan}
                className="font-semibold text-[#023E8A] hover:underline cursor-pointer"
              >
                Sample Scan →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Divider: Subtle "OR" */}
      <div className="relative flex py-1 items-center">
        <div className="flex-grow border-t border-[#E2E8F0]" />
        <span className="flex-shrink mx-3 text-[11px] font-bold text-[#64748B] tracking-wider uppercase">
          OR
        </span>
        <div className="flex-grow border-t border-[#E2E8F0]" />
      </div>

      {/* 4. Manual Intake Section */}
      <div className="rounded-[16px] bg-white border border-[#E2E8F0] p-4 shadow-[0_2px_8px_rgba(3,4,94,0.03)] space-y-3">
        <div className="space-y-1">
          <label
            htmlFor="manual-order-tag"
            className="block text-xs font-semibold text-[#111827]"
          >
            Enter Order ID or Bag Tag
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748B]">
              <Hash className="w-4 h-4" />
            </div>
            <input
              id="manual-order-tag"
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="e.g. ORD-YTYBJT6..."
              className="w-full h-12 pl-9 pr-3 rounded-[12px] bg-[#F7F9FC] border border-[#E2E8F0] text-sm font-mono font-medium text-[#111827] placeholder:text-[#64748B]/60 placeholder:font-sans focus:outline-none focus:border-[#023E8A] focus:bg-white focus:ring-2 focus:ring-[#023E8A]/10 transition-all uppercase"
            />
          </div>
        </div>

        {/* Primary Action Button (48px height) */}
        <button
          type="button"
          disabled={!manualCode.trim() || scanState === 'verifying'}
          onClick={() => handleVerifyCode(manualCode)}
          className="w-full h-12 rounded-[12px] bg-[#03045E] hover:bg-[#023E8A] disabled:opacity-50 disabled:pointer-events-none text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
        >
          {scanState === 'verifying' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verifying Tag...</span>
            </>
          ) : (
            <>
              <QrCode className="w-4 h-4" />
              <span>Verify &amp; Intake</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

