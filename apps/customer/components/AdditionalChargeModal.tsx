import React from 'react';
import { AlertTriangle, Check, X, Scale } from 'lucide-react';
import { AdditionalCharge } from '@laundelle/types';

interface AdditionalChargeModalProps {
  isOpen: boolean;
  orderId: string;
  charge: AdditionalCharge;
  onClose: () => void;
  onAccept: (orderId: string, chargeId: string) => void;
  onReject: (orderId: string, chargeId: string) => void;
}

export const AdditionalChargeModal: React.FC<AdditionalChargeModalProps> = ({
  isOpen,
  orderId,
  charge,
  onClose,
  onAccept,
  onReject
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl transition-all border border-amber-200">
        {/* Header */}
        <div className="bg-amber-600 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 text-xs font-bold text-amber-200 uppercase tracking-wider mb-1">
            <Scale className="w-4 h-4" />
            <span>Order Adjustment Verification</span>
          </div>
          <h2 className="text-xl font-heading font-extrabold">Additional Charge Required</h2>
          <p className="text-xs text-amber-100 mt-1">
            Order #{orderId} — Intake Weigh-in Difference
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Reason Card */}
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-2">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong className="text-xs font-bold text-amber-900 block">
                  Intake Exception Note:
                </strong>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  {charge.reason}
                </p>
              </div>
            </div>
          </div>

          {/* Amount Breakdown Comparison */}
          <div className="bg-gray-50 p-4 rounded-2xl space-y-3 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Original Authorized Amount:</span>
              <span className="font-semibold text-gray-900">£{charge.originalAmount.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-amber-800 font-bold">
              <span>Additional Weight / Care Fee:</span>
              <span>+£{charge.additionalAmount.toFixed(2)}</span>
            </div>

            <div className="border-t border-gray-200 pt-2.5 flex justify-between items-baseline text-sm font-extrabold text-gray-900">
              <span>Updated Total Amount:</span>
              <span className="text-xl text-[#002953]">£{charge.updatedAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Guarantee Note */}
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Per our customer policy, all weight adjustments are weighed on calibrated digital intake scales. No additional funds are debited without your direct authorization.
          </p>

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <button
              onClick={() => onAccept(orderId, charge.id)}
              className="w-full bg-[#002953] hover:bg-[#002953] text-white py-3.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4 text-[#01BEFE]" />
              <span>Accept & Authorize £{charge.additionalAmount.toFixed(2)}</span>
            </button>

            <button
              onClick={() => onReject(orderId, charge.id)}
              className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 py-3 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <X className="w-4 h-4 text-rose-600" />
              <span>Reject Additional Charge</span>
            </button>
            <p className="text-[11px] text-gray-500 text-center leading-normal px-2">
              If rejected, your garments will be safely held in facility storage while our Plant Manager reviews custom resolution options with you.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
