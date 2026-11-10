import React, { useState } from 'react';
import { X, Calendar, CheckCircle2 } from 'lucide-react';
import { UserAddress, ServiceItem } from '@laundelle/types';

interface SchedulePickupModalProps {
  isOpen: boolean;
  onClose: () => void;
  addresses: UserAddress[];
  services: ServiceItem[];
  onAddToCartAndOpen: (service: ServiceItem, qty: number) => void;
}

export const SchedulePickupModal: React.FC<SchedulePickupModalProps> = ({
  isOpen,
  onClose,
  addresses,
  services,
  onAddToCartAndOpen,
}) => {
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([services[0]?.id || '']);
  const [weightOrQty, setWeightOrQty] = useState(5);
  const [selectedAddressId, setSelectedAddressId] = useState(addresses[0]?.id || '');
  const [specialNote, setSpecialNote] = useState('');

  if (!isOpen) return null;


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedServiceIds.length > 0) {
      selectedServiceIds.forEach(id => {
        const service = services.find(s => s.id === id);
        if (service) {
          onAddToCartAndOpen(service, weightOrQty);
        }
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-xs" />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg max-h-[85vh] sm:max-h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200 flex flex-col my-auto">
        <div className="p-5 sm:p-6 bg-[#002953] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#01BEFE]/20 rounded-2xl">
              <Calendar className="w-5 h-5 text-[#01BEFE]" />
            </div>
            <div>
              <h3 className="text-base font-bold">Quick Schedule Pickup</h3>
              <p className="text-xs text-white/80">Select service and doorstep pickup location</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          {/* Services Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Services Required</label>
            <div className="space-y-2 max-h-40 overflow-y-auto bg-[#01BEFE]/15/10 p-2 rounded-xl border border-[#01BEFE]/50">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#01BEFE]/15/20 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedServiceIds.includes(s.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedServiceIds([...selectedServiceIds, s.id]);
                      } else {
                        setSelectedServiceIds(selectedServiceIds.filter(id => id !== s.id));
                      }
                    }}
                    className="w-4 h-4 rounded text-[#002953] focus:ring-[#002953] accent-[#002953]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800">{s.name}</p>
                    <p className="text-[10px] text-gray-500 font-bold">£{typeof s.price === 'number' ? s.price.toFixed(2) : s.price} {s.unit} • {s.categoryLabel}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Quantity / Estimated Load */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Estimated Load / Qty (Per Service)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={weightOrQty}
                  onChange={(e) => setWeightOrQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-4 py-3 bg-[#01BEFE]/15/20 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#002953] focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Estimated Base Price</label>
              <div className="px-4 py-3 bg-[#01BEFE]/15 rounded-xl text-xs font-bold text-[#002953] flex items-center justify-between">
                <span>Total</span>
                <span className="font-extrabold">£{(selectedServiceIds.reduce((sum, id) => sum + (services.find(s => s.id === id)?.price || 0), 0) * weightOrQty).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Address Selection */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Pickup Address</label>
            <div className="space-y-2">
              {addresses.map((addr) => (
                <label
                  key={addr.id}
                  className={`p-4 rounded-2xl text-xs flex items-center gap-3 cursor-pointer transition-all ${
                    selectedAddressId === addr.id
                      ? 'bg-[#01BEFE]/15 font-medium shadow-xs ring-1 ring-[#002953]'
                      : 'bg-[#01BEFE]/15/20 hover:bg-gray-100'
                  }`}
                >
                  <input
                    type="radio"
                    name="modal_address"
                    checked={selectedAddressId === addr.id}
                    onChange={() => setSelectedAddressId(addr.id)}
                    className="accent-[#002953]"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-gray-800">{addr.label}</span>
                    <p className="text-[11px] text-gray-500 truncate">{addr.flatNo}, {addr.street}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Care Instructions */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Special Care Instructions (Optional)
            </label>
            <textarea
              rows={2}
              value={specialNote}
              onChange={(e) => setSpecialNote(e.target.value)}
              placeholder="e.g. Please use eco-enzyme detergent, separate whites, or ring doorbell twice."
              className="w-full px-4 py-3 bg-[#01BEFE]/15/20 rounded-xl text-xs focus:ring-2 focus:ring-[#002953] focus:outline-hidden"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-[#002953] hover:bg-[#002953] text-white py-3.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-[#01BEFE]" />
              <span>Proceed to Booking Cart</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
