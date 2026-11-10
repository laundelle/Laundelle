'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Calendar,
  MapPin,
  ArrowRight,
  X,
  Copy,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Clock
} from 'lucide-react';
import { Order } from '@laundelle/types';

interface OrderPlacedAnimationModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onTrackOrder: (orderId: string) => void;
  onCancelOrder?: (orderId: string, reason?: string) => void;
}

export const OrderPlacedAnimationModal: React.FC<OrderPlacedAnimationModalProps> = ({
  isOpen,
  order,
  onClose,
  onTrackOrder,
  onCancelOrder,
}) => {
  const [copied, setCopied] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  if (!isOpen || !order) return null;

  const orderTotal = Number(
    order.total ?? (order as any).total_price ?? (order as any).amount ?? 0
  ).toFixed(2);

  const handleCopyId = () => {
    navigator.clipboard.writeText(order.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const otpDigits = String((order as any).pickup_otp || (order as any).pickup_pin || '').split('');

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      {/* ── 90% Clean White Card with 10% Focused Accents ── */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 my-auto text-center space-y-5 animate-in zoom-in-95 duration-200">
        
        {/* Top Header Row: Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ── Status Icon & Main Heading ── */}
        <div className="space-y-3 pt-1">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-100 shadow-2xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Order Confirmed & Paid • £{orderTotal}</span>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Booking Confirmed!
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
              We have scheduled your pickup slot. A professional driver will arrive at your door during the collection window.
            </p>
          </div>
        </div>

        {/* ── Order Details Panel ── */}
        <div className="space-y-3 text-left">
          {/* Order ID Banner */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Order Identifier
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono font-extrabold text-base sm:text-lg text-slate-900">
                  #{order.id}
                </span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer"
                  title="Copy Order ID"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                {copied && <span className="text-[10px] font-bold text-emerald-600">Copied!</span>}
              </div>
            </div>
            <span className="px-2.5 py-1 text-xs font-bold bg-white text-slate-700 rounded-xl border border-slate-200 shadow-2xs">
              Paid Online
            </span>
          </div>

          {/* Pickup Security PIN / OTP (if available) */}
          {otpDigits.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Doorstep Collection PIN (OTP)</span>
                </div>
                <span className="text-[10px] font-medium text-slate-400">Share with driver</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 py-1">
                {otpDigits.map((digit, idx) => (
                  <span
                    key={idx}
                    className="w-9 h-11 bg-white text-slate-900 font-mono font-extrabold text-lg sm:text-xl rounded-xl flex items-center justify-center border border-slate-200 shadow-2xs"
                  >
                    {digit}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Logistics Grid: Pickup slot & Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 font-semibold text-[11px]">
                <Calendar className="w-3.5 h-3.5 text-[#002953]" />
                <span>Pickup Window</span>
              </div>
              <p className="font-extrabold text-slate-900">{order.pickupDate || 'Today'}</p>
              <p className="text-slate-500 font-medium text-[11px]">{order.pickupSlot || '10:00 AM – 12:00 PM'}</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 font-semibold text-[11px]">
                <MapPin className="w-3.5 h-3.5 text-[#002953]" />
                <span>Collection Address</span>
              </div>
              <p className="font-extrabold text-slate-900 truncate" title={order.address}>
                {order.address}
              </p>
              <p className="text-slate-500 font-mono text-[11px]">{order.postcode || ''}</p>
            </div>
          </div>
        </div>

        {/* ── Action Buttons ── */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onTrackOrder(order.id);
              onClose();
            }}
            className="w-full py-3.5 px-5 bg-[#002953] hover:bg-[#002953] active:scale-[0.99] text-white rounded-2xl text-sm font-extrabold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Track Live Journey & Timeline</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {onCancelOrder && (
            <button
              type="button"
              onClick={() => setConfirmCancelOpen(true)}
              className="w-full py-2.5 px-4 text-slate-500 hover:text-red-600 hover:bg-red-50/50 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel This Order</span>
            </button>
          )}

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 pt-1 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>100% Quality Care Guarantee • Live Order Timeline</span>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Immediate Order Cancellation */}
      {confirmCancelOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white text-slate-900 w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl text-center border border-slate-100">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto border border-red-100">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-base">Cancel Order #{order.id}?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                If you placed this order by mistake or no longer need the service, you can cancel it now.
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmCancelOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmCancelOpen(false);
                  if (onCancelOrder) {
                    onCancelOrder(order.id, 'Customer cancelled immediately after order placement');
                  }
                  onClose();
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderPlacedAnimationModal;
