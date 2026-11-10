import React, { useState, useEffect } from 'react';
import { Minus, Plus, X, ShoppingBag, ShieldCheck, Check, Info, Shirt, Sparkles, ChevronDown } from 'lucide-react';
import { ServiceItem } from '@laundelle/types';

interface ServiceCustomizeModalProps {
  service: ServiceItem;
  onClose: () => void;
  onAddToCart: (service: ServiceItem, qty: number, option?: string, instructions?: string) => void;
}

const DEFAULT_VARIANTS = [
  { id: 'Light Starch', label: 'Light Starch', type: 'shirt' },
  { id: 'No Starch', label: 'No Starch', type: 'none' },
  { id: 'Hanger Packaging', label: 'Hanger Packaging', type: 'hanger' }
];

export const ServiceCustomizeModal: React.FC<ServiceCustomizeModalProps> = ({ service, onClose, onAddToCart }) => {
  const [modalQty, setModalQty] = useState<number>(1);
  const [selectedOption, setSelectedOption] = useState<string>('Light Starch');
  const [specialInstruction, setSpecialInstruction] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

  useEffect(() => {
    setModalQty(service.minQuantity || 1);
    if (service.washOptions && service.washOptions.length > 0) {
      setSelectedOption(service.washOptions[0]);
    } else {
      setSelectedOption('Light Starch');
    }
    setSpecialInstruction('');
    setDropdownOpen(false);
  }, [service]);

  const unitLabel = service.unit ? service.unit.replace('per ', '') : 'item';
  const totalPrice = service.price * modalQty;

  const handleConfirmAdd = (e: React.MouseEvent<HTMLButtonElement>) => {
    const buttonRect = e.currentTarget.getBoundingClientRect();
    const cartIcon = document.getElementById('cart-icon');

    // Default to bottom-right floating cart location (responsive for mobile & desktop)
    let targetX = window.innerWidth - 44;
    let targetY = window.innerHeight - 90;

    if (cartIcon) {
      const cartRect = cartIcon.getBoundingClientRect();
      targetX = cartRect.left + cartRect.width / 2;
      targetY = cartRect.top + cartRect.height / 2;
    }

    const flyingElement = document.createElement('div');
    flyingElement.className = 'fixed z-[9999] bg-[#002953] border-2 border-[#01BEFE] rounded-full shadow-2xl flex items-center justify-center text-white pointer-events-none';
    flyingElement.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#01BEFE" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';

    flyingElement.style.width = '44px';
    flyingElement.style.height = '44px';
    flyingElement.style.left = `${buttonRect.left + buttonRect.width / 2 - 22}px`;
    flyingElement.style.top = `${buttonRect.top + buttonRect.height / 2 - 22}px`;
    flyingElement.style.transition = 'all 0.85s cubic-bezier(0.25, 1, 0.5, 1)';

    document.body.appendChild(flyingElement);

    void flyingElement.offsetWidth;

    flyingElement.style.left = `${targetX - 22}px`;
    flyingElement.style.top = `${targetY - 22}px`;
    flyingElement.style.transform = 'scale(0.85)';
    flyingElement.style.opacity = '0.95';

    setTimeout(() => {
      if (document.body.contains(flyingElement)) {
        document.body.removeChild(flyingElement);
      }
      onAddToCart(service, modalQty, selectedOption, specialInstruction);
    }, 850);

    onClose();
  };

  const variantsToDisplay =
    service.washOptions && service.washOptions.length >= 3
      ? service.washOptions.slice(0, 3).map((opt) => ({
        id: opt,
        label: opt,
        type: opt.toLowerCase().includes('hanger') ? 'hanger' : opt.toLowerCase().includes('light') ? 'shirt' : 'none'
      }))
      : DEFAULT_VARIANTS;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-[880px] max-h-[85vh] md:max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl p-5 xs:p-6 md:p-9 z-[101] border border-gray-100 animate-in zoom-in-95 duration-200 my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 sm:top-7 sm:right-7 w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors cursor-pointer z-20"
          title="Close"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* =========================================================================
            1. DESKTOP VIEW (Visible on md and larger screens - UNTOUCHED)
        ========================================================================= */}
        <div className="hidden md:grid grid-cols-12 gap-8 lg:gap-10 items-stretch">
          {/* LEFT COLUMN: VISUAL, BADGE & TRUST INFO */}
          <div className="col-span-5 flex flex-col justify-between space-y-4 sm:space-y-5">
            <div>
              {/* Category Pill Badge */}
              <div className="inline-flex items-center gap-2 rounded-lg bg-[#e6f8ff] px-3 py-1.5 text-[11px] sm:text-xs font-bold tracking-wider text-[#01BEFE] uppercase">
                <svg
                  className="w-3.5 h-3.5 text-[#01BEFE]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                </svg>
                <span>{service.categoryLabel || 'WASH & STEAM'}</span>
              </div>

              {/* Service Title */}
              <h2 className="mt-3 font-serif text-2xl sm:text-[32px] font-bold text-navy leading-[1.15] tracking-tight">
                {service.name}
              </h2>

              {/* Service Description */}
              <p className="mt-2 text-xs sm:text-sm text-[#50607a] leading-relaxed">
                {service.description || 'Professional wash with steam iron for a crisp, fresh finish.'}
              </p>
            </div>

            {/* Product Centerpiece Image */}
            <div className="relative w-full h-[180px] sm:h-[220px] flex items-center justify-center py-2">
              <img
                src={service.image}
                alt={service.name}
                className="max-h-full max-w-full object-contain drop-shadow-md rounded-xl transition-transform duration-500 hover:scale-102"
              />
            </div>
            <div className="bg-white border border-gray-200 shadow-2xs rounded-xl px-4 py-3 sm:py-4 sm:px-5">
              <div className="text-3xl sm:text-[36px] font-extrabold text-navy leading-none tracking-tight">
                £{service.price.toFixed(2)} <span className='text-xs sm:text-sm text-gray-400 font-medium mt-1'>per {unitLabel}</span>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: CONFIGURATION & PRICING */}
          <div className="col-span-7 flex flex-col justify-between space-y-4 sm:space-y-5 pl-2">

            {/* Quantity Stepper & Total Row */}
            <div className="grid grid-cols-2 gap-3.5">
              {/* Stepper Card */}
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1.5">
                  Quantity (per {unitLabel})
                </label>
                <div className="flex h-[52px] items-center justify-between border border-gray-200 rounded-xl px-4 bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setModalQty(Math.max(service.minQuantity || 1, modalQty - 1))}
                    className="p-1 text-gray-500 hover:text-navy transition-colors cursor-pointer text-lg font-bold"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-base sm:text-lg font-bold text-navy flex items-center gap-1">
                    {modalQty} <span className="text-xs text-gray-400 font-normal">{unitLabel}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setModalQty(modalQty + 1)}
                    className="p-1 text-gray-500 hover:text-navy transition-colors cursor-pointer text-lg font-bold"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Total Card (Simple and bold) */}
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1.5">
                  Total
                </label>
                <div className="flex h-[52px] flex-col justify-center rounded-xl bg-[#f8fafc] border border-gray-100 px-4">
                  <div className="text-xl sm:text-2xl font-extrabold text-navy leading-tight">
                    £{totalPrice.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Wash Care Variant Selection */}
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-2">
                Wash Care Variant
              </label>
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                {variantsToDisplay.map((variant) => {
                  const isSelected = selectedOption === variant.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => setSelectedOption(variant.id)}
                      className={`relative flex flex-col items-center justify-center p-3 rounded-xl transition-all cursor-pointer text-center min-h-[90px] sm:min-h-[96px] ${isSelected
                        ? 'border-2 border-[#01BEFE] bg-[#f8fafc] shadow-2xs'
                        : 'border border-gray-200 bg-white hover:border-gray-300'
                        }`}
                    >
                      {/* Checkmark Badge for Selected Item */}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-navy flex items-center justify-center text-white">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}

                      {/* Icon */}
                      <div className="w-8 h-8 rounded-full flex items-center justify-center mb-1.5">
                        {variant.type === 'shirt' ? (
                          <div className="w-8 h-8 rounded-full bg-[#e6f8ff] text-[#01BEFE] flex items-center justify-center">
                            <Shirt className="w-4 h-4" />
                          </div>
                        ) : variant.type === 'hanger' ? (
                          <div className="w-8 h-8 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 4a2.5 2.5 0 0 0-2.5 2.5c0 1.2.9 2 2.5 2.5l7.5 5.5H4.5L12 9" />
                              <circle cx="12" cy="6.5" r="0.8" />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-50 text-gray-500 flex items-center justify-center">
                            <Sparkles className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      {/* Label */}
                      <span className={`text-[11px] sm:text-xs font-bold leading-tight ${isSelected ? 'text-[#01BEFE]' : 'text-gray-800'
                        }`}>
                        {variant.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Specific Fabric Note / Instructions */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-gray-800">
                  Specific Fabric Note / Instructions <span className="text-gray-400 font-normal">(optional)</span>
                </label>
              </div>
              <div className="relative">
                <textarea
                  rows={2}
                  maxLength={120}
                  value={specialInstruction}
                  onChange={(e) => setSpecialInstruction(e.target.value)}
                  placeholder="e.g. Mild starch, stain on lapel, cold water only..."
                  className="w-full rounded-xl border border-gray-200 p-3 pb-6 text-xs text-gray-800 placeholder:text-gray-400 focus:border-[#01BEFE] focus:ring-1 focus:ring-[#01BEFE] focus:outline-none resize-none transition-all"
                />
                <span className="absolute bottom-2 right-3 text-[10px] text-gray-400 font-medium select-none">
                  {specialInstruction.length}/120
                </span>
              </div>
            </div>

            {/* Info Callout Note */}
            <div className="rounded-xl bg-[#f8fafc] p-2.5 sm:p-3 flex items-center gap-2 text-xs text-[#01BEFE] border border-[#e2edff]">
              <Info className="w-4 h-4 shrink-0 text-[#01BEFE]" />
              <span className="text-[11px] sm:text-xs leading-tight">
                Our team will follow your instructions carefully.
              </span>
            </div>

            {/* Action Buttons: Cancel & Add to Cart */}
            <div className="pt-1 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center justify-center gap-1.5 h-[50px] px-5 sm:px-6 rounded-xl border border-gray-200 text-xs sm:text-sm font-bold text-navy hover:bg-gray-50 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmAdd}
                className="flex-1 flex items-center justify-center gap-2 h-[50px] px-5 sm:px-6 rounded-xl bg-navy hover:bg-[#002953] text-white text-xs sm:text-sm font-bold shadow-[0_6px_20px_rgba(8,43,120,0.18)] hover:shadow-lg transition-all cursor-pointer active:scale-98"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Add £{totalPrice.toFixed(2)} to Cart</span>
              </button>
            </div>
          </div>
        </div>

        {/* =========================================================================
            2. MOBILE VIEW (Visible ONLY on mobile screens < md - Matches User Mockup)
        ========================================================================= */}
        <div className="block md:hidden space-y-4">
          {/* Top Sheet Drag Indicator Bar */}
          <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto -mt-2 mb-1" />

          {/* Full-width Image Banner above Title with border and margin */}
          <div className="w-full h-[180px] xs:h-[210px] rounded-2xl border border-gray-200 bg-gradient-to-b from-slate-50/90 to-white flex items-center justify-center p-3.5 mt-1 mb-2 shadow-2xs overflow-hidden">
            <img
              src={service.image}
              alt={service.name}
              className="max-h-full max-w-full object-contain drop-shadow-sm transition-transform duration-300 hover:scale-102"
            />
          </div>

          {/* Service Title, Category & Price Header Details */}
          <div className="space-y-1.5 pt-0.5">
            {/* Category Badge */}
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#e6f8ff] px-2.5 py-1 text-[11px] font-bold text-[#01BEFE] uppercase tracking-wide">
              <svg
                className="w-3.5 h-3.5 text-[#01BEFE]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
              </svg>
              <span>{service.categoryLabel || 'WASH & STEAM'}</span>
            </div>

            {/* Service Title */}
            <h2 className="font-serif text-2xl font-bold text-navy leading-tight tracking-tight">
              {service.name}
            </h2>

            {/* Description */}
            <p className="text-xs text-[#50607a] leading-relaxed">
              {service.description || 'Professional wash with steam iron for a crisp, fresh finish.'}
            </p>

            {/* Price */}
            <div className="pt-1 flex items-baseline">
              <span className="text-2xl font-extrabold text-navy font-sans tracking-tight">
                £{service.price.toFixed(2)}
              </span>
              <span className="text-xs text-gray-400 font-medium ml-1">
                / per {unitLabel}
              </span>
            </div>
          </div>

          {/* Quantity Stepper & Total Row */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* Stepper Card */}
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1.5">
                Quantity (per {unitLabel})
              </label>
              <div className="flex h-[52px] items-center justify-between border border-gray-200 rounded-xl px-3.5 bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => setModalQty(Math.max(service.minQuantity || 1, modalQty - 1))}
                  className="p-1 text-gray-500 hover:text-navy cursor-pointer"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-base font-bold text-navy flex items-center gap-1">
                  {modalQty} <span className="text-xs text-gray-400 font-normal">{unitLabel}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setModalQty(modalQty + 1)}
                  className="p-1 text-gray-500 hover:text-navy cursor-pointer"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Total Card */}
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1.5">
                Total
              </label>
              <div className="flex h-[52px] flex-col justify-center rounded-xl bg-[#f8fafc] border border-gray-100 px-4">
                <div className="text-lg font-extrabold text-navy leading-tight">
                  £{totalPrice.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Wash Care Variant Dropdown / Button Selector */}
          <div className="relative pt-1">
            <label className="block text-xs font-bold text-gray-800 mb-1.5">
              Wash Care Variant
            </label>

            {/* Custom Dropdown Trigger Button */}
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full h-[52px] px-3.5 rounded-xl border border-gray-200 bg-white flex items-center justify-between shadow-2xs text-left cursor-pointer hover:border-gray-300 focus:outline-none focus:border-[#01BEFE] focus:ring-1 focus:ring-[#01BEFE] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#e6f8ff] text-[#01BEFE] flex items-center justify-center shrink-0">
                  {variantsToDisplay.find((v) => v.id === selectedOption)?.type === 'shirt' ? (
                    <Shirt className="w-4 h-4" />
                  ) : variantsToDisplay.find((v) => v.id === selectedOption)?.type === 'hanger' ? (
                    <svg className="w-4 h-4 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 4a2.5 2.5 0 0 0-2.5 2.5c0 1.2.9 2 2.5 2.5l7.5 5.5H4.5L12 9" />
                      <circle cx="12" cy="6.5" r="0.8" />
                    </svg>
                  ) : (
                    <Sparkles className="w-4 h-4 text-gray-600" />
                  )}
                </div>
                <div>
                  <span className="text-xs font-bold text-navy block leading-tight">
                    {selectedOption || 'Select Variant'}
                  </span>
                  <span className="text-[10px] text-gray-400 font-medium">
                    Tap to change wash variant
                  </span>
                </div>
              </div>

              <ChevronDown
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180 text-navy' : ''
                  }`}
              />
            </button>

            {/* Dropdown Options Popup */}
            {dropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-gray-200 shadow-xl z-30 p-1.5 space-y-1 animate-in fade-in-50 zoom-in-95 duration-150">
                {variantsToDisplay.map((variant) => {
                  const isSelected = selectedOption === variant.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => {
                        setSelectedOption(variant.id);
                        setDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${isSelected
                        ? 'bg-[#e6f8ff] text-[#01BEFE] font-bold'
                        : 'text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'bg-white text-[#01BEFE]' : 'bg-gray-100 text-gray-500'
                          }`}>
                          {variant.type === 'shirt' ? (
                            <Shirt className="w-3.5 h-3.5" />
                          ) : variant.type === 'hanger' ? (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 4a2.5 2.5 0 0 0-2.5 2.5c0 1.2.9 2 2.5 2.5l7.5 5.5H4.5L12 9" />
                              <circle cx="12" cy="6.5" r="0.8" />
                            </svg>
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <span>{variant.label}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-[#01BEFE] stroke-[2.5]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Specific Fabric Note / Instructions */}
          <div>
            <label className="block text-xs font-bold text-gray-800 mb-1.5">
              Specific Fabric Note / Instructions <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <textarea
                rows={3}
                maxLength={120}
                value={specialInstruction}
                onChange={(e) => setSpecialInstruction(e.target.value)}
                placeholder="e.g. Mild starch, stain on lapel, cold water only..."
                className="w-full rounded-xl border border-gray-200 p-3 pb-6 text-xs text-gray-800 placeholder:text-gray-400 focus:border-[#01BEFE] focus:ring-1 focus:ring-[#01BEFE] focus:outline-none resize-none"
              />
              <span className="absolute bottom-2 right-3 text-[10px] text-gray-400 font-medium select-none">
                {specialInstruction.length}/120
              </span>
            </div>
          </div>

          {/* Info Callout Note */}
          <div className="rounded-xl bg-[#f8fafc] p-2.5 xs:p-3 flex items-center gap-2 text-xs text-[#01BEFE] border border-[#e2edff]">
            <Info className="w-4 h-4 shrink-0 text-[#01BEFE]" />
            <span className="text-[11px] leading-tight">
              Our team will follow your instructions carefully.
            </span>
          </div>

          {/* Stacked Vertical Action Buttons on Mobile */}
          <div className="space-y-2.5 pt-1">
            {/* Cancel Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-full h-12 rounded-xl border border-gray-200 text-sm font-bold text-navy hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>

            {/* Primary Add to Cart Button */}
            <button
              type="button"
              onClick={handleConfirmAdd}
              className="w-full h-12 rounded-xl bg-navy hover:bg-[#002953] text-white text-sm font-bold shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Add £{totalPrice.toFixed(2)} to Cart</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

