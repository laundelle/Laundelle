import React, { useState, useMemo } from 'react';
import { Calendar, AlertTriangle, Check, X } from 'lucide-react';
import { Order } from '@laundelle/types';
import { getAvailablePickupSlots, formatDateToYyyyMmDd } from '@laundelle/validations';

interface RescheduleCancelModalProps {
  isOpen: boolean;
  order: Order | null;
  mode: 'reschedule' | 'cancel' | 'reschedule_pickup' | 'reschedule_delivery';
  onClose: () => void;
  onConfirmReschedule: (orderId: string, newDate: string, newSlot: string, mode?: string) => void;
  onConfirmCancel: (orderId: string, reason: string) => void;
}

export const RescheduleCancelModal: React.FC<RescheduleCancelModalProps> = ({
  isOpen,
  order,
  mode,
  onClose,
  onConfirmReschedule,
  onConfirmCancel
}) => {
  const [selectedDate, setSelectedDate] = useState('Tomorrow');
  const [selectedSlot, setSelectedSlot] = useState('10:00 AM - 12:00 PM');
  const [cancelReason, setCancelReason] = useState('Schedule change / Not at home');
  const [customReason, setCustomReason] = useState('');

  const isDeliveryReschedule = mode === 'reschedule_delivery';
  const isPickupReschedule = mode === 'reschedule' || mode === 'reschedule_pickup';

  const targetDateIso = useMemo(() => {
    const d = new Date();
    if (selectedDate === 'Tomorrow') d.setDate(d.getDate() + 1);
    else if (selectedDate === 'In 2 Days') d.setDate(d.getDate() + 2);
    else if (selectedDate === 'In 3 Days') d.setDate(d.getDate() + 3);
    else if (selectedDate === 'In 4 Days') d.setDate(d.getDate() + 4);
    return formatDateToYyyyMmDd(d);
  }, [selectedDate]);

  const availableSlots = useMemo(() => {
    return getAvailablePickupSlots(targetDateIso);
  }, [targetDateIso]);

  if (!isOpen || !order) return null;

  const isEligibleToCancel = !['washing', 'drying', 'folding_steaming', 'qc_ready', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'].includes(order.status);
  
  // Delivery can be rescheduled anytime before items are out for delivery
  const isEligibleForDeliveryReschedule = !['out_for_delivery', 'delivery_in_progress', 'delivered', 'completed', 'cancelled'].includes(order.status) && !Boolean(order.delivered_at || order.delivery_pin_verified_at);

  // Pickup can be rescheduled only up to 1 hour before scheduled pickup time
  const isEligibleForPickupReschedule = (() => {
    if (order.status === 'cancelled' || (order as any).isCancelled) return false;
    const hasBeenCollected = [
      'laundry_collected', 'received_at_facility', 'sorting', 'washing', 'in_wash', 'drying',
      'ironing', 'folding', 'quality_check', 'qc_ready', 'ready_for_delivery',
      'delivery_driver_assigned', 'package_collected_for_delivery', 'out_for_delivery', 'delivered', 'completed'
    ].includes(order.status) || Boolean(order.pickup_pin_verified_at || (order as any).pickup_otp_verified_at);
    if (hasBeenCollected) return false;

    try {
      const now = new Date();
      if (order.pickupDate) {
        const slotStart = (order.pickupSlot || order.pickupTime || '10:00 AM').split(/[-–]/)[0].trim();
        const dateObj = new Date(order.pickupDate);
        if (!isNaN(dateObj.getTime())) {
          const timeMatch = slotStart.match(/(\d+):?(\d*)\s*(AM|PM)?/i);
          if (timeMatch) {
            let hours = parseInt(timeMatch[1], 10);
            const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
            const meridian = timeMatch[3]?.toUpperCase();
            if (meridian === 'PM' && hours < 12) hours += 12;
            if (meridian === 'AM' && hours === 12) hours = 0;
            dateObj.setHours(hours, minutes, 0, 0);

            const diffMs = dateObj.getTime() - now.getTime();
            if (diffMs > 0 && diffMs < 60 * 60 * 1000) return false; // Within 1 hour
            if (diffMs <= 0 && dateObj.toDateString() === now.toDateString()) return false;
          }
        }
      }
    } catch {}
    return true;
  })();

  const isEligibleToModify = mode === 'cancel'
    ? isEligibleToCancel
    : isDeliveryReschedule
      ? isEligibleForDeliveryReschedule
      : isEligibleForPickupReschedule;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] sm:max-h-[90vh] overflow-hidden shadow-2xl transition-all border border-gray-100 flex flex-col my-auto">
        {/* Header */}
        <div className={`p-5 sm:p-6 text-white shrink-0 ${mode === 'cancel' ? 'bg-red-600' : 'bg-[#002953]'} relative`}>
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-1 opacity-90">
            {mode === 'cancel' ? <AlertTriangle className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
            <span>
              {mode === 'cancel'
                ? 'Cancel Booking'
                : isDeliveryReschedule
                  ? 'Reschedule Delivery Window'
                  : 'Reschedule Collection Slot'}
            </span>
          </div>
          <h2 className="text-xl font-heading font-extrabold">Order #{order.id}</h2>
          <p className="text-xs opacity-80 mt-0.5">
            {isDeliveryReschedule
              ? `Current Window: ${order.deliveryDate || 'Scheduled Turnaround'} (${order.deliverySlot || 'Standard Delivery'})`
              : `Current Slot: ${order.pickupDate} (${order.pickupSlot})`}
          </p>
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          {!isEligibleToModify ? (
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-2">
              <strong className="block font-bold">Modifications Unavailable</strong>
              <p>
                This order is currently in <strong>{order.statusLabel}</strong>. Because our facility team or driver has already begun processing your items, you cannot reschedule or cancel directly from the app.
              </p>
              <p className="text-[11px] text-amber-700">
                Please contact our 24/7 care hotline at <strong>+44 7700 900888</strong> for manual adjustments.
              </p>
            </div>
          ) : mode !== 'cancel' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  {isDeliveryReschedule ? 'New Delivery Date' : 'New Collection Date'}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['Tomorrow', 'In 2 Days', 'In 3 Days', 'In 4 Days'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDate(d)}
                      className={`p-2.5 sm:p-3 rounded-xl text-[11px] sm:text-xs font-bold border transition-all cursor-pointer ${
                        selectedDate === d
                          ? 'border-[#002953] bg-[#01BEFE]/15 text-[#002953] shadow-xs'
                          : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  {isDeliveryReschedule ? 'New Delivery Time Window' : 'New Time Window'}
                </label>
                <div className="space-y-2">
                  {availableSlots.map(({ slot, disabled, reason }) => (
                    <button
                      key={slot}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedSlot(slot)}
                      className={`w-full p-3 rounded-xl text-xs font-bold border flex items-center justify-between transition-all ${
                        disabled
                          ? 'opacity-40 border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                          : selectedSlot === slot
                          ? 'border-[#002953] bg-[#01BEFE]/15 text-[#002953] shadow-xs cursor-pointer'
                          : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700 cursor-pointer'
                      }`}
                    >
                      <span>{slot}{disabled && reason ? ` (${reason})` : ''}</span>
                      {selectedSlot === slot && !disabled && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => onConfirmReschedule(order.id, selectedDate, selectedSlot, isDeliveryReschedule ? 'reschedule_delivery' : 'reschedule_pickup')}
                  className="w-full bg-[#002953] hover:bg-[#002953] text-white py-3.5 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  {isDeliveryReschedule ? 'Save New Delivery Window' : 'Save New Collection Time'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-red-50 rounded-xl text-xs text-red-800">
                Are you sure you want to cancel this booking? A 100% refund will be credited instantly back to your {order.paymentMethod}.
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Reason for Cancellation
                </label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 focus:outline-hidden"
                >
                  <option value="Schedule change / Not at home">Schedule change / Not at home</option>
                  <option value="Placed order by mistake">Placed order by mistake</option>
                  <option value="Need different service">Need different service</option>
                  <option value="Other">Other reason</option>
                </select>
              </div>

              {cancelReason === 'Other' && (
                <input
                  type="text"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Tell us why..."
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                />
              )}

              <div className="pt-2">
                <button
                  onClick={() => onConfirmCancel(order.id, cancelReason === 'Other' ? customReason : cancelReason)}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-3.5 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  Confirm Full Cancellation
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
