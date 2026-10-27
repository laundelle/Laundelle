'use client';

import React, { useState, useEffect } from 'react';
import {
  Star,
  X,
  Check,
  CheckCircle2,
  Package,
  Calendar,
  Clock,
  MapPin,
  Truck,
  Sparkles,
  ShoppingBag,
  CreditCard,
  MessageSquare,
  ThumbsUp,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Order } from '@laundelle/types';
import { dbSubmitOrderRating } from '@laundelle/api-client';

interface OrderRatingModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onRatingSubmitted?: (orderId: string, rating?: number | null, feedback?: string) => void;
}

const RATING_LABELS: Record<number, { label: string; desc: string; emoji: string }> = {
  1: { label: 'Poor', desc: 'Needs serious improvement', emoji: '😞' },
  2: { label: 'Fair', desc: 'Below expectations', emoji: '😐' },
  3: { label: 'Good', desc: 'Satisfactory service', emoji: '🙂' },
  4: { label: 'Very Good', desc: 'High quality & on time', emoji: '😊' },
  5: { label: 'Excellent', desc: 'Flawless laundry & experience!', emoji: '🤩' },
};

const QUICK_TAGS = [
  '✨ Clothes smell amazing',
  '⚡ Rapid on-time delivery',
  '👔 Crisp ironing & folding',
  '🤝 Friendly delivery driver',
  '🌿 Gentle on fabrics',
  '📦 Beautiful packaging',
];

export const OrderRatingModal: React.FC<OrderRatingModalProps> = ({
  isOpen,
  order,
  onClose,
  onRatingSubmitted,
}) => {
  const [selectedStars, setSelectedStars] = useState<number | null>(() => {
    return (order?.rating || order?.customerRating?.rating) ?? 5;
  });
  const [hoveredStars, setHoveredStars] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState<string>(() => {
    return order?.ratingFeedback || order?.customerRating?.feedback || '';
  });
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [showFullOrderDetails, setShowFullOrderDetails] = useState<boolean>(false);

  useEffect(() => {
    if (order) {
      const existingScore = (order.rating || order.customerRating?.rating) ?? 5;
      setSelectedStars(existingScore);
      setFeedbackText(order.ratingFeedback || order.customerRating?.feedback || '');
      setSubmitted(false);
    }
  }, [order]);

  if (!isOpen || !order) return null;

  const orderId = order.publicId || order.orderNumber || order.id || (order as any)._id || 'Order';
  const effectiveStars = hoveredStars !== null ? hoveredStars : selectedStars;

  const handleStarCheckboxClick = (starIndex: number) => {
    if (selectedStars === starIndex) {
      // Toggle off if already clicked (since not mandatory)
      setSelectedStars(null);
    } else {
      setSelectedStars(starIndex);
    }
  };

  const handleToggleTag = (tag: string) => {
    const cleanTag = tag.replace(/^[^\w\s]+\s*/, '');
    if (feedbackText.includes(cleanTag)) {
      setFeedbackText((prev) =>
        prev
          .replace(cleanTag, '')
          .replace(/,\s*,/g, ',')
          .trim()
      );
    } else {
      setFeedbackText((prev) => {
        const trimmed = prev.trim();
        if (!trimmed) return cleanTag;
        if (trimmed.endsWith('.') || trimmed.endsWith('!')) return `${trimmed} ${cleanTag}.`;
        return `${trimmed}, ${cleanTag}`;
      });
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await dbSubmitOrderRating(order.id, selectedStars, feedbackText);
      if (res.success) {
        setSubmitted(true);
        if (onRatingSubmitted) {
          onRatingSubmitted(order.id, selectedStars, feedbackText);
        }
        setTimeout(() => {
          onClose();
        }, 1600);
      } else {
        alert(res.error || 'Failed to submit rating. Please try again.');
      }
    } catch (err: any) {
      alert(err.message || 'Error submitting feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    try {
      if (typeof window !== 'undefined' && order.id) {
        sessionStorage.setItem(`laundelle_dismissed_rating_${order.id}`, 'true');
      }
    } catch {
      // ignore
    }
    onClose();
  };

  const formatCurrency = (val: any) => {
    const num = Number(val);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  const itemsCount = (order.items || []).reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);
  const itemsSubtotal = Number(order.total ?? (order as any).total_price ?? (order as any).amount ?? 0);
  const additionalAmount = order.additionalCharge?.status === 'paid' ? Number(order.additionalCharge.additionalAmount || 0) : 0;
  const grandTotal = itemsSubtotal + additionalAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rating-modal-title"
      >
        {/* Top Header Banner */}
        <div className="relative bg-gradient-to-r from-[#0d2259] via-[#102e78] to-[#1e4ab8] text-white px-5 sm:px-7 py-5 shrink-0 overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-10 -translate-y-6 w-36 h-36 bg-blue-400/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between gap-3 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 text-emerald-300 shadow-inner">
                <CheckCircle2 className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                    Order Completed
                  </span>
                  <span className="text-xs sm:text-sm font-mono text-blue-200 font-semibold">
                    #{orderId}
                  </span>
                </div>
                <h2 id="rating-modal-title" className="text-lg sm:text-xl font-bold font-heading text-white mt-0.5">
                  How was your experience?
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSkip}
              className="p-2 rounded-full text-blue-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
          {submitted ? (
            <div className="py-12 px-4 text-center space-y-4 animate-in fade-in zoom-in-95 duration-300">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-sm">
                <Sparkles className="w-8 h-8 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-900">Thank You For Your Feedback!</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Your rating and comments have been shared directly with our Operations Manager and Executive Team.
                </p>
              </div>
              {selectedStars && (
                <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-bold text-sm">
                  <div className="flex text-amber-400">
                    {Array.from({ length: selectedStars }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-current" />
                    ))}
                  </div>
                  <span>{RATING_LABELS[selectedStars]?.label}</span>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Star Rating Section with Checkbox Functionality */}
              <div className="bg-slate-50/80 rounded-2xl p-4 sm:p-5 border border-slate-200/80 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span>Rate Your Order (1 - 5 Stars)</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Check your rating level. Ratings and feedback are completely optional.
                    </p>
                  </div>
                  {effectiveStars ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-amber-200 shadow-2xs text-xs font-bold text-amber-800 self-start sm:self-auto">
                      <span>{RATING_LABELS[effectiveStars]?.emoji}</span>
                      <span>{effectiveStars} / 5 Stars — {RATING_LABELS[effectiveStars]?.label}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No stars checked</span>
                  )}
                </div>

                {/* 5 Stars with Checkbox-style Interactive Controls */}
                <div className="grid grid-cols-5 gap-2 sm:gap-3 pt-1">
                  {[1, 2, 3, 4, 5].map((starIndex) => {
                    const isChecked = selectedStars !== null && starIndex <= selectedStars;
                    const isHovered = hoveredStars !== null && starIndex <= hoveredStars;
                    const isActive = isHovered || isChecked;

                    return (
                      <button
                        key={starIndex}
                        type="button"
                        onClick={() => handleStarCheckboxClick(starIndex)}
                        onMouseEnter={() => setHoveredStars(starIndex)}
                        onMouseLeave={() => setHoveredStars(null)}
                        className={`group relative flex flex-col items-center justify-center p-2.5 sm:p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${isActive
                            ? 'bg-amber-50/90 border-amber-300 shadow-xs scale-[1.02]'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        title={`${starIndex} Star${starIndex > 1 ? 's' : ''} (${RATING_LABELS[starIndex].label})`}
                      >
                        {/* Custom Checkbox indicator inside the star card */}
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center mb-1.5 transition-all text-[10px] ${isChecked
                              ? 'bg-amber-500 border-amber-500 text-white shadow-2xs'
                              : 'border-slate-300 bg-white group-hover:border-slate-400'
                            }`}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>

                        {/* Star Icon */}
                        <Star
                          className={`w-6 h-6 sm:w-7 sm:h-7 transition-all ${isActive
                              ? 'text-amber-400 fill-amber-400 drop-shadow-xs scale-110'
                              : 'text-slate-300 fill-transparent group-hover:text-amber-200'
                            }`}
                        />

                        {/* Star label & number */}
                        <span className={`text-[11px] sm:text-xs font-bold mt-1.5 ${isActive ? 'text-amber-900' : 'text-slate-500'}`}>
                          {starIndex} ★
                        </span>
                        <span className="hidden sm:block text-[9px] text-slate-400 truncate max-w-full font-medium">
                          {RATING_LABELS[starIndex].label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Feedback Input Box */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="order-feedback" className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-[#102e78]" />
                    <span>Customer Feedback (Optional)</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {feedbackText.length}/500 chars
                  </span>
                </div>

                {/* Quick Feedback Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TAGS.map((tag) => {
                    const clean = tag.replace(/^[^\w\s]+\s*/, '');
                    const isSelected = feedbackText.includes(clean);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleTag(tag)}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all cursor-pointer ${isSelected
                            ? 'bg-blue-50 border-blue-300 text-[#102e78] font-bold shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>

                <div className="relative">
                  <textarea
                    id="order-feedback"
                    rows={3}
                    maxLength={500}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Tell us about the wash quality, driver delivery, packaging, or any suggestions you have..."
                    className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#102e78]/20 focus:border-[#102e78] transition-all bg-white"
                  />
                </div>
              </div>

              {/* Complete Order Details Accordion / Summary Card */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => setShowFullOrderDetails(!showFullOrderDetails)}
                  className="w-full flex items-center justify-between p-4 bg-slate-50/70 hover:bg-slate-100/70 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#102e78] flex items-center justify-center">
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Order Details & Items Summary
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {itemsCount} {itemsCount === 1 ? 'item' : 'items'} • Total Paid £{formatCurrency(grandTotal)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-semibold text-[#102e78]">
                    <span>{showFullOrderDetails ? 'Hide' : 'View Full Details'}</span>
                    {showFullOrderDetails ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </button>

                {showFullOrderDetails && (
                  <div className="p-4 sm:p-5 space-y-4 border-t border-slate-100 text-xs animate-in fade-in duration-200">
                    {/* Order Metadata Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-slate-50 text-[11px]">
                      <div>
                        <span className="text-slate-400 block">Order ID</span>
                        <span className="font-mono font-bold text-slate-800">#{orderId}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Status</span>
                        <span className="font-bold text-emerald-700">Delivered</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Placed Date</span>
                        <span className="font-medium text-slate-800">
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Payment Method</span>
                        <span className="font-medium text-slate-800">{order.paymentMethod || 'Online Card'}</span>
                      </div>
                    </div>

                    {/* Schedule & Addresses */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl border border-slate-100 bg-white space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
                          <Calendar className="w-3.5 h-3.5 text-[#102e78]" />
                          <span>Collection / Pickup</span>
                        </div>
                        <p className="text-slate-600 font-medium">
                          {order.pickupDate || 'Scheduled date'} • {order.pickupSlot || order.pickupTime || 'Standard Slot'}
                        </p>
                        <p className="text-slate-400 text-[10px] truncate">
                          {order.addressLabel || order.address || 'Address registered'}
                        </p>
                      </div>

                      <div className="p-3 rounded-xl border border-slate-100 bg-white space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
                          <Truck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Delivery at Doorstep</span>
                        </div>
                        <p className="text-slate-600 font-medium">
                          {order.deliveryDate || 'Scheduled date'} • {order.deliverySlot || order.deliveryTime || 'Standard Slot'}
                        </p>
                        <p className="text-slate-400 text-[10px] truncate">
                          {order.address || order.addressLabel || 'Address registered'}
                        </p>
                      </div>
                    </div>

                    {/* Assigned Driver (if any) */}
                    {order.driver && (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-[11px]">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#102e78] text-white flex items-center justify-center font-bold text-[10px]">
                            {order.driver.name ? order.driver.name[0] : 'D'}
                          </div>
                          <div>
                            <span className="font-bold text-slate-800 block">Driver: {order.driver.name}</span>
                            <span className="text-slate-500 text-[10px]">{order.driver.vehicle || 'Delivery Van'}</span>
                          </div>
                        </div>
                        {order.driver.rating && (
                          <div className="flex items-center gap-1 text-amber-500 font-bold">
                            <Star className="w-3.5 h-3.5 fill-current" />
                            <span>{order.driver.rating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Items List */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-700 block">Garments & Services:</span>
                      <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50">
                        {(order.items || []).map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 text-[11px]">
                            <div>
                              <span className="font-semibold text-slate-800 block">{item.name}</span>
                              {item.selectedOption && (
                                <span className="text-[10px] text-slate-400">{item.selectedOption}</span>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-slate-800">
                                £{(Number(item.quantity || 1) * Number(item.price || 0)).toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                {item.quantity} x £{Number(item.price || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Price Breakdown */}
                    <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px]">
                      <div className="flex justify-between text-slate-500">
                        <span>Items Subtotal</span>
                        <span>£{formatCurrency(itemsSubtotal)}</span>
                      </div>
                      {order.additionalCharge?.status === 'paid' && (
                        <div className="flex justify-between text-amber-700 font-medium">
                          <span>Additional Weight Charge</span>
                          <span>+£{formatCurrency(order.additionalCharge.additionalAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-500">
                        <span>Collection & Delivery</span>
                        <span className="text-emerald-600 font-bold">FREE</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900 text-xs pt-1 border-t border-slate-100">
                        <span>Total Paid</span>
                        <span className="text-[#102e78]">£{formatCurrency(grandTotal)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer Controls */}
        {!submitted && (
          <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={handleSkip}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-200/60 text-slate-700 text-xs font-bold transition-colors cursor-pointer text-center"
            >
              Maybe Later
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#102e78] to-[#1e4ab8] hover:from-[#0c235c] hover:to-[#15388F] text-white text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <ThumbsUp className="w-3.5 h-3.5" />
                  <span>Submit Rating & Feedback</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
